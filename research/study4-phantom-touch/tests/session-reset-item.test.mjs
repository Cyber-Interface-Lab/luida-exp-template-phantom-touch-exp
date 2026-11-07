// SessionReset item (generated Assets/_Experiment_/Scripts/StateManagement/PhantomTouch/SessionReset.js) driven
// together with the real ConditionManager and ParticipantManager scripts (plan test M1).
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadItem, makeHandle, makePlayer, LUIDA_SCRIPTS, ITEM_SCRIPTS, VARIABLES_JS } from "./cluster-mock.mjs";

const SLI_BASE_JS = path.join(LUIDA_SCRIPTS, "StateManagement/StateListeningItemBase.js");
const SESSION_RESET_JS = path.join(ITEM_SCRIPTS, "SessionReset.js");
const PM_JS = path.join(LUIDA_SCRIPTS, "ParticipantHandler/ParticipantManager.js");
const CM_JS = path.join(LUIDA_SCRIPTS, "ConditionManagement/ConditionManager.js");
const S_START = 0, S_END = 11;
const DT = 0.125;   // exact in binary, so polls land every 0.5 s

// The world after the first participant reached End: Globals as the state machine left them.
function setup({ globalLogic = true, cmConnected = true, pmConnected = true } = {}) {
  const world = {
    global: { state_currentID: S_END, exp_trialID: 0, exp_readyToLeaveTrials: true, exp_arePlayersEnough: true },
    players: [],
  };
  const cmGroup = {};
  const cm = loadItem([VARIABLES_JS, CM_JS], { world, groupState: cmGroup, refs: { ParticipantManager: makeHandle("PM") }, name: "CM" });
  cm.cb.start();
  const pm = loadItem([PM_JS], { world, name: "PM", refs: {} });
  pm.cb.start();
  const npc = makeHandle("NPC");
  const refs = { NPC: npc };
  const sr = loadItem([SLI_BASE_JS, SESSION_RESET_JS], { world, groupState: cmGroup, refs, name: "SessionReset" });
  sr.cb.start();
  const srHandle = { send: (type, arg) => sr.receive(type, arg) };   // replies from ParticipantManager
  const cmCalls = [], pmCalls = [];
  refs.ConditionManager = { send: (type, arg) => { cmCalls.push({ type, arg }); if (cmConnected) cm.receive(type, arg, srHandle); } };
  refs.ParticipantManager = { send: (type, arg) => { pmCalls.push({ type, arg }); if (pmConnected) pm.receive(type, arg, srHandle); } };
  pm.refs.ConditionManager = { send: (type, arg) => cm.receive(type, arg, { send: (t, a) => pm.receive(t, a, cmHandleForPm) }) };
  const cmHandleForPm = makeHandle("CM");
  // CCK Logic: exp_sessionReset -> GlobalLogic x5; exp_StartStateTransition -> Global state_entered
  world.onSignal = (item, key) => {
    if (key === "exp_sessionReset" && globalLogic) {
      Object.assign(world.global, { state_currentID: 0, exp_trialID: 0, exp_readyToLeaveTrials: false, exp_arePlayersEnough: false });
      sr.itemState.state_exit = true;
    }
    if (key === "exp_StartStateTransition") sr.itemState.state_enter = true;
  };

  // the first participant ran the session and is at End
  const p1 = makePlayer("p1");
  world.players.push(p1);
  pm.update(1.0);
  pm.receive("envInfoResponse", {}, p1);
  cmGroup.participants = [p1];
  cmGroup.sessionID = pm.groupState.sessionID;
  sr.itemState.state_enter = true;           // End begins
  sr.update(DT);
  assert.equal(sr.state.sr_phase, "end");
  return { world, cm, pm, sr, npc, cmGroup, p1, cmCalls, pmCalls };
}

function run(t, seconds, alsoPm = true) {
  for (let s = 0; s < seconds; s += DT) {
    t.sr.update(DT);
    t.cm.update(DT);
    if (alsoPm) t.pm.update(DT);
  }
}

function leaveAndJoin(t) {
  t.p1.here = false;
  const p2 = makePlayer("p2");
  t.world.players = [p2];
  return p2;
}

test("end: no reset while the participant is still here, or before 5 s, or outside End", () => {
  const t = setup();
  run(t, 30);                                          // p1 stays at End
  assert.equal(t.sr.state.sr_phase, "end");
  assert.equal(t.cmCalls.length, 0);

  const t2 = setup();
  run(t2, 2);
  leaveAndJoin(t2);
  run(t2, 2);                                          // 4 s since End began
  assert.equal(t2.sr.state.sr_phase, "end", "waits for 5 s of script time since End");
  run(t2, 1.0);
  assert.ok(t2.cmCalls.length > 0, "then resets once 5 s have passed");
  run(t2, 2.0);
  assert.equal(t2.sr.state.sr_phase, "idle");

  const t3 = setup();
  t3.world.global.state_currentID = 7;                 // not End
  run(t3, 10);
  leaveAndJoin(t3);
  run(t3, 10);
  assert.equal(t3.cmCalls.length, 0);
});

test("end: no reset in an empty space (the previous participant left, nobody joined)", () => {
  const t = setup();
  t.p1.here = false;
  t.world.players = [];
  run(t, 10);
  assert.equal(t.sr.state.sr_phase, "end");
  assert.equal(t.cmCalls.length, 0);
});

