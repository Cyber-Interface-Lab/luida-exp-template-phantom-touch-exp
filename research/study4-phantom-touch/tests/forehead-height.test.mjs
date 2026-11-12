// Forehead height, measured in the pose check (generated DeviceCheck item): besides turning the head left and right,
// the participant holds both hands at the forehead for 3 s (above the eyes, not above the head, held still). The mean
// height of both hands above the head bone over the hold is sent to the NPC ("npc_forehead_cal"), which aims its hand
// there in this block.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, loadItem, makePlayer, makeHandle, Vector3, Quaternion, LUIDA_SCRIPTS, ITEM_SCRIPTS } from "./cluster-mock.mjs";

const SLI_BASE_JS = path.join(LUIDA_SCRIPTS, "StateManagement/StateListeningItemBase.js");
const NPC_JS = path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/NpcController.js");
const S_POSE = 2, DT = 0.05;
const HB = { Head: 10, LeftHand: 17, RightHand: 18 };

// Vector with a real rotation by a yaw-only quaternion (the shared mock's applyQuaternion is the identity).
class V3 extends Vector3 {
  applyQuaternion(q) { const a = 2 * Math.atan2(q.y, q.w), x = this.x, z = this.z; this.x = x * Math.cos(a) + z * Math.sin(a); this.z = -x * Math.sin(a) + z * Math.cos(a); return this; }
}
const yawQ = (deg) => new Quaternion(0, Math.sin(deg * Math.PI / 360), 0, Math.cos(deg * Math.PI / 360));

function start(t, trialId = 0) {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const p = makePlayer("p1");
  p.head = new V3(0, 1.5, -2); p.yaw = 0; p.lh = new V3(-0.25, 0.9, -2); p.rh = new V3(0.25, 0.9, -2);
  p.getHumanoidBonePosition = (b) => (b === HB.Head ? p.head : b === HB.LeftHand ? p.lh : b === HB.RightHand ? p.rh : null)?.clone() ?? null;
  p.getHumanoidBoneRotation = (b) => (b === HB.Head ? yawQ(p.yaw) : null);
  const refs = { NPC: makeHandle("NPC"), DC_Force: makeHandle("DC_Force") };
  const group = { participants: [p], currentCondition: { social: "with", block: "1" } };
  const world = { global: { state_currentID: S_POSE, exp_trialID: trialId }, players: [p] };
  const item = loadItem([SLI_BASE_JS, path.join(ITEM_SCRIPTS, "DeviceCheck.js")],
    { world, groupState: group, name: "DeviceCheck", refs, globals: { Vector3: V3, HumanoidBone: HB } });
  item.cb.start();
  item.itemState.state_enter = true;
  const run = (sec) => { for (let i = 0; i < Math.round(sec / DT); i++) { now += DT * 1000; item.update(DT); } };
  const visible = (id) => refs[id].sent.filter((m) => m.arg.visible !== undefined).at(-1)?.arg.visible;
  const text = () => item.subNodes.Text?.text || "";
  const click = (v) => { item.itemState.dc_btn = v; run(DT); };
  const turnHead = () => { run(0.1); p.yaw = -30; run(0.1); p.yaw = 30; run(0.1); p.yaw = 0; };
  const hands = (l, r) => { p.lh = new V3(-0.15, 1.5 + l, -1.9); p.rh = new V3(0.15, 1.5 + r, -1.9); };
  const handsDown = () => { p.lh = new V3(-0.25, 0.9, -2); p.rh = new V3(0.25, 0.9, -2); };
  const foreheadCal = () => refs.NPC.sent.filter((m) => m.type === "npc_forehead_cal").map((m) => m.arg.up);
  const done = () => item.signals.includes("state_triggerTransition");
  return { item, p, refs, group, run, visible, text, click, turnHead, hands, handsDown, foreheadCal, done };
}

