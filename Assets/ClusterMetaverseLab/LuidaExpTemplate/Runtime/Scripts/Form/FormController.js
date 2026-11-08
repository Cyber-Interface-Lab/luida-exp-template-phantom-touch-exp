$.onStart(() => {
    reset();
    $.state.isParticipantAssigned = false;
    $.groupState.qCompletedCount = 0;
    $.state.spawnBatchSize = 3;
    $.state.spawnInterval = 0.2;
});

$.onUpdate((deltaTime) => {
    // A new sessionID means a new participant (ParticipantManager "luida_reset"): forget the previous one and
    // reopen the form. Must run before the assignment below. The first frame only records the sessionID.
    if ($.state.boundSessionID !== $.groupState.sessionID) {
        const hadParticipant = !!$.state.isParticipantAssigned;
        $.state.boundSessionID = $.groupState.sessionID;
        if (hadParticipant) {
            $.state.participant = null;
            $.state.isParticipantAssigned = false;
            reopenForm();
        }
    }

    // The participant left and rejoined with the same account: the ParticipantManager put the new PlayerHandle
    // into their slot ("いいえ" on its new-participant prompt). Follow it. A form that was open is closed and
    // restarted, because its answer options and texts were only visible to the previous join.
    if ($.state.isParticipantAssigned && $.state.participant && !$.state.participant.exists()) {
        const fresh = $.groupState.participants[($.getStateCompat("this", "pID", "integer") - 1) || 0];
        if (fresh && fresh.exists() && fresh.id !== $.state.participant.id) {
            $.state.participant = fresh;
            $.worldItemReference("PrevButton").send("setParticipant", fresh);
            $.worldItemReference("NextButton").send("setParticipant", fresh);
            if ($.state.isInitiated && !$.state.isSubmitted) reopenForm();
        }
    }

    // The form can be answered once per visit of its state. After the answers are sent it stays closed (the
    // waiting screen is still shown and a click must not reload it) until the state machine has entered another
    // state, which is when the container is deactivated; the next visit of the state finds it closed and ready.
    if ($.state.isSubmitted && stateEnteredTime() !== ($.state.submittedStateEnteredTime || 0)) {
        reopenForm();
    }

    if (!$.state.isParticipantAssigned && $.groupState.isParticipantsEnough) {
        let player = $.groupState.participants[($.getStateCompat("this", "pID", "integer") - 1) || 0];
        $.state.participant = player;
        $.requestOwner(player);
        $.setVisiblePlayers([player]);

        $.worldItemReference("PrevButton").send("setParticipant", player);
        $.worldItemReference("NextButton").send("setParticipant", player);

        $.state.isParticipantAssigned = true;
    }

    // Ensure that the question is only initialized after all currently displayed answer options are destroyed
    if (!$.state.isInitiated && !$.state.isSubmitted && $.getStateCompat("this", "form_set_content_active", "boolean")) {
        $.state.isInitiated = true;
        $.state.qID = 0;
        $.state.questions = [];
        $.setStateCompat("this", "form_show_start_hint", false);
        $.setStateCompat("this", "form_show_loading_bar", true);
        $.state.participant.send("setQuestionnaireUI", {
            n: "LoadingText",
            e: true,
            p: $.subNode("LoadingBar").getGlobalPosition(),
            r: $.subNode("LoadingBar").getGlobalRotation(),
        });

        // Reintroduced callExternal to get questions
        const questionnaireID = $.getStateCompat("this", "qID", "integer");
        if (questionnaireID > 0) {
            let request = { type: "questions", token: token || "", eID: expID || "", qID: questionnaireID, startIndex: 0 };
            $.callExternal(new ExternalEndpointId(callExternalEndpointID), JSON.stringify(request), "getQuestions");
        } else {
            $.log("No questionnaire ID (qID) provided or it is invalid.");
        }
    }

    if ($.state.tryInitQuestion && !$.state.answerOptionUIs.some(ans => ans.exists())) {
        initQuestion();
    }

    // Timer to trigger batch generation of answer options
    $.state.timer = ($.state.timer || 0) + deltaTime;
    if ($.state.timer > ($.state.spawnInterval || 0.2) && $.state.pendingAnswerOptions && $.state.pendingAnswerOptions.length > 0) {
        $.state.timer = 0;
        spawnNextAnswerOption();
    }
});

