// Pose check (generated DeviceCheck item): with the front mirror, turn the head left and right and hold both arms
// straight out to the sides for 3 s (tracking check only). Then the front mirror goes away (MirrorPanel "mp_mirror"),
// the Instruction item shows "both hands on your head for 3 s" straight ahead ("ins_text"), and the hands' height on
// the head goes to the NPC ("npc_hands_cal"). The NPC aims 3 cm below it, but never below the eye bones (then the eyes
// + 4.5 cm), and strokes down to the mouth (6 cm below the eyes), at least 9 cm. Limits are fractions of the avatar's
// height, so a very small avatar passes the same way.
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
  const refs = { NPC: makeHandle("NPC"), DC_Force: makeHandle("DC_Force"), MirrorPanel: makeHandle("MirrorPanel"), Instruction: makeHandle("Instruction") };
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

test("tracking check with the mirror, then the mirror goes and the hands on the head give the NPC its height", (t) => {
  const g = start(t);
  g.run(0.1);
  assert.match(g.text(), /頭を左右に向ける[\s\S]*両腕を真横に（3秒）[\s\S]*両手を頭の上に（3秒）/);
  g.onHead(); g.run(4);
  assert.deepEqual(g.sent("NPC", "npc_hands_cal"), [], "hands on the head before the tracking check do not count");
  g.turnHead();
  g.armsOut(); g.run(2.9);
  assert.deepEqual(g.sent("MirrorPanel", "mp_mirror"), [], "not before 3 s");
  g.run(0.2);
  assert.deepEqual(g.sent("MirrorPanel", "mp_mirror"), [{ name: "MirrorFront", visible: false }]);
  assert.match(g.sent("Instruction", "ins_text")[0].text, /両手を自分の頭の上に[\s\S]*3秒/);
  assert.equal(g.sent("Instruction", "ins_text")[0].slot, "center");
  assert.ok(g.sent("Instruction", "ins_text")[0].size > 0.04, "large text");
  assert.match(g.text(), /\[済\] 頭を左右に[\s\S]*\[済\] 両腕を真横に/);
  g.onHead(0.21, 0.23); g.run(2.9);
  assert.equal(g.done(), false);
  g.run(0.2);
  assert.equal(g.done(), true);
  assert.equal(g.sent("NPC", "npc_hands_cal").length, 1);
  close(g.sent("NPC", "npc_hands_cal")[0].up, 0.22, "mean height of both hands above the head bone");
  assert.deepEqual(g.sent("Instruction", "ins_text").at(-1), { slot: "center", text: "" }, "instruction cleared");
  const cd = g.group.collectedData;
  assert.deepEqual([cd.poseHandsUp, cd.poseHandsLeftUp, cd.poseHandsRightUp, cd.deviceCheckForced], [0.22, 0.21, 0.23, false]);
  assert.deepEqual(g.item.signals, ["exp_recordCustomData", "state_triggerTransition"]);
});

test("uneven or bent arms do not count as arms out; hands beside or high above the head, or moving, do not count as on it", (t) => {
  const g = start(t);
  g.turnHead();
  g.armsOut(-0.12, 0.10); g.run(4);                       // one arm 22 cm higher than the other
  g.p.lh = new V3(-0.25, 1.38, -2); g.p.rh = new V3(0.25, 1.38, -2); g.run(4);   // hands only 25 cm out (elbows bent)
  assert.deepEqual(g.sent("MirrorPanel", "mp_mirror"), []);
  g.armsOut(); g.run(3.1);
  g.onHead(0.45); g.run(4);                              // arms raised straight up
  g.p.lh = new V3(-0.4, 1.72, -2); g.p.rh = new V3(0.4, 1.72, -2); g.run(4);     // hands out to the sides at head height
  g.onHead(0.20); g.run(2); g.onHead(0.28); g.run(2);     // moved 8 cm: starts again
  assert.equal(g.done(), false);
  g.run(1.1);
  assert.equal(g.done(), true);
  close(g.sent("NPC", "npc_hands_cal")[0].up, 0.28, "only the last, still hold counts");
});

test("a very small avatar (0.3 x) passes the same way", (t) => {
  const g = start(t, { k: 0.3 });
  g.turnHead(); g.armsOut(); g.run(3.1); g.onHead(); g.run(3.1);
  assert.equal(g.done(), true);
  close(g.sent("NPC", "npc_hands_cal")[0].up, 0.22 * 0.3, "hands above the head bone");
});

