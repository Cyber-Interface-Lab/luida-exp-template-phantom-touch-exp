// New-participant prompt and session reset inside the LUIDA scripts (ParticipantManager asks a newly joined
// player before resetting; "いいえ" rebinds a participant who rejoined with the same account).
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadItem, makeHandle, makePlayer, throwOnceOnSet, LUIDA_SCRIPTS, VARIABLES_JS } from "./cluster-mock.mjs";

const PM_JS = path.join(LUIDA_SCRIPTS, "ParticipantHandler/ParticipantManager.js");
const NO_JS = path.join(LUIDA_SCRIPTS, "ParticipantHandler/NewParticipantPromptNo.js");
const CM_JS = path.join(LUIDA_SCRIPTS, "ConditionManagement/ConditionManager.js");
const FORM_JS = path.join(LUIDA_SCRIPTS, "Form/FormController.js");
// The uploader is a prefix (ends inside calculateData/saveData) + the world's calculator code + a suffix.
const UPLOADER_JS = path.join(LUIDA_SCRIPTS, "CustomDataCollection/CustomDataUploader.js");
const UPLOADER_SUFFIX_JS = path.join(LUIDA_SCRIPTS, "CustomDataCollection/CustomDataUploaderSuffix.js");

const plain = (v) => JSON.parse(JSON.stringify(v));   // values from the vm realm
const ASK = "中断または終了したセッションに入ったようです。\n「OK」を押すと、実験を最初から始めます。\n" +
            "It seems you have entered a session that\nwas interrupted or has ended.\nPress OK to restart the experiment\nfrom the beginning.";
const ASK_RESUME = "中断したセッションに戻ってきたようです。\n「OK」で最初から、「続きから」で再開します。\n" +
                   "You seem to have returned to an\ninterrupted session.\nPress OK to start over,\nor Resume to continue.";
const BUSY = "初期化しています。しばらくお待ちください…\nResetting the experiment, please wait…";
const ERROR = "エラー：実験の初期化に失敗しました。\n実験者にご連絡ください。\nError: the reset failed.\nPlease contact the experimenter.";

// Globals of a session in the middle of the trials; the GlobalLogics on the ParticipantManager prefab are
// emulated by onSignal (immediately, or only when applyGlobals() is called).
function newWorld({ deferGlobals = false } = {}) {
  const world = { global: { state_currentID: 5, exp_trialID: 2, exp_readyToLeaveTrials: true, exp_arePlayersEnough: true }, players: [] };
  world.onSignal = (item, key) => { if (key === "exp_sessionReset" && !deferGlobals) applyGlobals(world); };
  return world;
}
function applyGlobals(world) {
  Object.assign(world.global, { state_currentID: 0, exp_trialID: 0, exp_readyToLeaveTrials: false, exp_arePlayersEnough: false });
}

// ParticipantManager with P1 enrolled and the session running (test mode: one eligible player is enough).
function runningPm(world, { withNoItem = true, subNodes = null } = {}) {
  const cm = makeHandle("ConditionManager");
  const refs = { ConditionManager: cm };
  if (withNoItem) refs.NewParticipantPromptNo = makeHandle("NewParticipantPromptNo");
  const pm = loadItem([PM_JS], { world, refs, name: "PM", subNodes });
  pm.cb.start();
  const p1 = makePlayer("acc1", "join1");
  world.players.push(p1);
  pm.update(1.0);                                       // enrolled
  pm.receive("envInfoResponse", { device: "vr" }, p1);
  assert.equal(pm.groupState.isParticipantsEnough, true);
  assert.deepEqual(plain(pm.state.participantIdfcs), ["acc1"]);
  return { pm, cm, p1, no: refs.NewParticipantPromptNo };
}
const panel = (pm) => pm.subNodes.NewParticipantPrompt;
const yes = (pm) => pm.subNodes.NewParticipantPromptOk;   // the "OK" button
const text = (pm) => pm.subNodes.NewParticipantPromptText?.text;
const tick = (pm, n = 1) => { for (let i = 0; i < n; i++) pm.update(1.0); };
const sentTypes = (h) => h.sent.map((m) => m.type);
const SHOW_TICKS = 5;   // detection (1) + delay (3) + place while hidden (1) -> shown at the 5th poll