test("both hands held still at the forehead for 3 s finish the pose check and give the forehead height", (t) => {
  const g = start(t);
  g.run(0.1);
  assert.match(g.text(), /頭を左右に向ける[\s\S]*両手を額の高さに（3秒）/);
  g.turnHead();
  assert.equal(g.done(), false);
  g.hands(0.10, 0.12);
  g.run(2.9);
  assert.equal(g.done(), false, "not before 3 s");
  g.run(0.2);
  assert.equal(g.done(), true);
  assert.equal(g.foreheadCal().length, 1);
  assert.ok(Math.abs(g.foreheadCal()[0] - 0.11) < 1e-9, "mean of both hands over the hold: " + g.foreheadCal()[0]);
  const cd = g.group.collectedData;
  assert.deepEqual([cd.foreheadCalUp, cd.foreheadCalLeftUp, cd.foreheadCalRightUp, cd.deviceCheckForced], [0.11, 0.1, 0.12, false]);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("the hold may come before the head turns; the check ends once both are done", (t) => {
  const g = start(t);
  g.hands(0.11, 0.11); g.run(3.2);
  assert.equal(g.done(), false);
  assert.match(g.text(), /\[済\] 両手を額の高さに/);
  g.handsDown(); g.run(1.0);
  g.turnHead();
  assert.equal(g.done(), true);
  assert.ok(Math.abs(g.foreheadCal()[0] - 0.11) < 1e-9, "the hold's height, not the hands' height at the end");
});

test("hands moving, below the eyes or raised above the head start the 3 s again", (t) => {
  const g = start(t);
  g.turnHead();
  g.hands(0.04, 0.10); g.run(4.0);                       // left hand below the eyes (head bone + 6 cm)
  assert.equal(g.done(), false);
  g.hands(0.30, 0.30); g.run(4.0);                       // both hands above the head
  assert.equal(g.done(), false);
  g.hands(0.10, 0.10); g.run(2.0);
  g.hands(0.10, 0.17); g.run(2.0);                       // right hand moved 7 cm: starts again
  assert.equal(g.done(), false);
  g.run(1.1);
  assert.equal(g.done(), true);
  assert.ok(Math.abs(g.foreheadCal()[0] - 0.135) < 1e-9, "only the last, still hold counts: " + g.foreheadCal()[0]);
});

test("passed with the rescue button without a hold: no forehead height (the NPC keeps the eye bones)", (t) => {
  const g = start(t);
  g.run(61);
  assert.equal(g.visible("DC_Force"), true);
  g.click(1);
  assert.equal(g.done(), true);
  const cd = g.group.collectedData;
  assert.deepEqual([cd.deviceCheckForced, cd.foreheadCalUp], [true, ""]);
  assert.deepEqual(g.foreheadCal(), []);
});

test("the 2nd trial of a block skips the pose check", (t) => {
  const g = start(t, 1);
  g.run(0.2);
  assert.deepEqual(g.item.signals, ["state_triggerTransition"]);
});

test("the NPC aims at the measured forehead height until the next block's setup; impossible values are ignored", () => {
  const p = makePlayer("p1");
  p.getHumanoidBonePosition = (b) => (b === 10 ? new Vector3(0, 1.5, -2) : null);
  p.getHumanoidBoneRotation = (b) => (b === 10 ? new Quaternion(0, 0, 0, 1) : null);
  const item = loadItem([NPC_JS], { world: { global: {}, players: [p] }, groupState: { participants: [p] }, name: "NPC", globals: { HumanoidBone: { Head: 10 } } });
  const up = () => { const h = item.ctx.headOf(p); return [Math.round(item.ctx.faceUp(h) * 1000) / 1000, h.upSrc]; };
  assert.deepEqual(up(), [0.108, "headBone"], "test mode, nothing measured: head bone + FACE_UP");
  item.receive("npc_forehead_cal", { up: 0.12 }, null);
  assert.deepEqual(up(), [0.12, "calibrated"], "the measured forehead height");
  item.receive("npc_forehead_cal", { up: -0.6 }, null);
  assert.deepEqual(up(), [0.108, "headBone"], "impossible: ignored");
  item.receive("npc_forehead_cal", { up: 0.12 }, null);
  item.receive("npc_setup", { social: true }, null);
  assert.deepEqual(up(), [0.108, "headBone"], "a new block (another avatar): measured again");
});