test("the rescue button ends the check in any step; without the hands' height nothing goes to the NPC", (t) => {
  const g = start(t);
  g.turnHead(); g.armsOut(); g.run(3.1); g.down();
  g.run(61);
  assert.equal(g.visible("DC_Force"), true);
  g.click(1);
  assert.equal(g.done(), true);
  assert.deepEqual([g.group.collectedData.deviceCheckForced, g.group.collectedData.poseHandsUp], [true, ""]);
  assert.deepEqual(g.sent("NPC", "npc_hands_cal"), []);
  assert.deepEqual(g.sent("Instruction", "ins_text").at(-1), { slot: "center", text: "" });
});

test("the 2nd trial of a block skips the pose check", (t) => {
  const g = start(t, { trialId: 1 });
  g.run(0.2);
  assert.deepEqual(g.item.signals, ["state_triggerTransition"]);
});

test("the Instruction item and the MirrorPanel do what the DeviceCheck asks", () => {
  const world = { global: { state_currentID: S_POSE, exp_trialID: 0 }, players: [] };
  const ins = loadItem([SLI_BASE_JS, path.join(ITEM_SCRIPTS, "Instruction.js")], { world, name: "Instruction", globals: { HumanoidBone: HB } });
  ins.cb.start();
  ins.receive("ins_text", { slot: "center", text: "両手を自分の頭の上に、\n3秒置いてください" }, null);
  assert.equal(ins.subNodes.Text.text, "両手を自分の頭の上に、\n3秒置いてください");
  assert.equal(ins.subNodes.Bg.enabled, true);
  ins.receive("ins_text", { slot: "center", text: "" }, null);
  assert.equal(ins.subNodes.Bg.enabled, false);
  const mp = loadItem([SLI_BASE_JS, path.join(ITEM_SCRIPTS, "MirrorPanel.js")], { world, name: "MirrorPanel", globals: { HumanoidBone: HB } });
  mp.cb.start();
  mp.receive("mp_mirror", { name: "MirrorFront", visible: false }, null);
  assert.equal(mp.subNodes.MirrorFront.enabled, false);
});

function npc(eyeY) {
  const p = makePlayer("p1");
  p.getHumanoidBonePosition = (b) => (b === 10 ? new Vector3(0, 1.5, -2) : eyeY && b === 21 ? new Vector3(-0.03, eyeY, -1.98) : eyeY && b === 22 ? new Vector3(0.03, eyeY, -1.98) : null);
  p.getHumanoidBoneRotation = (b) => (b === 10 ? new Quaternion(0, 0, 0, 1) : null);
  const item = loadItem([NPC_JS], { world: { global: {}, players: [p] }, groupState: { participants: [p] }, name: "NPC", globals: { HumanoidBone: HB } });
  if (eyeY) item.receive("npc_setup", { social: true, eyes: true }, null);
  const aim = () => { const h = item.ctx.headOf(p); return [Math.round(item.ctx.faceUp(h) * 1000) / 1000, Math.round(h.strokeAmp * 1000) / 1000, h.upSrc]; };
  return { item, aim };
}

test("the NPC aims 3 cm below the hands on the head and strokes down to the mouth; reset at the next block", () => {
  const { item, aim } = npc(null);
  assert.deepEqual(aim(), [0.108, 0.105, "headBone"], "nothing known: FACE_UP, down to EYE_UP - 6 cm");
  item.receive("npc_hands_cal", { up: 0.22 }, null);
  assert.deepEqual(aim(), [0.19, 0.187, "hands"], "0.22 - 0.03; down to 0.063 - 0.06");
  item.receive("npc_setup", { social: true }, null);
  assert.deepEqual(aim(), [0.108, 0.105, "headBone"], "a new block (another avatar): measured again");
});

test("with eye bones: never below the eyes (then the forehead), the stroke ends 6 cm below the eyes, at least 9 cm", () => {
  const { item, aim } = npc(1.57);                           // eyes 0.07 above the head bone
  assert.deepEqual(aim(), [0.115, 0.105, "eyeBones"], "no hands: eyes + 4.5 cm, down to 0.01");
  item.receive("npc_hands_cal", { up: 0.08 }, null);          // 0.05 < 0.07: below the eyes
  assert.deepEqual(aim(), [0.115, 0.105, "eyeBones(hands below the eyes)"]);
  item.receive("npc_hands_cal", { up: 0.25 }, null);
  assert.deepEqual(aim(), [0.22, 0.21, "hands"], "0.25 - 0.03; down to 0.01");
  item.receive("npc_hands_cal", { up: 0.12 }, null);          // 0.09: just above the eyes, stroke would be 8 cm
  assert.deepEqual(aim(), [0.09, 0.09, "hands"], "at least STROKE_AMP");
});
