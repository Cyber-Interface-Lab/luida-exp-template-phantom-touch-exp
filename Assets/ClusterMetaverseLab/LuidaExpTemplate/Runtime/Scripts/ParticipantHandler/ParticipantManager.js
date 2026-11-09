const REJECTION_GATE_POS = new Vector3(-100, 100, -100);

function enqueueRejection(idfc, reason) {
    $.log("Rejected " + idfc + ": " + (reason || "unknown"));
    $.groupState.participants = $.groupState.participants.filter(
        p => p.idfc !== idfc
    );
    $.state.participantIdfcs = ($.state.participantIdfcs || []).filter(k => k !== idfc);
    $.state.participantsEnvInfo = $.state.participantsEnvInfo.filter(
        info => info.idfc !== idfc
    );
    let cleanedIdfc2userId = { ...$.state.idfc2userId };
    delete cleanedIdfc2userId[idfc];
    $.state.idfc2userId = cleanedIdfc2userId;
    $.state.rejectionQueue = [...$.state.rejectionQueue, { idfc: idfc }];
}

$.onStart(() => {
  // Diagnostic: surfaces what was actually baked into the uploaded world.
  // If isTestMode is true on a non-test deployment, the upload pipeline
  // didn't flip it and platform/eligibility checks are silently skipped.
  $.log("LUIDA boot: isTestMode=" + isTestMode
        + " expID=" + (typeof expID !== "undefined" ? expID : null)
        + " pNum=" + (typeof pNum !== "undefined" ? pNum : null));

  $.state.betweenSubjectsConfig = [];  // populated by ConditionManager message (sent once per space)
  initSession();

  // Place world gate at remote position and keep it enabled
  $.subNode("WorldGateToLuidaBar").setPosition(REJECTION_GATE_POS);
  $.subNode("WorldGateToLuidaBar").setEnabled(false);
})

// Per-participant session state. Runs at space start and again on "luida_reset" (a world that lets the next
// participant start in the same space after End). betweenSubjectsConfig is kept.
function initSession() {
  $.state.isBetweenSubjectsConditionsSet = false;
  $.groupState.sessionID = Date.now() + "_" +  (Math.random() + 1).toString(36).substring(2, 8);
  $.groupState.participants = []; // array of PlayerHandle who are currently in the experiment
  $.groupState.qCompletedCount = 0;
  $.state.participantsEnvInfo = [];
  $.state.idfc2userId = {};
  $.state.timer = 0;
  $.state.pendingEligibilityChecks = {};
  $.state.rejectionQueue = [];
  $.state.isProcessingRejection = false;
  $.state.rejectionTimer = 0;
  $.state.isSessionApproved = false;
  $.state.existingConditions = null;  // existing conditions from server for balancing
  $.state.betweenSubjectsConditions = null;
  $.state.eligibleCount = 0;  // only confirmed-eligible players count toward pNum
  $.state.participantIdfcs = [];  // idfc of each entry of participants (a PlayerHandle has no idfc once the player left)
  // Last: enrollment starts again once this is false, so a failure above leaves enrollment blocked.
  $.groupState.isParticipantsEnough = false;
}

