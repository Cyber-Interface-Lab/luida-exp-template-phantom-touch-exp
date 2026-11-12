// Pose check (generated DeviceCheck item): turn the head left and right, hold both arms straight out to the sides for
// 3 s (the hands' mean height = shoulder height), then straight forward for 3 s (each hand's distance from the
// shoulder = arm length). The NPC is told both ("npc_body_cal") and aims at shoulder + arm / 2, stroking down to just
// above the shoulder. Limits are fractions of the avatar's height, so a very small avatar passes the same way.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, loadItem, makePlayer, makeHandle, Vector3, Quaternion, LUIDA_SCRIPTS, ITEM_SCRIPTS } from "./cluster-mock.mjs";

const SLI_BASE_JS = path.join(LUIDA_SCRIPTS, "StateManagement/StateListeningItemBase.js");
const NPC_JS = path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/NpcController.js");
const S_POSE = 2, DT = 0.05;
const HB = { Head: 10, LeftHand: 17, RightHand: 18, LeftUpperArm: 13, RightUpperArm: 14, LeftLowerArm: 15, RightLowerArm: 16 };

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
  const armsOut = (up = -0.12, upR = up) => { p.lh = at(-0.55, up, 0); p.rh = at(0.55, upR, 0); };
  const armsForward = (fwd = 0.42, up = -0.12) => { p.lh = at(-0.1, up, fwd); p.rh = at(0.1, up, fwd); };
  const bodyCal = () => refs.NPC.sent.filter((m) => m.type === "npc_body_cal").map((m) => m.arg);
  const done = () => item.signals.includes("state_triggerTransition");
  return { item, p, refs, group, run, visible, text, click, turnHead, armsOut, armsForward, down, bodyCal, done };
}
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, msg + ": " + a + " vs " + b);

