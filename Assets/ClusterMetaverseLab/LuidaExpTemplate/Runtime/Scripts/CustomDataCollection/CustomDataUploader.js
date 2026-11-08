const uploadInterval = 1;
const dataLengthPerUpload = 100;
const dataByteLengthPerUpload = 100000; // 102400

$.onStart(() => {
    $.state.customData = [];
    $.state.uploadIndex = 0;
    $.state.elapsedTime = 0;
    // $.state.dataLength = 0;
    $.state.steps = 0;
    $.state.isUploading = false;
})

$.onUpdate((deltaTime) => {
    // A different sessionID in this group means a new participant's session started (session reset). Rows of the
    // previous session that were never uploaded (a participant who left in the middle) are dropped instead of
    // being uploaded under the new sessionID. Not while an upload is in progress: it empties the buffer itself.
    if ($.state.boundSessionID !== $.groupState.sessionID) {
        if ($.state.boundSessionID !== undefined && !$.state.isUploading
            && Array.isArray($.state.customData) && $.state.customData.length > 0) {
            $.log("[DataCollector] new session; dropping " + $.state.customData.length + " unsent row(s) of the previous session");
            $.state.customData = [];
        }
        $.state.boundSessionID = $.groupState.sessionID;
    }
    if ($.getStateCompat("this", "exp_recordCustomData", "boolean")) {
        $.setStateCompat("this", "exp_recordCustomData", false);
        recordData();
    }
    if ($.getStateCompat("this", "exp_uploadCustomData", "boolean")) {
        if ($.state.uploadIndex === 0) {
            uploadDataInit();
            $.setStateCompat("this", "exp_uploadCustomData", false);
        }
    }
    if ($.state.isUploading) {
        $.state.elapsedTime = $.state.elapsedTime + deltaTime;
        if ($.state.elapsedTime >= uploadInterval && $.state.uploadIndex < $.state.steps) {
            $.state.elapsedTime = 0;
            uploadDataStep();
        }
    }
})

$.onExternalCallEnd((res, meta, err) =>
{
    if (res == null) {
        $.log("callExternal ERROR: " + err);
        return;
    }

    if (meta === "customDataUploaded") {
        $.log("Response after customDataUploaded called: " + JSON.stringify(res));
    }
});

// Accept data pushed by other items via send() (e.g. a custom CCK item).
// Item-group-independent: the payload carries the data, which we merge into
// THIS collector's own $.groupState.collectedData scratchpad, then optionally
// snapshot a row / flush - mirroring the exp_recordCustomData / exp_uploadCustomData
// handling in $.onUpdate above.
// Message: send("luida_collect", { label: value, ..., __record?: bool, __upload?: bool })
//   - Every data key is merged into the collector's scratchpad.
//   - __record: true snapshots a row HERE (after the data lands) — do this instead of
//     triggering the save from another item/gimmick, which can race send()'s delivery
//     latency and snapshot the previous (or default) value instead.
//   - __upload: true flushes the buffer to the backend.
//   "__record" / "__upload" are control flags, not data (never written to the scratchpad).
$.onReceive((messageType, arg, sender) => {
    if (messageType !== "luida_collect") return;

    if (!$.groupState.collectedData) $.groupState.collectedData = {};
    const cd = $.groupState.collectedData;
    if (arg && typeof arg === "object") {
        for (const k in arg) {
            if (k === "__record" || k === "__upload") continue;
            cd[k] = arg[k];
        }
    }
    $.groupState.collectedData = cd;

    // Snapshot / flush HERE, after the just-sent data is in the scratchpad, so the row
    // captures this send's value even on the very first send.
    if (arg && arg.__record) recordData();
    if (arg && arg.__upload && $.state.uploadIndex === 0) uploadDataInit();
});

function recordData () {
    $.state.customData = calculateData();
}

function uploadDataInit() {
    $.state.uploadIndex = 0;
    $.state.elapsedTime = 0;
    $.state.isUploading = true;

    let dataByteLength = utf8ByteLength(JSON.stringify($.state.customData));
    $.log("Data byte length: " + dataByteLength);
    $.state.steps = Math.ceil(dataByteLength / dataByteLengthPerUpload);
}

function uploadDataStep() {
    $.log("Upload data step: " + $.state.uploadIndex);
    if ($.state.uploadIndex < $.state.steps) {
        let request = {
            type: "uploadCustomData",
            token: token || "",
            data: { data: $.state.customData.slice($.state.uploadIndex * dataLengthPerUpload, ($.state.uploadIndex + 1) * dataLengthPerUpload) },
            eID: expID || "",
            sID: $.groupState.sessionID || ""
        };
        $.log(JSON.stringify(request));
        $.callExternal(
            new ExternalEndpointId(callExternalEndpointID),
            JSON.stringify(request),
            "customDataUploaded");
        $.state.uploadIndex = $.state.uploadIndex + 1;

        if ($.state.uploadIndex >= $.state.steps) {
            $.state.uploadIndex = 0;
            $.state.isUploading = false;
            $.state.customData = [];
        }
    }
}

function utf8ByteLength(str) {
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);

        if (code <= 0x7F)                      bytes += 1; // U+0000 – U+007F
        else if (code <= 0x7FF)                bytes += 2; // U+0080 – U+07FF
        else if (code >= 0xD800 && code <= 0xDBFF) {
            // Surrogate pair (astral plane)
            bytes += 4;                          // Whole pair is 4 bytes
            i++;                                 // Skip the next surrogate
        }
        else                                   bytes += 3; // U+0800 – U+FFFF
    }
    return bytes;
}

function calculateData () {
    let returnData = $.state.customData;
    if (!Array.isArray(returnData)) returnData = [];
    const CONDITION = $.groupState.currentCondition;
    const PARTICIPANTS = [null].concat($.groupState.participants);
    const COLLECTED_DATA = $.groupState.collectedData;
    function saveData() {