test("full reset: Globals, ConditionManager, then ParticipantManager; the next participant starts", () => {
  const t = setup();
  run(t, 6);
  const oldSid = t.pm.groupState.sessionID;
  const p2 = leaveAndJoin(t);
  t.sr.update(0.5);                                    // poll -> reset
  assert.equal(t.sr.state.sr_phase, "settle");
  assert.ok(t.sr.signals.includes("exp_sessionReset"));
  assert.deepEqual(t.npc.sent.map((m) => m.type), ["npc_hide"]);
  assert.equal(t.cmGroup.participants.length, 0);
  assert.equal(t.cmCalls[0].type, "luida_reset");
  assert.equal(t.pmCalls.length, 0, "ParticipantManager is reset only after Globals and ConditionManager");
  assert.equal(t.pm.groupState.isParticipantsEnough, true, "enrollment still blocked");

  t.sr.update(0.5);                                    // settle confirmed -> pm
  assert.equal(t.cmGroup.luida_resetAck, t.sr.state.sr_token);
  assert.equal(t.pmCalls.length, 1);
  assert.notEqual(t.pm.groupState.sessionID, oldSid);
  assert.equal(t.sr.state.sr_pmAck, true);
  t.sr.update(0.5);
  assert.equal(t.sr.state.sr_phase, "idle");
  assert.ok(t.sr.logs.some((l) => l.includes("done; ParticipantManager reset acknowledged")));

  // ParticipantManager enrolls p2 with the new sessionID and starts the state machine
  t.pm.update(1.0);
  assert.deepEqual(JSON.parse(JSON.stringify(t.pm.groupState.participants.map((p) => p.idfc))), ["p2"]);
  t.pm.receive("envInfoResponse", {}, p2);
  assert.ok(t.pm.signals.includes("exp_StartStateTransition"));
  assert.equal(t.cmGroup.sessionID, t.pm.groupState.sessionID, "ConditionManager got the new sessionID");
  assert.equal(t.cm.state.isLast, false);
  t.world.onSignal(t.pm, "exp_StartStateTransition");
  t.sr.update(DT);                                     // Start
  assert.equal(t.sr.state.state_id, S_START);
  assert.equal(t.sr.state.sr_phase, "idle");
});

test("settle: Globals not reflected -> re-send every 2 s, never advance, error after 15 s, recover later", () => {
  const t = setup({ globalLogic: false });
  run(t, 6);
  leaveAndJoin(t);
  run(t, 0.5);
  assert.equal(t.sr.state.sr_phase, "settle");
  run(t, 20);
  assert.equal(t.sr.state.sr_phase, "settle");
  assert.equal(t.pmCalls.length, 0);
  assert.equal(t.pm.groupState.isParticipantsEnough, true, "the next participant is not enrolled");
  const resends = t.sr.signals.filter((s) => s === "exp_sessionReset").length;
  assert.ok(resends >= 8 && resends <= 11, "about one re-send per 2 s, got " + resends);
  assert.equal(t.cmGroup.luida_resetStatus.error, "reset");
  // the Logic finally applies
  Object.assign(t.world.global, { state_currentID: 0, exp_trialID: 0, exp_readyToLeaveTrials: false, exp_arePlayersEnough: false });
  run(t, 2);
  assert.equal(t.sr.state.sr_phase, "idle");
  assert.equal(t.cmGroup.luida_resetStatus.error, undefined);
});

test("settle: ConditionManager unreachable -> re-send luida_reset, never advance (R7 in the mock)", () => {
  const t = setup({ cmConnected: false });
  run(t, 6);
  leaveAndJoin(t);
  run(t, 20);
  assert.equal(t.sr.state.sr_phase, "settle");
  assert.ok(t.cmCalls.length >= 9, "re-sent " + t.cmCalls.length + " times");
  assert.equal(t.pmCalls.length, 0);
  assert.equal(t.cmGroup.luida_resetStatus.error, "reset");
});

test("pm: no ack -> re-send, error after 15 s; a wrong token is ignored; a late ack finishes", () => {
  const t = setup({ pmConnected: false });
  run(t, 6, false);
  leaveAndJoin(t);
  run(t, 1.5, false);
  assert.equal(t.sr.state.sr_phase, "pm");
  run(t, 16, false);
  assert.equal(t.sr.state.sr_phase, "pm");
  assert.ok(t.pmCalls.length >= 8, "re-sent " + t.pmCalls.length + " times");
  assert.equal(t.cmGroup.luida_resetStatus.error, "reset");
  t.sr.receive("luida_reset_ack", { token: "someone-else", sessionID: "x" });
  run(t, 1, false);
  assert.equal(t.sr.state.sr_phase, "pm");
  t.sr.receive("luida_reset_ack", { token: t.sr.state.sr_token, sessionID: "x" });
  run(t, 1, false);
  assert.equal(t.sr.state.sr_phase, "idle");
});

test("pm: Start before the ack ends the wait; the late ack is harmless", () => {
  const t = setup({ pmConnected: false });
  run(t, 6, false);
  leaveAndJoin(t);
  run(t, 1.5, false);
  assert.equal(t.sr.state.sr_phase, "pm");
  t.sr.itemState.state_enter = true;                   // Start (ParticipantManager reset and enrolled; ack lost)
  t.sr.update(DT);
  assert.equal(t.sr.state.sr_phase, "idle");
  t.sr.receive("luida_reset_ack", { token: t.sr.state.sr_token, sessionID: "x" });
  run(t, 2, false);
  assert.equal(t.sr.state.sr_phase, "idle");
  // the next End starts a fresh cycle with sr_pmAck cleared at the next reset
  t.world.global.state_currentID = S_END;
  t.sr.itemState.state_enter = true;
  t.sr.update(DT);
  assert.equal(t.sr.state.sr_phase, "end");
});