$.onUpdate((deltaTime) => {
    nr_tick(deltaTime);   // new-participant prompt and session reset (see the end of this file)

    if (!$.groupState.isParticipantsEnough) {
        $.state.timer += deltaTime;
        if ($.state.timer >= 1){
            $.state.timer = 0;
            let pIdfcs = $.groupState.participants.map(p => p.idfc);
            const newPlayers = $.getPlayersNear($.getPosition(), Infinity)
                .filter(p => !pIdfcs.includes(p.idfc));
            if (newPlayers.length > 0) {
                for (const newPlayer of newPlayers) {
                    $.groupState.participants = [ ...$.groupState.participants, newPlayer ];
                    $.state.participantIdfcs = [ ...($.state.participantIdfcs || []), newPlayer.idfc ];
                    $.setPlayerScript(newPlayer);
                    newPlayer.send("initializeParticipant", true);
                }
            }
            // pNum check moved to onExternalCallEnd — only eligible players count
        }
    } else if ($.state.isBetweenSubjectsConditionsSet) { // participants are enough & conditions are set
        $.state.isBetweenSubjectsConditionsSet = false;
        if (!isTestMode) {
            let request = {
                type: "uploadCustomData",
                data: {
                    pInfo: $.state.participantsEnvInfo.map(info => ({ ts: Date.now(), sID: $.groupState.sessionID || "", ...info })),
                    idfc2userId: $.state.idfc2userId
                },
                token: token || "",
                eID: expID || "",
                sID: $.groupState.sessionID || ""
            };
            $.callExternal(new ExternalEndpointId(callExternalEndpointID), JSON.stringify(request), "customDataUploaded");
        }
    }

    // Process rejection queue: teleport rejected players to remote world gate one at a time
    if ($.state.rejectionQueue.length > 0 && !$.state.isProcessingRejection) {
        const rejection = $.state.rejectionQueue[0];
        const allPlayers = $.getPlayersNear($.getPosition(), Infinity);
        const player = allPlayers.find(p => p.idfc === rejection.idfc);

        if (!player) {
            // Player already left, skip
            $.state.rejectionQueue = $.state.rejectionQueue.slice(1);
        } else {
            $.state.isProcessingRejection = true;
            $.state.rejectionTimer = 0;
            // Teleport player to the gate (convert item-local to global coords)
            $.subNode("WorldGateToLuidaBar").setEnabled(true);
            const itemPos = $.getPosition();
            player.setPosition(new Vector3(
                REJECTION_GATE_POS.x + itemPos.x,
                REJECTION_GATE_POS.y + itemPos.y + 0.5,
                REJECTION_GATE_POS.z + itemPos.z
            ));
            $.log("Rejection: teleported player " + rejection.idfc + " to remote world gate");
        }
    }

    if ($.state.isProcessingRejection) {
        $.state.rejectionTimer += deltaTime;
        if ($.state.rejectionTimer >= 1.5) {
            const processed = $.state.rejectionQueue[0];
            $.state.rejectionQueue = $.state.rejectionQueue.slice(1);
            $.state.isProcessingRejection = false;
            $.state.rejectionTimer = 0;
            $.subNode("WorldGateToLuidaBar").setEnabled(false);
            $.log("Rejection: finished processing player " + (processed ? processed.idfc : "unknown"));
        }
    }
})

$.onReceive((messageType, arg, sender) => {
    switch (messageType) {
        case "betweenSubjectsCondition":
            $.state.betweenSubjectsConditions = arg;
            $.state.isBetweenSubjectsConditionsSet = true;
            if (!isTestMode) {
                // Save conditions to backend
                let saveConditionsRequest = {
                    type: "saveSessionConditions",
                    token: token || "",
                    eID: expID || "",
                    sID: $.groupState.sessionID || "",
                    betweenSubjectsConditions: arg
                };
                $.callExternal(new ExternalEndpointId(callExternalEndpointID), JSON.stringify(saveConditionsRequest), "sessionConditionsSaved");
            }
            break;
        case "betweenSubjectsConfig":
            $.state.betweenSubjectsConfig = arg;
            $.log("Received betweenSubjectsConfig: " + JSON.stringify(arg));
            break;
        case "envInfoResponse":
            // Store envInfo
            $.state.participantsEnvInfo = [
              ...$.state.participantsEnvInfo,
              { idfc: sender.idfc, envInfo: arg }
            ];
            let idfc2userId = { ...$.state.idfc2userId };
            idfc2userId[sender.idfc] = sender.userId;
            $.state.idfc2userId = idfc2userId;

            if (isTestMode) {
                // Local editor test mode: skip both backend eligibility and
                // platform filtering so any device can drive the experiment.
                $.state.eligibleCount++;
                if (!$.groupState.isParticipantsEnough && $.state.eligibleCount >= pNum) {
                    HandleParticipantsEnough();
                }
            } else {
                // Check eligibility via backend API
                let pendingChecks = { ...$.state.pendingEligibilityChecks };
                pendingChecks[sender.idfc] = true;
                $.state.pendingEligibilityChecks = pendingChecks;

                // Build eligibility request
                let eligibilityRequest = {
                    type: "checkJoinEligibility",
                    token: token || "",
                    eID: expID || "",
                    sID: $.groupState.sessionID || "",
                    envInfo: [arg]
                };

                // Until session is approved, also include betweenSubjectsConfig for session check
                if (!$.state.isSessionApproved && $.state.betweenSubjectsConfig.length > 0) {
                    eligibilityRequest.betweenSubjectsConfig = $.state.betweenSubjectsConfig;
                }

                $.callExternal(
                    new ExternalEndpointId(callExternalEndpointID),
                    JSON.stringify(eligibilityRequest),
                    "joinEligibilityChecked_" + sender.idfc
                );
            }
            break;
        case "luida_reset": {
            // Sent by an item that resets the session from outside (the prompt below resets this item directly).
            // Idempotent per token; the token is saved only after the reset succeeded, so a re-send retries a failed one.
            // Do not send luida_participants_info here: the new sessionID has no backend session yet.
            const resetToken = arg && arg.token;
            if ($.state.luida_lastResetToken !== resetToken) {
                initSession();
                $.setStateCompat("this", "exp_showWaitingMessage", true);
                $.state.luida_lastResetToken = resetToken;
                $.log("LUIDA session reset: new sID=" + $.groupState.sessionID);
            }
            sender.send("luida_reset_ack", { token: resetToken, sessionID: $.groupState.sessionID });
            break;
        }
        case "luida_reset_ack":
            // ConditionManager finished the reset this item asked for (new-participant prompt).
            if (arg && arg.token && arg.token === $.state.nr_token) $.state.nr_cmAck = arg.token;
            break;
        case "luida_prompt_no":
            // "続きから" on the new-participant prompt (NewParticipantPromptNo item): the player says they are the
            // participant who left; put them back into their slot instead of resetting.
            if (($.state.nr_phase || "idle") === "asking" && $.state.nr_shown && arg && arg.player) nr_resume(arg.player);
            break;
        default:
            break;
    }
}, { item: true, player: true });