$.onInteract(() => {
    // don't reopen the form once it's open or sent (stops the reload on the waiting screen)
    if (!$.state.isInitiated && !$.state.isSubmitted) $.setStateCompat("this", "form_set_content_active", true);
});

$.onReceive((messageType, arg) => {
    if (!$.state.isInitiated || $.state.isSubmitted) return; // also stop input after the form is sent
    switch (messageType) {
        case "form_answer":
            handleFormAnswer(arg);
            break;
        case "form_to_next":
            saveAnswer();
            break;
        case "form_to_prev":
            toPrev();
            break;
    }
});

function tryInitQuestion() {
    $.state.tryInitQuestion = true;
}

function initQuestion() {
    // Prepare to stop destruction of answer options and initialize a new question
    $.state.tryInitQuestion = false;
    $.state.answerOptionUIs = [];
    $.state.answerOptionLocalPositions = [];
    const q = $.state.questions[$.state.qID];
    $.state.participant?.send("setQuestionnaireUIs", [
        {
            n: "Title",
            e: true,
            p: $.subNode("Title").getGlobalPosition(),
            r: $.subNode("Title").getGlobalRotation(),
            t: q.t
        },
        {
            n: "Description",
            e: true,
            p: $.subNode("Description").getGlobalPosition(),
            r: $.subNode("Description").getGlobalRotation(),
            t: q.d
        }
    ]);
    $.state.questionTypeID = q.i;
    $.state.answerOptions = Array.isArray(q.a)
        ? q.a
        : (typeof q.a === "string" ? q.a.split(",") : []) ;
    if (q.i === 1 && $.state.answerOptions.length === 0) {
        $.state.answerOptions = [1,2,3,4,5,6,7];
    }
    if ($.state.answerOptions.length === 0) $.state.answerOptions = [""];
    spawnAnswerOptionUI();
}

function spawnAnswerOptionUI() {
    $.state.pendingAnswerOptions = $.state.answerOptions.slice();
    $.state.answerOptionIndex = 0;
    // Throttle createItem to stay under Cluster's 10 calls/sec limit.
    const manyOptions = $.state.answerOptions.length > 10;
    $.state.spawnBatchSize = manyOptions ? 2 : 3;
    $.state.spawnInterval = manyOptions ? 0.3 : 0.2;
}

function addAnswerOption (id, localPos, rot, ansId) {
    let itemHandle;
    try {
        itemHandle = $.createItem(id, $.getPosition().clone().add(localPos.clone().applyQuaternion(rot)), rot);
    } catch (e) {
        $.log("[FormController] createItem failed (rate limit?): " + e);
        return false;
    }
    $.state.answerOptionUIs = [...$.state.answerOptionUIs, itemHandle];
    $.state.answerOptionLocalPositions = [...$.state.answerOptionLocalPositions, localPos];
    itemHandle.send("form_init_answer_option", { value: ansId + 1, label: $.state.answerOptions[ansId], participant: $.state.participant });
    return true;
}

