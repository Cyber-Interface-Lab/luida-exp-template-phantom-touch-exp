const stateEnterActions = {
    2: [
        { type: "sleep", value: 0.5 },
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              PARTICIPANTS[1].setPosition(new Vector3(0, 0, -2));
            }
        } },
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              PARTICIPANTS[1].setRotation(new Quaternion().setFromEulerAngles(new Vector3(0, 0, 0)));
            }
        } },
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              $.worldItemReference('NPC').send('npc_setup', { social: CONDITION['social'] === 'with' });
              $.worldItemReference('NPC').send('npc_hide', {});
            }
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              $.worldItemReference('NPC').send('npc_show', { social: CONDITION['social'] === 'with' });
              $.worldItemReference('NPC').send('npc_greeting_begin', { social: CONDITION['social'] === 'with' });
            } else {
              ToNextState();
            }
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            nd_arm();
            $.state.nd_touchStartTs = Date.now();
            SendDataToCollector('trialStartTs', $.state.nd_touchStartTs);
            SendDataToCollector('npcTimeout', false);
            $.worldItemReference('NPC').send('npc_trial_start', {
              block: CONDITION['block'], rep: CONDITION['rep'],
              avatar: nd_avatarForBlock(CONDITION['block']), social: CONDITION['social'] === 'with' });
        } }
    ],
    6: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] !== '2') ToNextState();
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            $.sendSignalCompat('this', 'exp_uploadCustomData');
        } }
    ]
};

const duringStateActions = {
    4: [
        { type: "exec", action: (deltaTime) => {
            if (nd_donePulse()) { ToNextState(); }
            else if ($.state.nd_touchStartTs && Date.now() - $.state.nd_touchStartTs > 120000) {
              $.log('[NpcDirector] NPC did not finish within 120 s; moving on');
              SendDataToCollector('npcTimeout', true);
              $.worldItemReference('NPC').send('npc_abort', {});
              $.state.nd_touchStartTs = 0;
              ToNextState();
            }
        } }
    ]
};

const stateExitActions = {
    3: [
        { type: "exec", action: (deltaTime) => {
            $.worldItemReference('NPC').send('npc_greeting_end', {});
        } }
    ]
};


// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: NpcDirector helpers (shared by the actions above) ----
function nd_avatarForBlock(block) {
  const dailyFirst = CONDITION && CONDITION['order'] === 'daily_first';
  return (dailyFirst === (String(block) === '1')) ? 'daily' : 'assigned';
}
function nd_signalTime(key) {
  const d = $.getStateCompat('global', key, 'signal');
  if (!d) return 0;
  return (typeof d.getTime === 'function') ? d.getTime() : (Number(d) || 0);
}
// Remember the current timestamp of the global signal so only a NEW pulse counts.
function nd_arm() { $.state.nd_lastDone = nd_signalTime('npc_done'); }
function nd_donePulse() {
  const t = nd_signalTime('npc_done');
  if (t !== ($.state.nd_lastDone || 0)) { $.state.nd_lastDone = t; return t !== 0; }
  return false;
}