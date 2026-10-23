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
    avatarHeadH: CD['avatarHeadH'], avatarHipsH: CD['avatarHipsH'], avatarIsTransparent: CD['avatarIsTransparent'],
    setupSec: CD['setupSec'], setupRetry: CD['setupRetry'],
    // device check
    deviceCheckSec: CD['deviceCheckSec'], deviceCheckForced: CD['deviceCheckForced'],
    // per-trial report
    rating: CD['rating'], mc: CD['mc'], ptype: CD['ptype'], ploc: CD['ploc'], reportDoneTs: CD['reportDoneTs'],
    // NPC measurements
    social: CD['social'], npcBlock: CD['npcBlock'], npcRep: CD['npcRep'], npcAvatar: CD['npcAvatar'],
    trialStartTs: CD['trialStartTs'], reachStartTs: CD['reachStartTs'], contactTs: CD['contactTs'], retractEndTs: CD['retractEndTs'],
    pathLen: CD['pathLen'], reachDur: CD['reachDur'], contactDist: CD['contactDist'], reachable: CD['reachable'],
    headPos0: CD['headPos0'], headRot0: CD['headRot0'],
    retreatOnsetDist: CD['retreatOnsetDist'], retreatDist: CD['retreatDist'], oscAmp: CD['oscAmp'],
    lookedAtNpc: CD['lookedAtNpc'], lookTs: CD['lookTs'], greeted: CD['greeted'],
    npcTimeout: CD['npcTimeout'],
    trace: CD['trace'],
};