function HandleParticipantsEnough() {
  $.log("Participants are enough to start the experiment.");
  $.groupState.isParticipantsEnough = true;
  $.sendSignalCompat("this", "exp_playersAreEnough");
  $.sendSignalCompat("this", "exp_StartStateTransition");

  const conditionManager = $.worldItemReference("ConditionManager");
  if (conditionManager) {
    // If server returned existing conditions, send them for local balancing
    if ($.state.isSessionApproved && $.state.existingConditions) {
      conditionManager.send("luida_existing_conditions", $.state.existingConditions);
    } else if (typeof expID === "undefined" || !expID) {
      // No expID → no server balancing possible. [] makes ConditionManager pick a random combination.
      conditionManager.send("luida_existing_conditions", []);
    }
    conditionManager.send("luida_participants_info", {
      participants: $.groupState.participants,
      sessionID: $.groupState.sessionID
    });
  }
}

$.onExternalCallEnd((res, meta, err) => {
  if (meta.startsWith("joinEligibilityChecked_")) {
    const idfc = meta.replace("joinEligibilityChecked_", "");

    // Clear pending check regardless of outcome
    let pendingChecks = { ...$.state.pendingEligibilityChecks };
    delete pendingChecks[idfc];
    $.state.pendingEligibilityChecks = pendingChecks;

    if (res == null) {
      // Graceful degradation: treat as eligible so experiment can proceed with local conditions
      $.log("Eligibility check ERROR for " + idfc + ": " + err);
      $.state.eligibleCount++;
      if (!$.groupState.isParticipantsEnough && $.state.eligibleCount >= pNum) {
        HandleParticipantsEnough();
      }
      return;
    }

    const parsedRes = JSON.parse(res);

    if (!parsedRes.eligible) {
      enqueueRejection(idfc, parsedRes.reason);
      return;
    }

    // Player is eligible
    $.state.eligibleCount++;

    // Check if response includes session status info (existing conditions for local balancing)
    if (parsedRes.existingConditions !== undefined) {
      $.state.isSessionApproved = true;
      $.state.existingConditions = parsedRes.existingConditions;
      $.log("Session approved. Existing conditions: " + JSON.stringify(parsedRes.existingConditions));
    }

    // Check pNum — only after eligibility is confirmed
    if (!$.groupState.isParticipantsEnough && $.state.eligibleCount >= pNum) {
      HandleParticipantsEnough();
    }
    return;
  }

  if (meta === "sessionConditionsSaved") {
    if (res == null) {
      $.log("saveSessionConditions ERROR: " + err);
    } else {
      $.log("Session conditions saved: " + JSON.stringify(res));
    }
    return;
  }

  if (meta === "customDataUploaded") {
    if (res == null) {
      $.log("callExternal ERROR: " + err);
      return;
    }
    $.log("Response after customDataUploaded called: " + JSON.stringify(res));
    return;
  }

  // Fallback for unknown meta
  if (res == null) {
    $.log("callExternal ERROR (" + meta + "): " + err);
  }
});

