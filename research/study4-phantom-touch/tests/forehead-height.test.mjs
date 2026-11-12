// Forehead height (2nd part of the pose check, generated DeviceCheck item): after the tracking check the participant
// holds the left hand at their forehead and clicks the large button straight ahead with the right hand (DC_Eye writes
// 2 to "dc_btn"; the button itself says what to do). The left hand's height above the head bone is sent to the NPC
// ("npc_forehead_cal"), which aims its hand there in this block.
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
  const refs = { NPC: makeHandle("NPC"), DC_Force: makeHandle("DC_Force"), DC_Eye: makeHandle("DC_Eye") };
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
  const passPose = () => {
    run(0.1); p.yaw = -30; run(0.1); p.yaw = 30; run(0.1); p.yaw = 0;
    p.lh = new V3(-0.25, 1.7, -2); p.rh = new V3(0.25, 1.7, -2); run(1.1);
    p.lh = new V3(-0.25, 0.9, -2); p.rh = new V3(0.25, 0.9, -2);
  };
  const foreheadCal = () => refs.NPC.sent.filter((m) => m.type === "npc_forehead_cal").map((m) => m.arg.up);
  return { item, p, refs, group, run, visible, text, click, passPose, foreheadCal };
}

test("after the tracking check, the left hand at the forehead and a click give the forehead height", (t) => {
  const g = start(t);
  g.run(0.1);
  assert.match(g.text(), /トラッキングの確認/);
  assert.equal(g.visible("DC_Eye"), false);
  g.click(2);
  assert.match(g.text(), /トラッキングの確認/, "the button does nothing during the tracking check");
  g.passPose();
  assert.match(g.text(), /額の高さの確認[\s\S]*ボタンに書いてある/);
  assert.equal(g.visible("DC_Eye"), true);
  const label = g.refs.DC_Eye.sent.filter((m) => m.arg.label !== undefined).at(-1).arg.label;
  assert.match(label, /左手を額の高さに[\s\S]*右手でここをクリック/, "what to do is on the button");
  assert.equal(g.item.signals.includes("state_triggerTransition"), false, "the state goes on only after the forehead height");
  g.p.lh = new V3(-0.15, 1.61, -1.9);   // left hand at the forehead, 11 cm above the head bone
  g.p.rh = new V3(0.2, 1.65, -1.7);     // right hand pointing at the button (even if higher, the left hand counts)
  g.run(0.3);
  g.click(2);
  assert.equal(g.foreheadCal().length, 1);
  assert.ok(Math.abs(g.foreheadCal()[0] - 0.11) < 1e-9);
  const cd = g.group.collectedData;
  assert.deepEqual([cd.foreheadCalUp, cd.foreheadCalHandY, cd.foreheadCalHeadY, cd.deviceCheckForced], [0.11, 1.61, 1.5, false]);
  assert.equal(g.visible("DC_Eye"), false);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("after a pose check passed with the rescue button, the forehead height is still measured (no rescue for it)", (t) => {
  const g = start(t);
  g.run(61);
  assert.equal(g.visible("DC_Force"), true);
  g.click(1);
  assert.equal(g.group.collectedData.deviceCheckForced, true);
  assert.equal(g.visible("DC_Force"), false);
  assert.equal(g.visible("DC_Eye"), true);
  g.click(1);
  assert.equal(g.item.signals.length, 0, "the rescue button does not skip the forehead height");
  g.p.lh = new V3(-0.15, 1.6, -1.9);
  g.click(2);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("the 2nd trial of a block skips the pose check and the forehead height", (t) => {
  const g = start(t, 1);
  g.run(0.2);
  assert.deepEqual(g.item.signals, ["state_triggerTransition"]);
  assert.notEqual(g.visible("DC_Eye"), true);
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
  assert.deepEqual(up(), [0.108, "headBone"], "the left hand was down: ignored");
  item.receive("npc_forehead_cal", { up: 0.12 }, null);
  item.receive("npc_setup", { social: true }, null);
  assert.deepEqual(up(), [0.108, "headBone"], "a new block (another avatar): measured again");
});
