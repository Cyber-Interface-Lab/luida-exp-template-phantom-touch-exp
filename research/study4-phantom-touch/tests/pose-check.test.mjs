// Pose check (generated DeviceCheck item): with the front mirror, turn the head left and right and hold both arms
// straight out to the sides for 3 s (tracking check only; limits are fractions of the avatar's height, so a very small
// avatar passes the same way). The NPC aims at eyes + x (x = eyes - mouth, the mouth at the head bone's height) and
// strokes down to halfway between the eyes and the mouth.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, loadItem, makePlayer, makeHandle, Vector3, Quaternion, LUIDA_SCRIPTS, ITEM_SCRIPTS } from "./cluster-mock.mjs";

const SLI_BASE_JS = path.join(LUIDA_SCRIPTS, "StateManagement/StateListeningItemBase.js");
const NPC_JS = path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/NpcController.js");
const S_POSE = 2, DT = 0.05;
const HB = { Head: 10, LeftHand: 17, RightHand: 18, LeftEye: 21, RightEye: 22 };

// Vector with a real rotation by a yaw-only quaternion (the shared mock's applyQuaternion is the identity).
class V3 extends Vector3 {
  applyQuaternion(q) { const a = 2 * Math.atan2(q.y, q.w), x = this.x, z = this.z; this.x = x * Math.cos(a) + z * Math.sin(a); this.z = -x * Math.sin(a) + z * Math.cos(a); return this; }
}
const yawQ = (deg) => new Quaternion(0, Math.sin(deg * Math.PI / 360), 0, Math.cos(deg * Math.PI / 360));

// k: avatar scale (1: head bone 1.5 m above the feet). The participant faces +z on the marker (0, 0, -2).
function start(t, { trialId = 0, k = 1 } = {}) {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const p = makePlayer("p1");
  const at = (side, up, fwd) => new V3(side * k, (1.5 + up) * k, -2 + fwd * k);
  p.head = at(0, 0, 0); p.yaw = 0;
  p.getPosition = () => new V3(0, 0, -2);
  p.getRotation = () => yawQ(0);
  const down = () => { p.lh = at(-0.25, -0.6, 0); p.rh = at(0.25, -0.6, 0); };
  down();
  p.getHumanoidBonePosition = (b) => (b === HB.Head ? p.head : b === HB.LeftHand ? p.lh : b === HB.RightHand ? p.rh : null)?.clone() ?? null;
  p.getHumanoidBoneRotation = (b) => (b === HB.Head ? yawQ(p.yaw) : null);
  const refs = { DC_Force: makeHandle("DC_Force") };
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
  const armsOut = (up = -0.12, upR = up) => { p.lh = at(-0.55, up, 0); p.rh = at(0.55, upR, 0); };
  const onHead = (up = 0.22, upR = up) => { p.lh = at(-0.08, up, 0.02); p.rh = at(0.08, upR, 0.02); };
  const sent = (id, type) => refs[id].sent.filter((m) => m.type === type).map((m) => JSON.parse(JSON.stringify(m.arg)));
  const done = () => item.signals.includes("state_triggerTransition");
  return { item, p, refs, group, run, visible, text, click, turnHead, armsOut, onHead, down, sent, done };
}
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, msg + ": " + a + " vs " + b);

test("head turn and arms held out to the sides for 3 s pass the pose check (nothing is measured)", (t) => {
  const g = start(t);
  g.run(0.1);
  assert.match(g.text(), /頭を左右に向ける[\s\S]*両腕を真横に（3秒）/);
  assert.doesNotMatch(g.text(), /頭の上/);
  g.armsOut(); g.run(3.1);
  assert.equal(g.done(), false, "the head has not turned yet");
  assert.match(g.text(), /\[済\] 両腕を真横に/);
  g.turnHead();
  assert.equal(g.done(), true);
  assert.equal(g.group.collectedData.deviceCheckForced, false);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("uneven, bent or moving arms do not count", (t) => {
  const g = start(t);
  g.turnHead();
  g.armsOut(-0.12, 0.10); g.run(4);                       // one arm 22 cm higher than the other
  g.p.lh = new V3(-0.25, 1.38, -2); g.p.rh = new V3(0.25, 1.38, -2); g.run(4);   // hands only 25 cm out (elbows bent)
  g.armsOut(-0.12); g.run(2); g.armsOut(-0.20); g.run(2);  // 8 cm lower: starts again
  assert.equal(g.done(), false);
  g.run(1.1);
  assert.equal(g.done(), true);
});

test("a very small avatar (0.3 x) passes the same way", (t) => {
  const g = start(t, { k: 0.3 });
  g.turnHead(); g.armsOut(); g.run(3.1);
  assert.equal(g.done(), true);
});

test("the rescue button ends the check", (t) => {
  const g = start(t);
  g.run(61);
  assert.equal(g.visible("DC_Force"), true);
  g.click(1);
  assert.equal(g.done(), true);
  assert.equal(g.group.collectedData.deviceCheckForced, true);
});

test("the 2nd trial of a block skips the pose check", (t) => {
  const g = start(t, { trialId: 1 });
  g.run(0.2);
  assert.deepEqual(g.item.signals, ["state_triggerTransition"]);
});

function npc(eyeY) {
  const p = makePlayer("p1");
  p.getHumanoidBonePosition = (b) => (b === 10 ? new Vector3(0, 1.5, -2) : eyeY && b === 21 ? new Vector3(-0.03, eyeY, -1.98) : eyeY && b === 22 ? new Vector3(0.03, eyeY, -1.98) : null);
  p.getHumanoidBoneRotation = (b) => (b === 10 ? new Quaternion(0, 0, 0, 1) : null);
  const item = loadItem([NPC_JS], { world: { global: {}, players: [p] }, groupState: { participants: [p] }, name: "NPC", globals: { HumanoidBone: HB } });
  if (eyeY) item.receive("npc_setup", { social: true, eyes: true }, null);
  const aim = () => { const h = item.ctx.headOf(p); return [Math.round(item.ctx.faceUp(h) * 10000) / 10000, Math.round(h.strokeAmp * 10000) / 10000, h.upSrc]; };
  return { item, aim };
}

test("the NPC aims at eyes + (eyes - mouth) and strokes down to halfway between the eyes and the mouth", () => {
  assert.deepEqual(npc(null).aim(), [0.126, 0.0945, "EYE_UP"], "test mode: eyes 0.063, mouth 0 -> 0.126, down to 0.0315");
  assert.deepEqual(npc(1.57).aim(), [0.14, 0.105, "eyeBones"], "eye bones 0.07 above the head bone -> 0.14, down to 0.035");
  assert.deepEqual(npc(1.52).aim(), [0.04, 0.03, "eyeBones"], "a small head (eyes 0.02): at least 3 cm of stroke");
});
