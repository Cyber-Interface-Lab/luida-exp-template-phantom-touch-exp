// Eye height (2nd part of the pose check, generated DeviceCheck item): after the tracking check the participant holds
// one hand at their own eye height and presses the large button straight ahead with the other (DC_Eye writes 2 to
// "dc_btn"). The higher hand's height above the head bone is sent to the NPC ("npc_eye_cal"), which aims its hand from
// it in this block.
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
  const eyeCal = () => refs.NPC.sent.filter((m) => m.type === "npc_eye_cal").map((m) => m.arg.up);
  return { item, p, refs, group, run, visible, text, click, passPose, eyeCal };
}

test("after the tracking check, one hand at eye height and a press with the other give the eye height", (t) => {
  const g = start(t);
  g.run(0.1);
  assert.match(g.text(), /トラッキングの確認/);
  assert.equal(g.visible("DC_Eye"), false);
  g.click(2);
  assert.match(g.text(), /トラッキングの確認/, "the eye button does nothing during the tracking check");
  g.passPose();
  assert.match(g.text(), /目の高さの確認[\s\S]*片手をヘッドセットの横[\s\S]*もう片方の手で[\s\S]*ボタンを押して/);
  assert.equal(g.visible("DC_Eye"), true);
  assert.equal(g.item.signals.includes("state_triggerTransition"), false, "the state goes on only after the eye height");
  g.p.lh = new V3(-0.15, 1.585, -1.9);   // left hand beside the headset, 8.5 cm above the head bone
  g.p.rh = new V3(0.2, 1.3, -1.7);       // right hand pointing at the button
  g.run(0.3);
  g.click(2);
  assert.deepEqual(g.eyeCal(), [1.585 - 1.5]);
  const cd = g.group.collectedData;
  assert.deepEqual([cd.eyeCalUp, cd.eyeCalHand, cd.eyeCalHandY, cd.eyeCalHeadY, cd.deviceCheckForced], [0.085, "left", 1.585, 1.5, false]);
  assert.equal(g.visible("DC_Eye"), false);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("either hand can be the one at eye height: the higher one counts", (t) => {
  const g = start(t);
  g.passPose();
  g.p.rh = new V3(0.15, 1.57, -1.9); g.p.lh = new V3(-0.2, 1.25, -1.7);
  g.click(2);
  assert.equal(g.group.collectedData.eyeCalHand, "right");
  assert.equal(g.group.collectedData.eyeCalUp, 0.07);
});

test("after a pose check passed with the rescue button, the eye height is still measured (no rescue for it)", (t) => {
  const g = start(t);
  g.run(61);
  assert.equal(g.visible("DC_Force"), true);
  g.click(1);
  assert.equal(g.group.collectedData.deviceCheckForced, true);
  assert.equal(g.visible("DC_Force"), false);
  assert.equal(g.visible("DC_Eye"), true);
  g.click(1);
  assert.equal(g.item.signals.length, 0, "the rescue button does not skip the eye height");
  g.p.rh = new V3(0.15, 1.56, -1.9);
  g.click(2);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("the 2nd trial of a block skips the pose check and the eye height", (t) => {
  const g = start(t, 1);
  g.run(0.2);
  assert.deepEqual(g.item.signals, ["state_triggerTransition"]);
  assert.notEqual(g.visible("DC_Eye"), true);
});

test("the NPC aims just above the measured eye height until the next block's setup; impossible values are ignored", () => {
  const p = makePlayer("p1");
  p.getHumanoidBonePosition = (b) => (b === 10 ? new Vector3(0, 1.5, -2) : null);
  p.getHumanoidBoneRotation = (b) => (b === 10 ? new Quaternion(0, 0, 0, 1) : null);
  const item = loadItem([NPC_JS], { world: { global: {}, players: [p] }, groupState: { participants: [p] }, name: "NPC", globals: { HumanoidBone: { Head: 10 } } });
  const up = () => { const h = item.ctx.headOf(p); return [Math.round(item.ctx.faceUp(h) * 1000) / 1000, h.eyeSrc]; };
  assert.deepEqual(up(), [0.083, "headBone"], "test mode, nothing measured: head bone + FACE_UP");
  item.receive("npc_eye_cal", { up: 0.1 }, null);
  assert.deepEqual(up(), [0.12, "calibrated"], "measured eye height + ABOVE_EYES");
  item.receive("npc_eye_cal", { up: -0.6 }, null);
  assert.deepEqual(up(), [0.083, "headBone"], "both hands were down: ignored");
  item.receive("npc_eye_cal", { up: 0.1 }, null);
  item.receive("npc_setup", { social: true }, null);
  assert.deepEqual(up(), [0.083, "headBone"], "a new block (another avatar): measured again");
});