// ---- New-participant prompt and session reset ----
// Once a session is in use (isParticipantsEnough is true: running or finished), this item looks once a second
// for players who are not enrolled while none of the enrolled participants is still here (they finished and
// left, or left in the middle; scripts only run while someone is in the space, so this happens when the next
// player joins). Such a player sees a small red panel close in front of them: "you seem to have entered a session
// that was interrupted or has ended; OK starts the experiment from the beginning".
//   "OK"      (sub-node NewParticipantPromptOk, the only collider of this item, $.onInteract): reset the globals
//             (signal exp_sessionReset -> GlobalLogics on this prefab) and ConditionManager, confirm both, then this
//             item (initSession), after which enrollment resumes exactly as at space start.
//   "続きから" (item NewParticipantPromptNo, shown under "OK" only when the player uses the account of an enrolled
//             participant who left): the player is put back into their participant slot and the session goes on.
// Nothing is reset before an answer. Each reset step is confirmed and never advances on a timeout; after
// NR_ALERT_SEC without confirmation the panel shows an error (and keeps retrying). Worlds whose
// ParticipantManager prefab has no NewParticipantPrompt sub-node never show the prompt and never reset.
// Panel layout in LUIDA-ExpManagers (overrides on the ParticipantManager prefab): 0.7 x 0.4 m centred at y = +0.03,
// text at y = +0.075 (size 0.015, about 24 Japanese characters per line), "OK" at y = -0.1. "続きから" (0.3 x 0.05 m)
// sits at NR_NO_OFFSET under "OK" and carries a 0.7 x 0.05 m strip of the panel colour that extends the panel
// downward while it is shown.
const NR_POLL_SEC = 1;
const NR_PROMPT_DELAY_SEC = 3;     // first seen -> panel shown (lets End's upload be issued under the old sessionID; lets the avatar settle)
const NR_RESEND_SEC = 2;           // re-send unconfirmed reset requests (the handlers are idempotent per token)
const NR_ALERT_SEC = 15;
const NR_DIST = 0.5;               // panel distance in front of the player [m] (close, so the panel and its text are small)
const NR_HEIGHT = 1.4;             // panel height when the head bone cannot be read [m]
const NR_REPLACE_DIST = 1;         // the player walked this far from where they were asked: place the panel again
const NR_NODE = "NewParticipantPrompt";
const NR_TEXT = "NewParticipantPromptText";
const NR_OK = "NewParticipantPromptOk";
const NR_NO_ITEM = "NewParticipantPromptNo";                 // world item reference (LUIDA-ExpManagers prefab)
const NR_NO_OFFSET = new Vector3(0, -0.165, -0.01);          // "続きから" relative to the panel, under "OK"
const NR_TEXT_ASK = "中断または終了したセッションに入ったようです。\n「OK」を押すと、実験を最初から始めます。\n" +
                    "It seems you have entered a session that\nwas interrupted or has ended.\nPress OK to restart the experiment\nfrom the beginning.";
const NR_TEXT_ASK_RESUME = "中断したセッションに戻ってきたようです。\n「OK」で最初から、「続きから」で再開します。\n" +
                           "You seem to have returned to an\ninterrupted session.\nPress OK to start over,\nor Resume to continue.";
const NR_TEXT_BUSY = "初期化しています。しばらくお待ちください…\nResetting the experiment, please wait…";
const NR_TEXT_ERROR = "エラー：実験の初期化に失敗しました。\n実験者にご連絡ください。\nError: the reset failed.\nPlease contact the experimenter.";

function nr_node(name) { try { return $.subNode(name); } catch (e) { return null; } }
function nr_noItem() { try { return $.worldItemReference(NR_NO_ITEM); } catch (e) { return null; } }
function nr_phase(p) { $.state.nr_phase = p; $.state.nr_phaseSec = 0; $.state.nr_lastSend = -1e9; }