test("P1: no prompt while an enrolled participant is still here", () => {
  const world = newWorld();
  const { pm } = runningPm(world);
  world.players.push(makePlayer("acc2", "join2"));     // a bystander
  tick(pm, 8);
  assert.notEqual(panel(pm)?.enabled, true);
  assert.equal(pm.state.nr_phase || "idle", "idle");
  assert.equal(pm.groupState.isParticipantsEnough, true);
});

test("P2: a stranger alone is asked after the delay; nothing is reset before the answer", () => {
  const world = newWorld();
  const { pm, cm, p1, no } = runningPm(world);
  const sid = pm.groupState.sessionID;
  p1.here = false;
  world.players.push(makePlayer("acc2", "join2"));
  tick(pm, SHOW_TICKS - 1);
  assert.notEqual(panel(pm)?.enabled, true, "not shown before the delay");
  assert.equal(pm.state.nr_placed, true, "placed (hidden) one poll before showing");
  assert.ok(sentTypes(no).includes("luida_prompt_place"));
  tick(pm, 1);
  assert.equal(panel(pm).enabled, true);
  assert.equal(text(pm), ASK);
  assert.equal(yes(pm).enabled, true);
  assert.equal(sentTypes(no).at(-1), "luida_prompt_hide", "no resume for another account");
  assert.equal(pm.groupState.sessionID, sid);
  assert.equal(pm.groupState.isParticipantsEnough, true);
  assert.ok(!sentTypes(cm).includes("luida_reset"));
  assert.ok(!pm.signals.includes("exp_sessionReset"));
});

test("P3: the same account in a new join is asked too, with the resume option", () => {
  const world = newWorld();
  const { pm, p1, no } = runningPm(world);
  p1.here = false;
  world.players.push(makePlayer("acc1", "join2"));
  tick(pm, SHOW_TICKS);
  assert.equal(panel(pm).enabled, true);
  assert.equal(text(pm), ASK_RESUME);
  assert.equal(sentTypes(no).at(-1), "luida_prompt_show");
});

test("P4: the stranger leaves without answering; the next one is asked again", () => {
  const world = newWorld();
  const { pm, p1, no } = runningPm(world);
  p1.here = false;
  const p2 = makePlayer("acc2", "join2");
  world.players.push(p2);
  tick(pm, SHOW_TICKS);
  assert.equal(panel(pm).enabled, true);
  p2.here = false;
  tick(pm, 1);
  assert.equal(panel(pm).enabled, false);
  assert.equal(sentTypes(no).at(-1), "luida_prompt_hide");
  assert.equal(pm.state.nr_phase, "idle");
  world.players.push(makePlayer("acc3", "join3"));
  tick(pm, SHOW_TICKS);
  assert.equal(panel(pm).enabled, true);
  assert.equal(pm.state.nr_for, "join3");
});