test("head turn, arms out for 3 s, arms forward for 3 s: the shoulder height and arm length go to the NPC", (t) => {
  const g = start(t);
  g.run(0.1);
  assert.match(g.text(), /頭を左右に向ける[\s\S]*両腕を横に（3秒）[\s\S]*両腕を前に（3秒）/);
  g.turnHead();
  g.armsOut(); g.run(2.9);
  assert.doesNotMatch(g.text(), /\[済\] 両腕を横に/, "not before 3 s");
  g.run(0.2);
  assert.match(g.text(), /\[済\] 両腕を横に/);
  g.armsForward(); g.run(2.9);
  assert.equal(g.done(), false);
  g.run(0.2);
  assert.equal(g.done(), true);
  assert.equal(g.bodyCal().length, 1);
  close(g.bodyCal()[0].shoulderUp, -0.12, "shoulder from the head bone");
  close(g.bodyCal()[0].arm, 0.42, "arm length");
  const cd = g.group.collectedData;
  assert.deepEqual([cd.poseShoulderUp, cd.poseArmLen, cd.poseArmLeft, cd.poseArmRight, cd.deviceCheckForced], [-0.12, 0.42, 0.42, 0.42, false]);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("arms forward before arms out do not count; uneven, half-raised or moving arms start the hold again", (t) => {
  const g = start(t);
  g.turnHead();
  g.armsForward(); g.run(4);
  assert.doesNotMatch(g.text(), /\[済\] 両腕/, "forward first: nothing");
  g.armsOut(-0.12, 0.10); g.run(4);                       // one arm 22 cm higher than the other
  assert.doesNotMatch(g.text(), /\[済\] 両腕を横に/);
  g.p.lh = new V3(-0.25, 1.38, -2); g.p.rh = new V3(0.25, 1.38, -2); g.run(4);   // hands only 25 cm out (elbows bent)
  assert.doesNotMatch(g.text(), /\[済\] 両腕を横に/);
  g.armsOut(-0.12); g.run(2);
  g.armsOut(-0.20); g.run(2);                              // 8 cm lower: starts again
  assert.doesNotMatch(g.text(), /\[済\] 両腕を横に/);
  g.run(1.1);
  assert.match(g.text(), /\[済\] 両腕を横に/);
  g.armsForward(0.42, 0.10); g.run(4);                    // 30 cm above the shoulder: not straight forward
  assert.equal(g.done(), false);
  g.armsForward(0.40, -0.20); g.run(3.1);
  assert.equal(g.done(), true);
  close(g.bodyCal()[0].shoulderUp, -0.20, "the last, still arms-out hold");
  close(g.bodyCal()[0].arm, 0.40, "arm length");
});

test("a very small avatar (0.3 x) passes the same way", (t) => {
  const g = start(t, { k: 0.3 });
  g.turnHead();
  g.armsOut(); g.run(3.1);
  g.armsForward(); g.run(3.1);
  assert.equal(g.done(), true);
  close(g.bodyCal()[0].arm, 0.42 * 0.3, "arm length");
  close(g.bodyCal()[0].shoulderUp, -0.12 * 0.3, "shoulder from the head bone");
});

test("passed with the rescue button: nothing is sent (the NPC reads the avatar's bones)", (t) => {
  const g = start(t);
  g.turnHead(); g.armsOut(); g.run(3.1); g.down();
  g.run(61);
  g.click(1);
  assert.equal(g.done(), true);
  const cd = g.group.collectedData;
  assert.deepEqual([cd.deviceCheckForced, cd.poseShoulderUp, cd.poseArmLen], [true, -0.12, ""]);
  assert.deepEqual(g.bodyCal(), []);
});

test("the 2nd trial of a block skips the pose check", (t) => {
  const g = start(t, { trialId: 1 });
  g.run(0.2);
  assert.deepEqual(g.item.signals, ["state_triggerTransition"]);
});

function npc(bones) {
  const p = makePlayer("p1");
  p.getHumanoidBonePosition = (b) => (b === 10 ? new Vector3(0, 1.5, -2) : bones[b] ?? null);
  p.getHumanoidBoneRotation = (b) => (b === 10 ? new Quaternion(0, 0, 0, 1) : null);
  const item = loadItem([NPC_JS], { world: { global: {}, players: [p] }, groupState: { participants: [p] }, name: "NPC", globals: { HumanoidBone: HB } });
  const aim = () => { const h = item.ctx.headOf(p); return [Math.round(item.ctx.faceUp(h) * 1000) / 1000, Math.round(h.strokeAmp * 1000) / 1000, h.upSrc]; };
  return { item, aim };
}

test("the NPC aims at shoulder + arm / 2 and strokes down to 4 cm above the shoulder; reset at the next block", () => {
  const { item, aim } = npc({});
  assert.deepEqual(aim(), [0.108, 0.09, "headBone"], "nothing known: head bone + FACE_UP, STROKE_AMP");
  item.receive("npc_body_cal", { shoulderUp: -0.12, arm: 0.42 }, null);
  assert.deepEqual(aim(), [0.09, 0.17, "pose"], "-0.12 + 0.21; 0.21 - 0.04");
  item.receive("npc_setup", { social: true }, null);
  assert.deepEqual(aim(), [0.108, 0.09, "headBone"], "a new block (another avatar): measured again");
});

test("without the pose check's values, the NPC reads the avatar's arm bones", () => {
  const bones = {
    [HB.LeftUpperArm]: new Vector3(-0.1, 1.38, -2), [HB.LeftLowerArm]: new Vector3(-0.1, 1.16, -2), [HB.LeftHand]: new Vector3(-0.1, 0.96, -2),
    [HB.RightUpperArm]: new Vector3(0.1, 1.38, -2), [HB.RightLowerArm]: new Vector3(0.1, 1.16, -2), [HB.RightHand]: new Vector3(0.1, 0.96, -2),
  };
  const { aim } = npc(bones);
  assert.deepEqual(aim(), [0.09, 0.17, "bones"], "shoulder -0.12, arm 0.22 + 0.20");
});

test("with eye bones, the higher of shoulder + arm / 2 and eyes + 4.5 cm is the target; the stroke still ends above the shoulder", () => {
  const HBE = { ...HB, LeftEye: 21, RightEye: 22 };
  const p = makePlayer("p1");
  let eyeY = 1.57;
  p.getHumanoidBonePosition = (b) => (b === 10 ? new Vector3(0, 1.5, -2) : b === 21 ? new Vector3(-0.03, eyeY, -1.98) : b === 22 ? new Vector3(0.03, eyeY, -1.98) : null);
  p.getHumanoidBoneRotation = (b) => (b === 10 ? new Quaternion(0, 0, 0, 1) : null);
  const item = loadItem([NPC_JS], { world: { global: {}, players: [p] }, groupState: { participants: [p] }, name: "NPC", globals: { HumanoidBone: HBE } });
  const aim = () => { const h = item.ctx.headOf(p); const r = (x) => (x === null ? null : Math.round(x * 1000) / 1000); return [r(item.ctx.faceUp(h)), r(h.strokeAmp), h.upSrc, r(h.bodyUp), r(h.eyesUp)]; };
  item.receive("npc_setup", { social: true, eyes: true }, null);
  assert.deepEqual(aim(), [0.115, 0.09, "eyeBones", null, 0.115], "eyes only: 0.07 + 0.045, STROKE_AMP");
  item.receive("npc_body_cal", { shoulderUp: -0.12, arm: 0.42 }, null);
  assert.deepEqual(aim(), [0.115, 0.195, "eyeBones", 0.09, 0.115], "eyes higher (0.115 > 0.09): stroke 0.115 - (-0.12 + 0.04)");
  item.receive("npc_body_cal", { shoulderUp: -0.12, arm: 0.50 }, null);
  assert.deepEqual(aim(), [0.13, 0.21, "pose", 0.13, 0.115], "body higher (0.13 > 0.115)");
  eyeY = 1.6;   // eyes 0.10 + 0.045 = 0.145
  assert.deepEqual(aim(), [0.145, 0.225, "eyeBones", 0.13, 0.145]);
});