function nr_show(text, withOk, withNo) {
  const panel = nr_node(NR_NODE);
  if (!panel) return;
  const t = nr_node(NR_TEXT); if (t) t.setText(text);
  const ok = nr_node(NR_OK); if (ok) ok.setEnabled(withOk);
  panel.setEnabled(true);
  const no = nr_noItem(); if (no) no.send(withNo ? "luida_prompt_show" : "luida_prompt_hide", {});
  $.state.nr_shown = true;
}

function nr_hide() {
  const panel = nr_node(NR_NODE); if (panel) panel.setEnabled(false);
  const no = nr_noItem(); if (no) no.send("luida_prompt_hide", {});
  $.state.nr_shown = false;
  $.state.nr_placed = false;
  $.state.nr_for = null;
}

// Puts the (hidden) panel NR_DIST in front of the player at head height, facing them, and parks the "続きから"
// item next to it. Sub-node positions are item-local; the "続きから" item is a separate movable item (world pose).
function nr_place(player) {
  const panel = nr_node(NR_NODE);
  if (!panel) return false;
  const pPos = player.getPosition(), pRot = player.getRotation();
  if (!pPos || !pRot) return false;
  let h = NR_HEIGHT;
  if (!isTestMode) {   // the editor emulator may throw on bone reads; on Cluster a missing bone is null
    try { const head = player.getHumanoidBonePosition(HumanoidBone.Head); if (head) h = Math.min(1.8, Math.max(0.9, head.y - pPos.y)); } catch (e) {}
  }
  let fwd = new Vector3(0, 0, 1).applyQuaternion(pRot); fwd.y = 0;
  if (fwd.length() < 0.001) fwd = new Vector3(0, 0, 1); else fwd.normalize();
  const rot = new Quaternion().setFromEulerAngles(new Vector3(0, Math.atan2(fwd.x, fwd.z) * 180 / Math.PI, 0));
  const world = pPos.clone().add(fwd.clone().multiplyScalar(NR_DIST)).add(new Vector3(0, h, 0));
  const inv = $.getRotation().clone().invert();
  panel.setPosition(world.clone().sub($.getPosition()).applyQuaternion(inv));
  panel.setRotation(inv.clone().multiply(rot));
  const no = nr_noItem();
  if (no) no.send("luida_prompt_place", { pos: world.clone().add(NR_NO_OFFSET.clone().applyQuaternion(rot)), rot: rot });
  $.state.nr_anchor = pPos;
  return true;
}

function nr_far(player) {
  const a = $.state.nr_anchor, p = player.getPosition();
  if (!a || !p) return false;
  return p.clone().sub(a).length() > NR_REPLACE_DIST;
}

// Slot of an enrolled participant who left and used the same account as this player; -1 if none.
function nr_resumeIndex(player) {
  if (!player || !player.idfc) return -1;
  const idfcs = $.state.participantIdfcs || [];
  const ps = $.groupState.participants || [];
  for (let i = 0; i < ps.length; i++) {
    if (idfcs[i] === player.idfc && ps[i] && !ps[i].exists() && ps[i].id !== player.id) return i;
  }
  return -1;
}

function nr_globalsReset() {
  return $.getStateCompat("global", "state_currentID", "integer") === 0
      && $.getStateCompat("global", "exp_trialID", "integer") === 0
      && $.getStateCompat("global", "exp_readyToLeaveTrials", "boolean") === false
      && $.getStateCompat("global", "exp_arePlayersEnough", "boolean") === false;
}

function nr_sendResets(globals, cm) {
  if (globals) $.sendSignalCompat("this", "exp_sessionReset");    // GlobalLogics on this prefab: state_exited, state_currentID = 0, ...
  if (cm) {
    const h = $.worldItemReference("ConditionManager");
    if (h) h.send("luida_reset", { token: $.state.nr_token });
    else $.log("[PM] ConditionManager reference missing; the session cannot be reset");
  }
  $.state.nr_lastSend = $.state.nr_phaseSec;
}

function nr_startReset(player) {
  $.state.nr_token = ($.groupState.sessionID || "none") + ":" + Date.now();
  $.state.nr_cmAck = null;
  $.log("[PM] new participant confirmed (" + (player && player.idfc) + "); resetting the session, token=" + $.state.nr_token);
  nr_phase("settle");
  nr_sendResets(true, true);
  nr_show(NR_TEXT_BUSY, false, false);
}

