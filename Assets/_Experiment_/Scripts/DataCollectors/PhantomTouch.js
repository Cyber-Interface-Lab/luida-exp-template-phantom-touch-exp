// === LUIDA AUTO-GENERATED (do not edit between markers) ===
// Regenerated from LuidaDataCollectorConfig — manual edits inside this block will be lost.
// No CCK-eligible labels registered. Add labels in LUIDA → Configure data collector → Collected data items.
// === LUIDA AUTO-GENERATED END ===

// LUIDA tip: automation is active in this scene, so COLLECTED_DATA["stateLog"]
//            contains the latest state transition ({ id, name, startAt }).
//            Add `stateLog: COLLECTED_DATA["stateLog"]` to your returned
//            object below to include it in the uploaded data.
// Study 4 (phantom touch): one row per trial / setup / device check.
// Written by Study4SceneBuilder (Code mode). Values are pushed by the state-listening items
// (SendDataToCollector) and by the NPC item (group state). Labels that a row does not use keep
// the value of the previous save, so interpret rows by stateLog.name.
const CD = (typeof COLLECTED_DATA !== 'undefined' && COLLECTED_DATA) ? COLLECTED_DATA : {};
return {
    stateLog: CD['stateLog'],
    cond: CONDITION || {},
    savedAt: Date.now(),
    // block setup (Trial - Start, rep == 1)
    avatar: CD['avatar'],
    avatarArmLen: CD['avatarArmLen'], avatarShoulder: CD['avatarShoulder'],
    avatarHeadH: CD['avatarHeadH'], avatarHipsH: CD['avatarHipsH'], avatarIsDefault: CD['avatarIsDefault'],
    setupSec: CD['setupSec'], setupRetry: CD['setupRetry'], avatarCheckFallback: CD['avatarCheckFallback'],
    // device check
    deviceCheckSec: CD['deviceCheckSec'], deviceCheckForced: CD['deviceCheckForced'],
    // forehead height (same row): the left hand held at the participant's forehead when the button was clicked, above
    // the head bone (m; '' when the bones were not readable), the hand's and the head bone's world heights then,
    // seconds taken
    foreheadCalUp: CD['foreheadCalUp'], foreheadCalHandY: CD['foreheadCalHandY'], foreheadCalHeadY: CD['foreheadCalHeadY'],
    foreheadCalSec: CD['foreheadCalSec'],
    // per-trial report
    rating: CD['rating'], mc: CD['mc'], ptype: CD['ptype'], ploc: CD['ploc'], reportDoneTs: CD['reportDoneTs'],
    ptypeOther: CD['ptypeOther'], plocOther: CD['plocOther'],
    // NPC measurements
    social: CD['social'], npcBlock: CD['npcBlock'], npcRep: CD['npcRep'], npcAvatar: CD['npcAvatar'],
    trialStartTs: CD['trialStartTs'], reachStartTs: CD['reachStartTs'], contactTs: CD['contactTs'], retractEndTs: CD['retractEndTs'],
    strokeEndTs: CD['strokeEndTs'], strokeAmp: CD['strokeAmp'], strokeCycles: CD['strokeCycles'],
    strokeBack: CD['strokeBack'], strokeReturnSpeed: CD['strokeReturnSpeed'], strokeRampSec: CD['strokeRampSec'],
    // guided greeting (every trial): seconds from each instruction to the participant following it (0 = already
    // doing it, -1 = skipped after the timeout), number skipped, cues the NPC received, and the NPC's counters
    greetStepSec: CD['greetStepSec'], greetTimeouts: CD['greetTimeouts'], greetCues: CD['greetCues'],
    greetSec: CD['greetSec'], greetGazeEvents: CD['greetGazeEvents'], greetHandRaises: CD['greetHandRaises'],
    greetNpcReactions: CD['greetNpcReactions'], greetNpcNods: CD['greetNpcNods'], greetNpcWaves: CD['greetNpcWaves'],
    greetNpcSmiles: CD['greetNpcSmiles'], greetTouches: CD['greetTouches'],
    // height matching (head-bone heights, m; platform under the participant / riser under the NPC)
    participantHeadH: CD['participantHeadH'], npcHeadH: CD['npcHeadH'], heightPlatform: CD['heightPlatform'], npcLift: CD['npcLift'],
    pathLen: CD['pathLen'], reachDur: CD['reachDur'], contactDist: CD['contactDist'], reachable: CD['reachable'],
    headPos0: CD['headPos0'], headRot0: CD['headRot0'],
    // touch target height above the head bone (m) and where it came from: calibrated (forehead) / eyeBones / headBone
    faceUp: CD['faceUp'], faceUpSrc: CD['faceUpSrc'],
    retreatOnsetDist: CD['retreatOnsetDist'], retreatDist: CD['retreatDist'], oscAmp: CD['oscAmp'],
    // backing away with the stick during the touch (slow, touchMoveRate x the normal speed): avatar position at the
    // approach start, its distance from the marker then / at the end of the retract, its retreat like retreatDist,
    // and whether the participant was put back on the marker after the NPC had gone
    touchMoveRate: CD['touchMoveRate'], rootStart: CD['rootStart'], rootShiftPre: CD['rootShiftPre'],
    rootRetreat: CD['rootRetreat'], rootShiftEnd: CD['rootShiftEnd'], returnedToMarker: CD['returnedToMarker'],
    lookedAtNpc: CD['lookedAtNpc'], lookTs: CD['lookTs'], greeted: CD['greeted'],
    npcTimeout: CD['npcTimeout'],
    trace: CD['trace'],
};