test("P5-P7: 'はい' resets globals and ConditionManager, waits for both, then this item; P2 is then enrolled", () => {
  const world = newWorld({ deferGlobals: true });
  const { pm, cm, p1, no } = runningPm(world);
  const sid = pm.groupState.sessionID;
  p1.here = false;
  const p2 = makePlayer("acc2", "join2");
  world.players.push(p2);
  tick(pm, SHOW_TICKS);
  pm.cb.interact(p2);
  assert.equal(pm.signals.filter((s) => s === "exp_sessionReset").length, 1);
  const resets = cm.sent.filter((m) => m.type === "luida_reset");
  assert.equal(resets.length, 1);
  const token = resets[0].arg.token;
  assert.ok(token.startsWith(sid + ":"));
  assert.equal(text(pm), BUSY);
  assert.equal(yes(pm).enabled, false);
  assert.equal(sentTypes(no).at(-1), "luida_prompt_hide");
  assert.equal(pm.state.nr_phase, "settle");

  // Nothing confirmed: re-sent every 2 s, error text after 15 s, never completes.
  tick(pm, 15);
  assert.equal(pm.groupState.sessionID, sid, "not reset without confirmation");
  assert.equal(pm.groupState.isParticipantsEnough, true);
  assert.ok(pm.signals.filter((s) => s === "exp_sessionReset").length >= 6);
  assert.ok(cm.sent.filter((m) => m.type === "luida_reset").length >= 6);
  assert.equal(text(pm), ERROR);

  // Globals arrive but ConditionManager has not answered: still waiting, only the CM request is re-sent.
  applyGlobals(world);
  const signalsBefore = pm.signals.length;
  tick(pm, 2);
  assert.equal(pm.groupState.sessionID, sid);
  assert.equal(pm.signals.length, signalsBefore, "globals are confirmed; no more exp_sessionReset");

  // A wrong token is ignored; the right one completes the reset.
  pm.receive("luida_reset_ack", { token: "other" }, cm);
  tick(pm, 1);
  assert.equal(pm.groupState.sessionID, sid);
  pm.receive("luida_reset_ack", { token }, cm);
  tick(pm, 1);
  assert.notEqual(pm.groupState.sessionID, sid);
  assert.equal(pm.itemState.exp_showWaitingMessage, true);
  assert.equal(panel(pm).enabled, false);
  assert.equal(pm.state.nr_phase, "idle");
  assert.ok(pm.logs.some((l) => l.startsWith("LUIDA session reset: new sID=")));

  // initSession() ends with isParticipantsEnough = false, and the existing enrollment poll (same update, 1 s
  // timer) takes P2 right away, with the new sessionID.
  assert.equal(pm.groupState.isParticipantsEnough, false);
  assert.deepEqual(plain(pm.groupState.participants.map((p) => p.idfc)), ["acc2"]);
  assert.deepEqual(plain(pm.state.participantIdfcs), ["acc2"]);
  assert.equal(pm.playerScripts.at(-1), p2);
  pm.receive("envInfoResponse", { device: "vr" }, p2);
  assert.equal(pm.groupState.isParticipantsEnough, true);
  assert.equal(cm.sent.filter((m) => m.type === "luida_participants_info").length, 2);
});

test("P8: a failure inside initSession shows the error and is retried at the next poll", () => {
  const world = newWorld();
  const { pm, cm, p1 } = runningPm(world);
  const sid = pm.groupState.sessionID;
  p1.here = false;
  const p2 = makePlayer("acc2", "join2");
  world.players.push(p2);
  tick(pm, SHOW_TICKS);
  pm.cb.interact(p2);
  const token = cm.sent.find((m) => m.type === "luida_reset").arg.token;
  pm.receive("luida_reset_ack", { token }, cm);
  pm.stateProxy = throwOnceOnSet(pm.state, "eligibleCount");
  tick(pm, 1);
  assert.equal(pm.groupState.isParticipantsEnough, true, "enrollment stays blocked after a failed initSession");
  assert.equal(text(pm), ERROR);
  assert.equal(pm.state.nr_phase, "settle");
  tick(pm, 1);
  assert.notEqual(pm.groupState.sessionID, sid);
  assert.equal(pm.groupState.isParticipantsEnough, false);
  assert.equal(pm.state.nr_phase, "idle");
});

test("P9: interacting outside the asking phase does nothing", () => {
  const world = newWorld();
  const { pm, cm, p1 } = runningPm(world);
  pm.cb.interact(p1);
  tick(pm, 2);
  assert.ok(!pm.signals.includes("exp_sessionReset"));
  assert.ok(!sentTypes(cm).includes("luida_reset"));
  assert.equal(pm.groupState.isParticipantsEnough, true);
});

test("P10: a ParticipantManager prefab without the prompt sub-nodes never asks and never resets", () => {
  const world = newWorld();
  const { pm, cm, p1 } = runningPm(world, { withNoItem: false, subNodes: ["WaitingMessage", "WorldGateToLuidaBar"] });
  const sid = pm.groupState.sessionID;
  p1.here = false;
  const p2 = makePlayer("acc2", "join2");
  world.players.push(p2);
  tick(pm, SHOW_TICKS + 3);
  assert.equal(pm.subNodes.NewParticipantPrompt, undefined);
  pm.cb.interact(p2);
  tick(pm, 2);
  assert.equal(pm.groupState.sessionID, sid);
  assert.ok(!pm.signals.includes("exp_sessionReset"));
  assert.ok(!sentTypes(cm).includes("luida_reset"));
});

