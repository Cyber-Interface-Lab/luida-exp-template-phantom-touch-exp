let isTestMode = true; // flipped to false by the pre-upload build step

$.onStart(() => {
  $.state.isServerAssigned = false;
  initializeBetweenSubjectsConditions();
  reset();

  // Send between-subjects config to ParticipantManager for eligibility checks
  const pm = $.worldItemReference("ParticipantManager");
  if (pm) {
    let bsc = [];
    try {
      bsc = between_subjects_variables.map(v => ({ name: v.name, values: v.values }));
    } catch (e) { /* between_subjects_variables not defined */ }
    pm.send("betweenSubjectsConfig", bsc);
  }
});

$.onUpdate(() => {
  if (
    $.state.trialID !== $.getStateCompat("global", "exp_trialID", "integer") &&
      $.getStateCompat("global", "exp_trialID", "integer") >= 0
  ) {
    $.state.trialID = $.getStateCompat("global", "exp_trialID", "integer");
    updateCondition();
  }
});

$.onReceive((messageType, arg, sender) => {
  switch (messageType) {
    case "luida_existing_conditions":
      // Receive existing conditions array from server, compute balanced assignment locally
      let assignedConditions = calculateBalancedAssignment(arg);
      // Debug overrides apply only in editor test mode — never on the uploaded world,
      // so a stray debugValue can't silently replace a server-balanced condition.
      if (isTestMode) {
        try {
          between_subjects_variables.forEach(v => {
            if (v.debugValue) {
              assignedConditions[v.name] = v.debugValue;
            }
          });
        } catch (e) { /* between_subjects_variables not defined */ }
      }
      $.state.betweenSubjectsConditions = assignedConditions;
      $.state.isServerAssigned = true;
      $.groupState.currentCondition = {
        ...($.groupState.currentCondition || {}),
        ...assignedConditions,
      };
      $.log("Conditions balanced locally" + (isTestMode ? " (debug overrides applied)" : "") + ": " + JSON.stringify(assignedConditions));
      break;
    case "luida_participants_info":
      // A different sessionID means a new participant's session (session reset): forget the values the items of
      // this group collected for the previous participant, so they cannot end up in the new participant's rows.
      // This is the right moment: it comes after the exit actions of the state that was reset have run.
      if ($.groupState.sessionID !== arg.sessionID) $.groupState.collectedData = {};
      $.groupState.participants = arg.participants;
      $.groupState.sessionID = arg.sessionID;
      sender.send("betweenSubjectsCondition", $.state.betweenSubjectsConditions);
      break;
    case "luida_rebind_participant":
      // A participant who left rejoined with the same account ("いいえ" on the ParticipantManager's
      // new-participant prompt): the ParticipantManager put the new PlayerHandle into their slot; mirror it here.
      if (arg && typeof arg.index === "number" && arg.player) {
        const ps = ($.groupState.participants || []).slice();
        if (arg.index >= 0 && arg.index < ps.length) {
          ps[arg.index] = arg.player;
          $.groupState.participants = ps;
          $.log("[ConditionManager] participant " + (arg.index + 1) + " rejoined; handle replaced");
        }
      }
      break;
    case "luida_reset": {
      // Sent by the ParticipantManager when a newly joined player confirmed that they are a new participant
      // (or by any item that resets the session). Same steps as $.onStart (except sending betweenSubjectsConfig),
      // plus isLast, which reset() keeps. The token is saved only after the reset succeeded; completion is
      // reported to the sender (which may be in another item group) and in luida_resetAck of this group.
      const resetToken = arg && arg.token;
      if ($.state.luida_lastResetToken !== resetToken) {
        $.state.isLast = false;
        $.state.isServerAssigned = false;
        $.state.betweenSubjectsConditions = {};
        initializeBetweenSubjectsConditions();
        reset();
        $.state.luida_lastResetToken = resetToken;
        $.log("[ConditionManager] session reset");
      }
      $.groupState.luida_resetAck = resetToken;
      if (sender && sender.send) sender.send("luida_reset_ack", { token: resetToken });
      break;
    }
    default:
      break;
  }
});

function updateCondition() {
  if ($.state.trialID >= $.state.trialCount) {
    $.sendSignalCompat("this", "exp_resetTrials");
  } else if ($.state.trialID <= -1) {
    reset();
  } else {
    let condition = { ...$.state.betweenSubjectsConditions };
    for (let i = 0; i < $.state.withinSubjectsVariableNames.length; i++) {
      const varName = $.state.withinSubjectsVariableNames[i];
      const varValue =
          within_subjects_variables[i].values[
              $.state.withinSubjectsConditionIndicesByTrial[$.state.trialID][i]
              ];
      condition[varName] = varValue;
    }
    $.groupState.currentCondition = condition;

    // Check if this is the last trial (if true, stop repeating trials when next state transition is triggered)
    if (
        $.state.trialCount > 0 &&
        !$.state.isLast &&
        $.state.trialID >= $.state.trialCount - 1
    ) {
      $.state.isLast = true;
      $.sendSignalCompat("this", "exp_readyToLeaveTrials");
    }
  }
}

