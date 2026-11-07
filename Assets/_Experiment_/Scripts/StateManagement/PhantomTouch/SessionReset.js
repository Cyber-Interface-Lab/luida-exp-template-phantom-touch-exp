const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            sr_idle();
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            sr_endBegin();
        } }
    ]
};

const duringStateActions = {
};

const stateExitActions = {
};


function Update(deltaTime) {
    sr_tick(deltaTime);
}

// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: SessionReset (next participant in the same space) ----
// Scripts run only while someone is in the space, so the reset runs when the NEXT player joins and finds End
// with the previous participant gone. Phases: idle -> end -> (reset) -> settle -> pm -> idle.
// Each step waits for confirmation and never advances on a timeout. Enrollment stays blocked by construction
// until ParticipantManager has finished its own reset (the last step: ParticipantManager enrolls only while
// isParticipantsEnough is false, and its reset clears that flag last). 'luida_reset_ack' is a completion notice;
// Start (sr_idle) also ends the wait, because Start can only follow a completed ParticipantManager reset.
// Upload success is not verified (decision 2026-11-06): SR_MIN_END_SEC only lets the existing uploader issue
// End's request under the old sessionID before anything is reset.
const SR_END_ID = 11;
const SR_POLL_SEC = 0.5;
const SR_MIN_END_SEC = 5;     // script time since End began (End's upload is issued 1 s after End begins)
const SR_RESEND_SEC = 2;      // re-send while unconfirmed (the handlers are idempotent per token)
const SR_ALERT_SEC = 15;      // show an error on the instruction board after this long without confirmation

function sr_status(extra) {   // read by Instruction (same group) for the waiting / error texts
  $.groupState.luida_resetStatus = Object.assign({ phase: $.state.sr_phase || 'idle', token: $.state.sr_token || null }, extra || {});
}
function sr_phase(p) { $.state.sr_phase = p; $.state.sr_phaseSec = 0; $.state.sr_lastSend = -1e9; sr_status(); }
function sr_idle() { sr_phase('idle'); $.state.sr_pmAck = false; }
function sr_endBegin() { sr_phase('end'); $.state.sr_pollIn = 0; }
function sr_prevGone() { const p = PARTICIPANTS[1]; return !!p && !p.exists(); }
function sr_someoneHere() { return $.getPlayersNear($.getPosition(), Infinity).length > 0; }
function sr_globalsReset() {
  return $.getStateCompat('global', 'state_currentID', 'integer') === 0
      && $.getStateCompat('global', 'exp_trialID', 'integer') === 0
      && $.getStateCompat('global', 'exp_readyToLeaveTrials', 'boolean') === false
      && $.getStateCompat('global', 'exp_arePlayersEnough', 'boolean') === false;
}
function sr_send(id, msg, arg) {
  try {
    const h = $.worldItemReference(id);
    if (!h) { $.log('[SessionReset] missing world item reference: ' + id); return false; }
    h.send(msg, arg || {});
    return true;
  } catch (e) { $.log('[SessionReset] send ' + id + '/' + msg + ': ' + e); return false; }
}
function sr_due() {           // rate-limits the re-sends
  if ($.state.sr_phaseSec - $.state.sr_lastSend < SR_RESEND_SEC) return false;
  $.state.sr_lastSend = $.state.sr_phaseSec;
  return true;
}
function sr_startReset() {
  $.state.sr_token = ($.groupState.sessionID || 'none') + ':' + Date.now();
  $.state.sr_pmAck = false;
  $.log('[SessionReset] previous participant left after End; resetting for the next participant, token=' + $.state.sr_token);
  $.sendSignalCompat('this', 'exp_sessionReset');   // GlobalLogic x5 (see the builder)
  $.groupState.participants = [];
  $.groupState.collectedData = {};
  sr_send('NPC', 'npc_hide');
  sr_send('ConditionManager', 'luida_reset', { token: $.state.sr_token });
  sr_phase('settle');
  $.state.sr_lastSend = 0;    // the first re-send comes SR_RESEND_SEC after the first send
}
function sr_tick(dt) {
  const phase = $.state.sr_phase || 'idle';
  if (phase === 'idle') return;
  $.state.sr_phaseSec = ($.state.sr_phaseSec || 0) + dt;
  $.state.sr_pollIn = ($.state.sr_pollIn || 0) - dt;
  if ($.state.sr_pollIn > 0) return;
  $.state.sr_pollIn = SR_POLL_SEC;
  if (phase === 'end') {
    if ($.getStateCompat('global', 'state_currentID', 'integer') !== SR_END_ID) return;
    if ($.state.sr_phaseSec < SR_MIN_END_SEC) return;
    if (!sr_prevGone() || !sr_someoneHere()) return;
    sr_startReset();
  } else if (phase === 'settle') {
    const acked = $.groupState.luida_resetAck === $.state.sr_token;
    if (acked && sr_globalsReset()) {
      $.log('[SessionReset] Globals and ConditionManager reset; resetting ParticipantManager');
      sr_phase('pm');
      sr_send('ParticipantManager', 'luida_reset', { token: $.state.sr_token });
      $.state.sr_lastSend = 0;
      return;
    }
    if (sr_due()) {
      if (!sr_globalsReset()) { $.log('[SessionReset] Globals not reset yet; re-sending'); $.sendSignalCompat('this', 'exp_sessionReset'); }
      if (!acked) { $.log('[SessionReset] ConditionManager not reset yet; re-sending'); sr_send('ConditionManager', 'luida_reset', { token: $.state.sr_token }); }
    }
    if ($.state.sr_phaseSec >= SR_ALERT_SEC) sr_status({ error: 'reset' });
  } else if (phase === 'pm') {
    if ($.state.sr_pmAck) { $.log('[SessionReset] done; ParticipantManager reset acknowledged'); sr_idle(); return; }
    if (sr_due()) { $.log('[SessionReset] ParticipantManager not reset yet; re-sending'); sr_send('ParticipantManager', 'luida_reset', { token: $.state.sr_token }); }
    if ($.state.sr_phaseSec >= SR_ALERT_SEC) sr_status({ error: 'reset' });
  }
}
$.onReceive((messageType, arg) => {
  if (messageType === 'luida_reset_ack' && arg && arg.token === $.state.sr_token) {
    $.state.sr_pmAck = true;
    $.log('[SessionReset] ParticipantManager reset acknowledged, new sID=' + arg.sessionID);
  }
});