function nr_finishReset() {
  try {
    initSession();
    $.setStateCompat("this", "exp_showWaitingMessage", true);
  } catch (e) {
    $.log("[PM] initSession failed: " + e);   // retried at the next poll
    nr_show(NR_TEXT_ERROR, false, false);
    return;
  }
  $.log("LUIDA session reset: new sID=" + $.groupState.sessionID);
  nr_hide();
  nr_phase("idle");
}

function nr_resume(player) {
  const i = nr_resumeIndex(player);
  if (i < 0) {
    $.log("[PM] '続きから' pressed by a player who cannot resume; prompt closed");
    nr_hide(); nr_phase("idle");
    return;
  }
  const ps = $.groupState.participants.slice();
  ps[i] = player;
  $.groupState.participants = ps;
  $.setPlayerScript(player);
  const cm = $.worldItemReference("ConditionManager");
  if (cm) cm.send("luida_rebind_participant", { index: i, player: player });
  $.log("[PM] participant " + (i + 1) + " rejoined (" + player.idfc + "); the session continues");
  nr_hide(); nr_phase("idle");
}

function nr_tick(dt) {
  $.state.nr_pollIn = ($.state.nr_pollIn || 0) - dt;
  if ($.state.nr_pollIn > 0) return;
  $.state.nr_pollIn = NR_POLL_SEC;
  const phase = $.state.nr_phase || "idle";
  $.state.nr_phaseSec = ($.state.nr_phaseSec || 0) + NR_POLL_SEC;

  if (phase === "settle") {
    const acked = $.state.nr_cmAck === $.state.nr_token;
    const globals = nr_globalsReset();
    if (acked && globals) { nr_finishReset(); return; }
    if ($.state.nr_phaseSec - $.state.nr_lastSend >= NR_RESEND_SEC) {
      $.log("[PM] reset not confirmed yet (globals=" + globals + ", conditionManager=" + acked + "); re-sending");
      nr_sendResets(!globals, !acked);
    }
    if ($.state.nr_phaseSec >= NR_ALERT_SEC) nr_show(NR_TEXT_ERROR, false, false);
    return;
  }

  // idle / asking
  if (!$.groupState.isParticipantsEnough) { if (phase !== "idle") { nr_hide(); nr_phase("idle"); } return; }
  const present = $.getPlayersNear($.getPosition(), Infinity);
  const ps = $.groupState.participants || [];
  const ids = ps.map(p => p.id);
  // enrolled participants still here: exists() stays true through a short network hiccup; the id is unique per join
  const enrolledHere = ps.some(p => p.exists()) || present.some(q => ids.includes(q.id));
  const strangers = present.filter(q => !ids.includes(q.id));
  if (enrolledHere || strangers.length === 0) { if (phase !== "idle") { nr_hide(); nr_phase("idle"); } return; }
  const s = strangers.find(q => q.id === $.state.nr_for) || strangers[0];
  if (phase === "idle") {
    nr_phase("asking");
    $.state.nr_for = s.id; $.state.nr_placed = false; $.state.nr_shown = false;
    $.log("[PM] a player who is not enrolled is here and no enrolled participant is; asking in " + NR_PROMPT_DELAY_SEC + " s");
    return;
  }
  if ($.state.nr_phaseSec < NR_PROMPT_DELAY_SEC) return;
  if (!$.state.nr_placed || $.state.nr_for !== s.id || nr_far(s)) {
    // move while hidden; show at the next poll, after the move has been synchronized
    if ($.state.nr_shown) { const panel = nr_node(NR_NODE); if (panel) panel.setEnabled(false); const no = nr_noItem(); if (no) no.send("luida_prompt_hide", {}); $.state.nr_shown = false; }
    $.state.nr_for = s.id;
    $.state.nr_placed = nr_place(s);
    return;
  }
  if (!$.state.nr_shown) {
    const canResume = nr_resumeIndex(s) >= 0;
    nr_show(canResume ? NR_TEXT_ASK_RESUME : NR_TEXT_ASK, true, canResume);
  }
}

$.onInteract((player) => {   // "OK" (the only collider of this item)
  if (($.state.nr_phase || "idle") !== "asking" || !$.state.nr_shown) return;
  nr_startReset(player);
});