test("R1: 'いいえ' from the same account puts the player back into their slot; nothing is reset", () => {
  const world = newWorld();
  const { pm, cm, p1, no } = runningPm(world);
  const sid = pm.groupState.sessionID;
  p1.here = false;
  const p1b = makePlayer("acc1", "join2");
  world.players.push(p1b);
  tick(pm, SHOW_TICKS);
  assert.equal(text(pm), ASK_RESUME);
  pm.receive("luida_prompt_no", { player: p1b }, no);
  assert.equal(pm.groupState.participants[0], p1b);
  assert.deepEqual(plain(pm.state.participantIdfcs), ["acc1"]);
  assert.equal(pm.playerScripts.at(-1), p1b);
  const rebind = cm.sent.find((m) => m.type === "luida_rebind_participant");
  assert.equal(rebind.arg.index, 0);
  assert.equal(rebind.arg.player, p1b);
  assert.equal(pm.groupState.sessionID, sid);
  assert.equal(pm.groupState.isParticipantsEnough, true);
  assert.ok(!sentTypes(cm).includes("luida_reset"));
  assert.equal(panel(pm).enabled, false);
  assert.equal(sentTypes(no).at(-1), "luida_prompt_hide");
  tick(pm, 5);
  assert.equal(pm.state.nr_phase, "idle", "the rejoined participant counts as enrolled");
  assert.notEqual(panel(pm).enabled, true);
});

test("R2: 'いいえ' from another account only closes the prompt", () => {
  const world = newWorld();
  const { pm, cm, p1, no } = runningPm(world);
  p1.here = false;
  const p2 = makePlayer("acc2", "join2");
  world.players.push(p2);
  tick(pm, SHOW_TICKS);
  pm.receive("luida_prompt_no", { player: p2 }, no);
  assert.equal(pm.groupState.participants[0], p1);
  assert.ok(!sentTypes(cm).includes("luida_rebind_participant"));
  assert.equal(panel(pm).enabled, false);
  assert.equal(pm.state.nr_phase, "idle");
});

test("N1: the 'いいえ' item follows the manager's messages and reports the player", () => {
  const world = newWorld();
  const item = loadItem([NO_JS], { world, name: "No" });
  item.cb.start();
  assert.equal(item.subNodes.Body.enabled, false);
  const pm = makeHandle("PM");
  item.receive("luida_prompt_place", { pos: { x: 1, y: 2, z: 3 }, rot: { x: 0, y: 0, z: 0, w: 1 } }, pm);
  assert.deepEqual(plain(item.pos), { x: 1, y: 2, z: 3 });
  assert.equal(item.subNodes.Body.enabled, false);
  item.receive("luida_prompt_show", {}, pm);
  assert.equal(item.subNodes.Body.enabled, true);
  const p = makePlayer("acc1", "join2");
  item.cb.interact(p);
  assert.deepEqual(sentTypes(pm), ["luida_prompt_no"]);
  assert.equal(pm.sent[0].arg.player, p);
  item.receive("luida_prompt_hide", {}, pm);
  assert.equal(item.subNodes.Body.enabled, false);
});