function reset() {
  $.state.trialID = 0;
  if (!$.state.betweenSubjectsConditions)
    $.state.betweenSubjectsConditions = {};
  $.state.withinSubjectsVariableNames = [];
  $.state.withinSubjectsConditionIndicesByTrial = [];
  $.state.trialCount = 1;
  $.groupState.currentCondition = {
    ...$.state.betweenSubjectsConditions,
  };
  $.groupState.stateNames = state_names || [];
  try {
    initializeWithinSubjectsConditions(
      within_subjects_variables,
      trialsCountForEachUniqueCondition
    );
  } catch (error) {
    $.log(error);
    $.log("Within-subjects variables are not defined.");
    initializeWithinSubjectsConditions([], 1);
  }
  updateCondition();
}

function initializeBetweenSubjectsConditions() {
  // Test mode only: debugValue if set, else a random candidate.
  // An uploaded world (not in test mode) assigns the conditions using calculateBalancedAssignment().
  let betweenSubjectsCondition = {};
  if (isTestMode) {
    const existing = $.state.betweenSubjectsConditions || {};
    try {
      between_subjects_variables.forEach((v) => {
        if (v.debugValue) {
          betweenSubjectsCondition[v.name] = v.debugValue;
        } else if (existing[v.name] !== undefined) {
          betweenSubjectsCondition[v.name] = existing[v.name];
        } else if (v.values && v.values.length > 0) {
          betweenSubjectsCondition[v.name] =
            v.values[Math.floor(Math.random() * v.values.length)];
        }
      });
    } catch (e) {
      $.log("Between-subjects variables are not defined.");
    }
  }
  $.state.betweenSubjectsConditions = betweenSubjectsCondition;
}

function initializeWithinSubjectsConditions(variables, repeatsPerCond = 1) {
  variables = [...variables.sort((a, b) => a.isRandom - b.isRandom)];
  const varNames = variables.map((v) => v.name);

  let indicesPerVar = variables.map((v) =>
    Array.from({ length: v.values.length }, (_, i) => i)
  );
  let condIndicesList = indicesPerVar
    .reduce(
      (acc, array) => {
        return acc.flatMap((accItem) =>
          array.map((arrayItem) => [...accItem, arrayItem])
        );
      },
      [[]]
    )
    .flatMap((condIndices) =>
      Array.from({ length: repeatsPerCond }, () => condIndices)
    );

  let shufflePartitionSize = 0;
  for (let i = 0; i < variables.length; i++) {
    if (variables[i].isRandom) {
      shufflePartitionSize =
        shufflePartitionSize === 0
          ? variables[i].values.length
          : shufflePartitionSize * variables[i].values.length;
    }
  }
  shufflePartitionSize *= repeatsPerCond;

  if (shufflePartitionSize > 0) {
    const result = [...condIndicesList]; // Copy the array to avoid mutating the original
    for (let i = 0; i < condIndicesList.length; i += shufflePartitionSize) {
      let partition = result.slice(i, i + shufflePartitionSize);
      partition = shuffleArray(partition);
      result.splice(i, shufflePartitionSize, ...partition);
    }
    condIndicesList = result;
  }

  $.state.withinSubjectsVariableNames = varNames;
  $.state.withinSubjectsConditionIndicesByTrial = condIndicesList;
  $.state.trialCount = condIndicesList.length;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate Cartesian product of all between-subjects variable values.
 * Returns array of combination objects, e.g. [{avatar:"robot",difficulty:"easy"}, ...]
 */
function generateAllCombinations(variables) {
  if (variables.length === 0) return [{}];
  const first = variables[0];
  const rest = variables.slice(1);
  const restCombinations = generateAllCombinations(rest);
  const combinations = [];
  for (const value of first.values) {
    for (const combo of restCombinations) {
      const newCombo = {};
      newCombo[first.name] = value;
      for (const k in combo) { newCombo[k] = combo[k]; }
      combinations.push(newCombo);
    }
  }
  return combinations;
}

/**
 * Given an array of existing condition objects (from previous sessions),
 * find the least-used combination and return it.
 * Ties are broken randomly.
 */
function calculateBalancedAssignment(existingConditions) {
  let variables = [];
  try {
    variables = between_subjects_variables.map(v => ({ name: v.name, values: v.values }));
  } catch (e) {
    return {};
  }
  if (variables.length === 0) return {};

  const allCombinations = generateAllCombinations(variables);

  // Build a count for each combination using a stable string key
  const counts = {};
  for (const combo of allCombinations) {
    const key = JSON.stringify(combo, Object.keys(combo).sort());
    counts[key] = 0;
  }

  // Count occurrences in existing conditions
  for (const cond of existingConditions) {
    if (cond && typeof cond === "object") {
      // Normalize to same key format
      const normalized = {};
      for (const combo of allCombinations) {
        for (const k of Object.keys(combo)) {
          if (cond[k] !== undefined) normalized[k] = "" + cond[k];
        }
        break; // just need the key names from the first combo
      }
      const key = JSON.stringify(normalized, Object.keys(normalized).sort());
      if (key in counts) {
        counts[key]++;
      }
    }
  }

  // Find minimum count
  let minCount = Infinity;
  for (const key in counts) {
    if (counts[key] < minCount) minCount = counts[key];
  }

  // Collect all combinations with minimum count
  const leastUsed = allCombinations.filter(combo => {
    const key = JSON.stringify(combo, Object.keys(combo).sort());
    return counts[key] === minCount;
  });

  // Random tie-break
  return leastUsed[Math.floor(Math.random() * leastUsed.length)];
}