function spawnNextAnswerOption() {
    const n = $.state.pendingAnswerOptions.length || 0;
    if ($.state.answerOptionIndex >= n) {
        $.state.pendingAnswerOptions = [];
        if ($.state.questionTypeID !== 3) {
            let rot = $.getRotation().clone();
            let posOffset = $.getPosition().clone().add(new Vector3(
                $.state.questionTypeID === 1 ? 0.06 : $.state.questionTypeID === 4 ? 0 : 0.2,
                $.state.questionTypeID === 1 ? 0.2: 0, 0));
            const req = $.state.answerOptions.map((label, i) => ({
                n: $.state.questionTypeID === 4 ? "AnsText" : ("AnsOptLabel_" + i),
                e: true,
                p: $.state.answerOptionLocalPositions[i].clone().add(posOffset),
                r: rot,
                t: $.state.questionTypeID === 4 ? "Click here" : label
            }));
            $.state.participant?.send("setQuestionnaireUIs", req);
        }
        return;
    }

    let rotOffset = $.getRotation().clone();
    let answerUiId = "";

    // Maximum number of rows (per column)
    const maxRows = 5;
    const batchSize = $.state.spawnBatchSize || 3; // 3 for <=10 options, 2 for >10 (see spawnAnswerOptionUI)
    const numColumns = Math.ceil(n / maxRows); // Calculate number of columns based on total options and max rows per column

    // Adjust x-position based on number of columns to center them
    const totalWidth = numColumns * 0.5; // Adjust total width depending on your frame size
    let i = 0;

    for (i = 0; i < batchSize && $.state.answerOptionIndex < n; i++) {
        let columnIndex = Math.floor($.state.answerOptionIndex / maxRows);
        let rowIndex = $.state.answerOptionIndex % maxRows;

        // Calculate dynamic x and y positions
        let x = (columnIndex - (numColumns - 1) / 2) - 0.2; // Adjust 0.5 for spacing between columns
        let y = ((maxRows - 1) / 2 - rowIndex) * 0.2 - 0.1; // 0.2 is the vertical spacing between rows

        let added = true;
        switch ($.state.questionTypeID) {
            case 0: // Radio Buttons (single answer)
            case 2: // Checkbox (multiple answers)
                answerUiId = new WorldItemTemplateId($.state.questionTypeID === 0
                    ? "answer-option-radio-button"
                    : "answer-option-checkbox");

                // Add the option at calculated x and y positions
                added = addAnswerOption(answerUiId, new Vector3(x, y, 0), rotOffset, $.state.answerOptionIndex);
                break;

            case 1: // Linear Scale
                answerUiId = new WorldItemTemplateId("answer-option-scale-button");

                let scaleX = ((n > 11 ? 3 : 2) / (n - 1)) * ($.state.answerOptionIndex - (n - 1) / 2);
                added = addAnswerOption(answerUiId, new Vector3(scaleX, 0, 0), rotOffset, $.state.answerOptionIndex);
                break;

            case 3: // Toggle
                answerUiId = new WorldItemTemplateId("answer-option-toggle");
                added = addAnswerOption(answerUiId, new Vector3(0, 0, 0), rotOffset, $.state.answerOptionIndex);
                break;

            case 4: // Text Input
                answerUiId = new WorldItemTemplateId("answer-option-text-input");
                added = addAnswerOption(answerUiId, new Vector3(0, 0, 0), rotOffset, $.state.answerOptionIndex);
                break;

            default:
                break;
        }

        if (!added) break; // retry this same index next interval
        $.state.answerOptionIndex += 1;
    }
}

function destroyAnswerOptionUIs() {
    if ($.state.answerOptionUIs) {
        for (const optionUi of $.state.answerOptionUIs) {
            optionUi.send("form_destroy_answer_option", true);
        }
    }
    $.state.answerOptionUIs = [];
    $.state.participant?.send("clearQuestionnaireAnswerUIs", true);
}

function handleFormAnswer(arg) {
    let posOffset = $.getPosition().clone();
    switch ($.state.questionTypeID) {
        case 0: // Radio Buttons
        case 1: // Linear Scale
            $.subNode("RadioButtonIndicator").setEnabled(true);
            $.subNode("RadioButtonIndicator").setPosition($.state.answerOptionLocalPositions[arg - 1].clone());
        case 3: // Toggle
        case 4: // Text Input
            $.state.tmpAnswer = arg;
            break;
        case 2: // Checkbox
            if (!Array.isArray($.state.tmpAnswer)) $.state.tmpAnswer = [];
            if (arg.isOn) {
                if (!$.state.tmpAnswer.includes(arg.value)) $.state.tmpAnswer = [...$.state.tmpAnswer, arg.value];
            } else {
                $.state.tmpAnswer = $.state.tmpAnswer.filter(item => item !== arg.value);
            }
            break;
    }
}

function saveAnswer() {
    if (!$.state.questions[$.state.qID]) return;
    if ($.state.questions[$.state.qID].r) {
        const a = $.state.tmpAnswer;
        // Empty array (checkbox with no items selected) must also count as missing.
        const isMissing = (!a && a !== false) || (Array.isArray(a) && a.length === 0);
        if (isMissing) return;
    }
    let answers = [ ...$.state.answers ];
    answers[$.state.qID] = $.state.tmpAnswer;
    $.state.answers = answers;
    toNext();
}

function submitAnswers() {
    $.log("Send final answers: " + JSON.stringify($.state.answers));
    let request = {
        type: "questionAnswers",
        token: token || "",
        eID: expID || "",
        qID: $.getStateCompat("this", "qID", "integer").toString() || "1",
        pID: $.state.participant.idfc || "", // TODO: rename to pIdfc, or simply don't send idfc
        pRole: $.getStateCompat("this", "pID", "integer").toString() || "1", // TODO: rename to pID?
        sessionID: $.groupState.sessionID || "",
        answers: $.state.answers
    };
    const conditionManager = $.worldItemReference("ConditionManager");
    if (conditionManager) {
        conditionManager.send("exp_questionnaire_answer", $.state.answers);
    }
    $.callExternal(new ExternalEndpointId(callExternalEndpointID), JSON.stringify(request), "postQuestionAnswers");
    $.state.participant?.send("setQuestionnaireUI", {
        n: "WaitingText",
        p: $.getPosition(),
        r: $.getRotation(),
        e: true
    });
    $.state.submittedStateEnteredTime = stateEnteredTime();
    reset(false);
}

