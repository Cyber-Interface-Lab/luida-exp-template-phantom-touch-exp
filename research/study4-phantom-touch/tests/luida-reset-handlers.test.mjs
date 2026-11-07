// Session reset handlers in the LUIDA scripts (ParticipantManager, ConditionManager, FormController).
// Run: node --test research/study4-phantom-touch/tests/
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadItem, makeHandle, makePlayer, throwOnceOnSet, LUIDA_SCRIPTS, VARIABLES_JS } from "./cluster-mock.mjs";

const PM_JS = path.join(LUIDA_SCRIPTS, "ParticipantHandler/ParticipantManager.js");
const CM_JS = path.join(LUIDA_SCRIPTS, "ConditionManagement/ConditionManager.js");
const FORM_JS = path.join(LUIDA_SCRIPTS, "Form/FormController.js");

const plain = (v) => JSON.parse(JSON.stringify(v));   // values from the vm realm

function newWorld() { return { global: { exp_trialID: 0 }, players: [] }; }

// ParticipantManager after a finished session: one participant enrolled, enough participants.
function finishedPm(world) {
  const cm = makeHandle("ConditionManager");
  const pm = loadItem([PM_JS], { world, refs: { ConditionManager: cm }, name: "PM" });
  pm.cb.start();
  const p1 = makePlayer("p1");
  world.players.push(p1);
  pm.update(1.0);                                  // enroll p1
  pm.receive("envInfoResponse", { device: "pc" }, p1);   // test mode: eligible -> enough
  assert.equal(pm.groupState.isParticipantsEnough, true);
  assert.equal(pm.state.eligibleCount, 1);
  p1.here = false;                                 // p1 left
  return { pm, cm, p1 };
}

test("ParticipantManager: reset starts a new session and acknowledges", () => {
  const world = newWorld();
  const { pm } = finishedPm(world);
  const oldSid = pm.groupState.sessionID;
  const sender = makeHandle("SessionReset");
  pm.receive("luida_reset", { token: "t1" }, sender);
  assert.notEqual(pm.groupState.sessionID, oldSid);
  assert.equal(pm.groupState.isParticipantsEnough, false);
  assert.deepEqual(plain(pm.groupState.participants), []);
  assert.equal(pm.state.eligibleCount, 0);
  assert.deepEqual(plain(pm.state.participantsEnvInfo), []);
  assert.equal(pm.itemState.exp_showWaitingMessage, true);
  assert.equal(pm.state.luida_lastResetToken, "t1");
  assert.deepEqual(plain(sender.sent), [{ type: "luida_reset_ack", arg: { token: "t1", sessionID: pm.groupState.sessionID } }]);
  // No luida_participants_info during a reset (the new sessionID has no backend session yet).
  assert.equal(pm.refs.ConditionManager.sent.filter((m) => m.type === "luida_participants_info").length, 1);

  // The next participant is enrolled with the new sessionID.
  const p2 = makePlayer("p2");
  world.players.push(p2);
  pm.update(1.0);
  assert.deepEqual(plain(pm.groupState.participants.map((p) => p.idfc)), ["p2"]);
  pm.receive("envInfoResponse", { device: "pc" }, p2);
  assert.equal(pm.groupState.isParticipantsEnough, true);
  assert.deepEqual(plain(pm.state.participantsEnvInfo.map((i) => i.idfc)), ["p2"]);
});

test("ParticipantManager: a failed reset is retried by the re-send (M2)", () => {
  const world = newWorld();
  const { pm } = finishedPm(world);
  const sender = makeHandle("SessionReset");
  pm.stateProxy = throwOnceOnSet(pm.state, "eligibleCount");
  assert.throws(() => pm.receive("luida_reset", { token: "t1" }, sender), /injected failure/);
  assert.equal(pm.state.luida_lastResetToken, undefined, "token must not be saved after a failure");
  assert.equal(sender.sent.length, 0, "no ack after a failure");
  assert.equal(pm.groupState.isParticipantsEnough, true, "enrollment stays blocked after a failure");

  pm.receive("luida_reset", { token: "t1" }, sender);           // re-send
  assert.equal(pm.state.luida_lastResetToken, "t1");
  assert.equal(pm.state.eligibleCount, 0);
  assert.equal(pm.groupState.isParticipantsEnough, false);
  assert.equal(sender.sent.length, 1);
  const sid = pm.groupState.sessionID;

  pm.receive("luida_reset", { token: "t1" }, sender);           // duplicate: no second reset
  assert.equal(pm.groupState.sessionID, sid);
  assert.equal(sender.sent.length, 2);
  assert.equal(sender.sent[1].arg.sessionID, sid);
  assert.equal(pm.logs.filter((l) => l.startsWith("LUIDA session reset")).length, 1);
});

function startedCm(world, extraGlobals = {}) {
  const cm = loadItem([VARIABLES_JS, CM_JS], { world, refs: { ParticipantManager: makeHandle("ParticipantManager") }, name: "CM",
    globals: extraGlobals });
  cm.cb.start();
  return cm;
}

