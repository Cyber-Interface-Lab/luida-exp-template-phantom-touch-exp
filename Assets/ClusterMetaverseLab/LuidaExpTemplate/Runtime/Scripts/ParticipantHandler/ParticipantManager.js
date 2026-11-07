const REJECTION_GATE_POS = new Vector3(-100, 100, -100);

function enqueueRejection(idfc, reason) {
    $.log("Rejected " + idfc + ": " + (reason || "unknown"));
    $.groupState.participants = $.groupState.participants.filter(
        p => p.idfc !== idfc
    );
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
  // Last: enrollment starts again once this is false, so a failure above leaves enrollment blocked.
  $.groupState.isParticipantsEnough = false;
}

$.onUpdate((deltaTime) => {
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
            // Sent by a world's session reset item after End, once the previous participant has left.
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