// Time of the last Global "state_entered" signal (0 if it never fired). Only a value different from the one
// recorded when the answers were sent counts as a new state.
function stateEnteredTime() {
    const d = $.getStateCompat("global", "state_entered", "signal");
    if (!d) return 0;
    return (typeof d.getTime === "function") ? d.getTime() : (Number(d) || 0);
}

// Closed and ready for the next answer: forget the previous answers, show the start hint, hide the waiting text.
function reopenForm() {
    reset(true);
    $.setStateCompat("this", "form_show_start_hint", true);
    $.state.participant?.send("setQuestionnaireUI", { n: "WaitingText", e: false });
}

function toNext() {
    destroyAnswerOptionUIs(); // Ensure previous UI elements are destroyed
    $.state.qID = $.state.qID + 1;
    $.subNode("RadioButtonIndicator").setEnabled(false);
    if ($.state.qID >= $.state.questions.length) {
        submitAnswers();
    } else {
        $.state.tmpAnswer = null;
        tryInitQuestion();
    }
}

function toPrev() {
    if ($.state.qID <= 0) return;
    destroyAnswerOptionUIs(); // Ensure previous UI elements are destroyed
    $.subNode("RadioButtonIndicator").setEnabled(false);
    $.state.qID = $.state.qID - 1;
    $.state.tmpAnswer = null;
    tryInitQuestion();
}

function reset(enableReactivation = true) {
    destroyAnswerOptionUIs(); // destroy any existing answer option UIs first
    $.subNode("RadioButtonIndicator").setEnabled(false);
    $.state.answers = [];
    $.state.qID = 0;
    $.state.isInitiated = !enableReactivation;
    $.state.isSubmitted = !enableReactivation; // true after the form is sent, so it stays closed
    $.state.tryInitQuestion = false;
    $.state.answerOptionUIs = [];
    $.state.answerOptionLocalPositions = [];
    $.state.answerOptionIndex = 0;
    $.state.pendingAnswerOptions = [];
    $.setStateCompat("this", "form_set_content_active", false);
    $.state.participant?.send("setQuestionnaireUIs", [
        { n: "Title", e: false }, { n: "Description", e: false }
    ]);
}

$.onExternalCallEnd((res, meta, err) => {
    if (res == null) {
        $.log("callExternal ERROR: " + err);
        return;
    }

    if (meta === "getQuestions") {
        const parsedRes = JSON.parse(res);
        let isFirstGet = $.state.questions.length === 0;
        $.state.questions = [ ...$.state.questions, ...parsedRes.questions ];
        $.setStateCompat("this", "form_show_loading_bar", false);
        $.state.participant?.send("setQuestionnaireUI", {
            n: "LoadingText",
            e: false
        });
        if (isFirstGet) tryInitQuestion();

        if ("isDone" in parsedRes && !parsedRes.isDone) {
            const questionnaireID = $.getStateCompat("this", "qID", "integer");
            if (questionnaireID !== -1) {
                let request = { type: "questions", token: token || "", eID: expID || "", qID: questionnaireID, startIndex: $.state.questions.length };
                $.callExternal(new ExternalEndpointId(callExternalEndpointID), JSON.stringify(request), "getQuestions");
            }
        }
    }

    if (meta === "postQuestionAnswers") {
        $.log("Answers recorded!");
        $.groupState.qCompletedCount += 1;
        if ($.groupState.qCompletedCount >= $.groupState.participants.length) {
            $.log("All participants have completed the questionnaire!");
            $.groupState.qCompletedCount = 0;
            $.sendSignalCompat("this", "form_allPlayersCompleted"); // state_triggerTransition
            $.groupState.participants.forEach(p => {
                p.send("setQuestionnaireUI", {
                    n: "WaitingText",
                    e: false
                });
            });
            reset(false); // keep the form closed after everyone is done (don't reopen)
        }
    }
});