test("C1: ConditionManager replies to luida_reset, forgets collected values on a new sessionID, rebinds a participant", () => {
  const world = { global: { exp_trialID: 0 }, players: [] };
  const cm = loadItem([VARIABLES_JS, CM_JS], { world, refs: { ParticipantManager: makeHandle("PM") }, name: "CM" });
  cm.cb.start();
  const pm = makeHandle("PM");
  const p1 = makePlayer("acc1", "join1");
  cm.receive("luida_participants_info", { participants: [p1], sessionID: "s1" }, pm);
  cm.groupState.collectedData = { greetSec: 30, stateLog: { id: 3 } };
  cm.receive("luida_participants_info", { participants: [p1], sessionID: "s1" }, pm);
  assert.deepEqual(plain(cm.groupState.collectedData), { greetSec: 30, stateLog: { id: 3 } }, "same session: kept");

  cm.receive("luida_reset", { token: "t1" }, pm);
  assert.equal(cm.groupState.luida_resetAck, "t1");
  assert.deepEqual(plain(pm.sent.filter((m) => m.type === "luida_reset_ack")), [{ type: "luida_reset_ack", arg: { token: "t1" } }]);
  assert.equal(cm.state.isLast, false);
  cm.receive("luida_reset", { token: "t1" }, pm);
  assert.equal(pm.sent.filter((m) => m.type === "luida_reset_ack").length, 2, "re-send: reply only");
  assert.deepEqual(plain(cm.groupState.collectedData), { greetSec: 30, stateLog: { id: 3 } }, "not cleared by the reset itself");

  const p2 = makePlayer("acc2", "join2");
  cm.receive("luida_participants_info", { participants: [p2], sessionID: "s2" }, pm);
  assert.deepEqual(plain(cm.groupState.collectedData), {}, "new session: forgotten");
  assert.equal(cm.groupState.participants[0], p2);

  const p2b = makePlayer("acc2", "join3");
  cm.receive("luida_rebind_participant", { index: 0, player: p2b }, pm);
  assert.equal(cm.groupState.participants[0], p2b);
  cm.receive("luida_rebind_participant", { index: 5, player: p2b }, pm);
  assert.equal(cm.groupState.participants.length, 1);
});

test("U1: the uploader drops unsent rows when the group's sessionID changes, not on the first one nor while uploading", () => {
  const world = { global: {}, players: [] };
  const up = loadItem([UPLOADER_JS, UPLOADER_SUFFIX_JS], { world, name: "DataCollector" });
  up.cb.start();
  up.update(0.1);
  up.groupState.sessionID = "s1";
  up.state.customData = [{ a: 1 }];
  up.update(0.1);
  assert.equal(up.state.customData.length, 1, "first sessionID: nothing dropped");
  up.state.customData = [{ a: 1 }, { a: 2 }];
  up.groupState.sessionID = "s2";
  up.update(0.1);
  assert.deepEqual(plain(up.state.customData), []);
  assert.ok(up.logs.some((l) => l.includes("dropping 2 unsent row(s)")));
  up.state.customData = [{ a: 3 }];
  up.state.isUploading = true;
  up.groupState.sessionID = "s3";
  up.update(0.1);
  assert.equal(up.state.customData.length, 1, "an upload in progress empties the buffer itself");
  up.update(0.1);
  assert.equal(up.state.customData.length, 1);
});

test("F1: a FormController follows a rebound participant and restarts an open form", () => {
  const world = { global: {}, players: [] };
  const p1 = makePlayer("acc1", "join1");
  const prev = makeHandle("PrevButton"), next = makeHandle("NextButton");
  const form = loadItem([FORM_JS], { world, groupState: { participants: [p1], isParticipantsEnough: true, sessionID: "s1", qCompletedCount: 0 },
    refs: { PrevButton: prev, NextButton: next }, name: "Form" });
  form.itemState.pID = 1;
  form.cb.start();
  form.update(0.1);
  assert.equal(form.state.participant, p1);
  assert.equal(prev.sent.filter((m) => m.type === "setParticipant").length, 1);

  p1.here = false;
  form.update(0.1);
  assert.equal(form.state.participant, p1, "nothing to follow yet");

  const p1b = makePlayer("acc1", "join2");
  form.groupState.participants = [p1b];
  form.state.isInitiated = true;            // the form was open when the participant dropped
  form.state.isSubmitted = false;
  form.update(0.1);
  assert.equal(form.state.participant, p1b);
  assert.equal(prev.sent.filter((m) => m.type === "setParticipant").at(-1).arg, p1b);
  assert.equal(next.sent.filter((m) => m.type === "setParticipant").at(-1).arg, p1b);
  assert.equal(form.state.isInitiated, false, "restarted");
  assert.equal(form.itemState.form_show_start_hint, true);
  assert.equal(form.itemState.form_set_content_active, false);
  assert.ok(p1b.sent.some((m) => m.type === "setQuestionnaireUI" && m.arg.n === "WaitingText" && m.arg.e === false));
  form.update(0.1);
  assert.equal(form.state.participant, p1b);
  assert.equal(form.state.isInitiated, false);
});