// Runs the CM through all trials the way the Global exp_trialID moves; returns how often exp_readyToLeaveTrials was sent.
function runTrials(cm, world) {
  for (let t = 0; t < 4; t++) { world.global.exp_trialID = t; cm.update(0.02); }
  return cm.signals.filter((s) => s === "exp_readyToLeaveTrials").length;
}

test("ConditionManager: reset clears isLast so the next participant gets all trials", () => {
  const world = newWorld();
  const cm = startedCm(world);
  assert.equal(cm.state.trialCount, 4);
  assert.equal(runTrials(cm, world), 1);
  assert.equal(cm.state.isLast, true);
  world.global.exp_trialID = 0;            // the session reset sets the Global back to 0
  cm.receive("luida_reset", { token: "t1" }, makeHandle("SessionReset"));
  assert.equal(cm.groupState.luida_resetAck, "t1");
  assert.equal(cm.state.isLast, false);
  assert.equal(cm.state.trialID, 0);
  assert.equal(cm.state.isServerAssigned, false);
  assert.equal(runTrials(cm, world), 2, "the second participant leaves the trial loop after 4 trials too");
});

test("ConditionManager: a failed reset is retried by the re-send (M2)", () => {
  const world = newWorld();
  const cm = startedCm(world);
  runTrials(cm, world);
  world.global.exp_trialID = 0;
  cm.stateProxy = throwOnceOnSet(cm.state, "withinSubjectsVariableNames");   // inside reset()
  assert.throws(() => cm.receive("luida_reset", { token: "t1" }, makeHandle("SessionReset")), /injected failure/);
  assert.equal(cm.state.luida_lastResetToken, undefined);
  assert.notEqual(cm.groupState.luida_resetAck, "t1", "no ack after a failure");

  cm.receive("luida_reset", { token: "t1" }, makeHandle("SessionReset"));
  assert.equal(cm.groupState.luida_resetAck, "t1");
  assert.equal(cm.state.luida_lastResetToken, "t1");
  assert.equal(cm.state.trialCount, 4);
  assert.equal(cm.state.isLast, false);

  cm.receive("luida_reset", { token: "t1" }, makeHandle("SessionReset"));   // duplicate
  assert.equal(cm.logs.filter((l) => l === "[ConditionManager] session reset").length, 1);
  assert.equal(cm.groupState.luida_resetAck, "t1");
});

test("FormController: a new sessionID reopens the form for the next participant", () => {
  const world = newWorld();
  const group = { participants: [], isParticipantsEnough: false, sessionID: "s1" };
  const refs = { PrevButton: makeHandle("PrevButton"), NextButton: makeHandle("NextButton"), ConditionManager: makeHandle("CM") };
  const form = loadItem([FORM_JS], { world, groupState: group, refs, name: "Form" });
  form.itemState.pID = 1;
  form.cb.start();
  form.update(0.02);                       // first frame: only records the sessionID
  assert.equal(form.state.boundSessionID, "s1");

  const p1 = makePlayer("p1");
  group.participants = [p1];
  group.isParticipantsEnough = true;
  form.update(0.02);
  assert.equal(form.state.participant, p1);
  // the form was answered and sent
  form.state.isInitiated = true;
  form.state.isSubmitted = true;
  form.itemState.form_show_start_hint = false;
  form.update(0.02);
  assert.equal(form.state.isSubmitted, true, "nothing changes while the sessionID is the same");

  // reset: ParticipantManager makes a new session; p2 is enrolled one second later
  group.sessionID = "s2";
  group.participants = [];
  group.isParticipantsEnough = false;
  form.update(0.02);
  assert.equal(form.state.isParticipantAssigned, false);
  assert.equal(form.state.participant, null);
  assert.equal(form.state.isSubmitted, false);
  assert.equal(form.state.isInitiated, false);
  assert.equal(form.itemState.form_show_start_hint, true);
  assert.equal(form.itemState.form_set_content_active, false);

  const p2 = makePlayer("p2");
  group.participants = [p2];
  group.isParticipantsEnough = true;
  form.update(0.02);
  assert.equal(form.state.participant, p2);
  assert.equal(refs.NextButton.sent.at(-1).arg, p2);
});

test("FormController: reset and assignment in the same frame when the item wakes up late", () => {
  const world = newWorld();
  const p1 = makePlayer("p1");
  const group = { participants: [p1], isParticipantsEnough: true, sessionID: "s1" };
  const refs = { PrevButton: makeHandle("PrevButton"), NextButton: makeHandle("NextButton") };
  const form = loadItem([FORM_JS], { world, groupState: group, refs, name: "Form" });
  form.itemState.pID = 1;
  form.cb.start();
  form.update(0.02);
  form.state.isSubmitted = true;
  form.state.isInitiated = true;
  // the container was inactive while the reset and p2's enrollment happened
  const p2 = makePlayer("p2");
  group.sessionID = "s2";
  group.participants = [p2];
  form.update(0.02);
  assert.equal(form.state.participant, p2);
  assert.equal(form.state.isSubmitted, false);
});
