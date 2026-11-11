// Guided greeting (generated GreetingGuide item): one instruction at a time on a panel in front of the participant,
// hidden the moment the participant has followed it; the NPC is told with 'npc_greet_cue'; the state ends after the
// last instruction.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadItem, makePlayer, makeHandle, LUIDA_SCRIPTS, ITEM_SCRIPTS } from "./cluster-mock.mjs";

const SLI_BASE_JS = path.join(LUIDA_SCRIPTS, "StateManagement/StateListeningItemBase.js");
const S_GREET = 3;
const DT = 0.05;

// Vector / quaternion maths as in Cluster Script (the shared mock only has identity rotations).
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.sqrt(this.dot(this)); }
  normalize() { const l = this.length(); if (l > 0) this.multiplyScalar(1 / l); return this; }
  applyQuaternion(q) {
    const tx = 2 * (q.y * this.z - q.z * this.y), ty = 2 * (q.z * this.x - q.x * this.z), tz = 2 * (q.x * this.y - q.y * this.x);
    const x = this.x + q.w * tx + (q.y * tz - q.z * ty), y = this.y + q.w * ty + (q.z * tx - q.x * tz), z = this.z + q.w * tz + (q.x * ty - q.y * tx);
    this.x = x; this.y = y; this.z = z; return this;
  }
}
class Q {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  clone() { return new Q(this.x, this.y, this.z, this.w); }
  multiply(b) {
    const a = this.clone();
    this.x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y; this.y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    this.z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w; this.w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
    return this;
  }
  invert() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  setFromEulerAngles(e) {   // Unity order: y * x * z (degrees)
    const ax = (deg, x, y, z) => { const h = deg * Math.PI / 360, s = Math.sin(h); return new Q(x * s, y * s, z * s, Math.cos(h)); };
    const q = ax(e.y, 0, 1, 0).multiply(ax(e.x, 1, 0, 0)).multiply(ax(e.z, 0, 0, 1));
    this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this;
  }
}
const HB = { Head: 10, LeftHand: 17, RightHand: 18 };

// Participant on the marker (0, 0, -2) facing +z; the NPC stands 1 m in front of the marker.
function makeParticipant() {
  const p = makePlayer("p1");
  p.head = new V3(0, 1.5, -2); p.yaw = 0;
  p.lh = new V3(-0.25, 0.9, -2); p.rh = new V3(0.25, 0.9, -2);
  p.getHumanoidBonePosition = (b) => (b === HB.Head ? p.head : b === HB.LeftHand ? p.lh : b === HB.RightHand ? p.rh : null)?.clone() ?? null;
  p.getHumanoidBoneRotation = (b) => (b === HB.Head ? new Q().setFromEulerAngles(new V3(0, p.yaw, 0)) : null);
  return p;
}
function start(t) {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const p = makeParticipant();
  const npc = makeHandle("NPC");
  const group = { participants: [p], currentCondition: { social: "with", block: "1" } };
  const world = { global: { state_currentID: S_GREET }, players: [p] };
  const item = loadItem([SLI_BASE_JS, path.join(ITEM_SCRIPTS, "GreetingGuide.js")],
    { world, groupState: group, name: "GreetingGuide", refs: { NPC: npc }, globals: { Vector3: V3, Quaternion: Q, HumanoidBone: HB } });
  item.cb.start();
  item.itemState.state_enter = true;
  const run = (sec) => { for (let i = 0; i < Math.round(sec / DT); i++) { now += DT * 1000; item.update(DT); } };
  const text = () => item.subNodes.Text?.text || "";
  const shown = () => text() !== "" && item.subNodes.Bg?.enabled === true;
  const cues = () => npc.sent.filter((m) => m.type === "npc_greet_cue").map((m) => m.arg.cue);
  // the participant's actions
  const wave = () => { p.rh = new V3(0.3, 1.6, -1.9); run(0.1); p.rh = new V3(0.45, 1.6, -1.9); run(0.1); p.rh = new V3(0.3, 1.6, -1.9); run(0.1); p.rh = new V3(0.25, 0.9, -2); };
  const faceNpc = () => { const d = new V3(0, 0, -1).sub(p.head); p.yaw = Math.atan2(d.x, d.z) * 180 / Math.PI; };
  return { item, p, npc, group, run, text, shown, cues, wave, faceNpc };
}

test("the five instructions appear one by one and each disappears when it has been followed", (t) => {
  const g = start(t);
  g.run(1.0);
  assert.equal(g.shown(), false, "nothing while the NPC appears");
  g.run(1.5);
  assert.match(g.text(), /手を振って/);
  assert.equal(g.shown(), true);
  g.wave();
  assert.equal(g.shown(), false, "hidden as soon as the wave is seen");
  assert.deepEqual(g.cues(), ["wave"]);
  g.run(2.0);
  assert.equal(g.shown(), false, "no panel while the participant watches the NPC");
  g.run(1.5);
  assert.match(g.text(), /目をそらして/);
  g.p.yaw = 60; g.run(0.5);
  assert.equal(g.shown(), false);
  g.run(1.2);
  assert.match(g.text(), /相手の顔を見て/);
  g.p.yaw = 0; g.run(0.5);
  assert.deepEqual(g.cues(), ["wave", "lookAway", "lookBack"]);
  g.run(3.2);
  assert.match(g.text(), /右へ1歩/);
  g.p.head = new V3(0.5, 1.5, -2); g.run(0.2);
  assert.equal(g.shown(), false);
  g.run(3.2);
  assert.match(g.text(), /相手の顔を見て/, "the NPC is 27 deg to the left now: asked to look at it again");
  g.faceNpc(); g.run(0.5);
  assert.deepEqual(g.cues(), ["wave", "lookAway", "lookBack", "move", "lookAgain"]);
  assert.equal(g.item.signals.includes("state_triggerTransition"), false, "a last pause to watch the NPC");
  assert.equal(g.group.collectedData.greetTimeouts, 0);
  assert.equal(g.group.collectedData.greetStepSec.split(",").length, 5);
  g.run(3.2);
  assert.deepEqual(g.item.signals.filter((s) => s === "state_triggerTransition"), ["state_triggerTransition"]);
  g.run(5.0);
  assert.equal(g.shown(), false);
  assert.equal(g.item.signals.filter((s) => s === "state_triggerTransition").length, 1, "only once");
});

test("the panel sits 0.7 m in front of the face, below the eyes, and comes along when the head turns", (t) => {
  const g = start(t);
  g.run(2.5);
  const pos = () => g.item.subNodes.Text.pos;          // the item is at the origin of the mock world
  assert.ok(Math.abs(pos().x) < 1e-6 && Math.abs(pos().z - (-2 + 0.7)) < 1e-6 && Math.abs(pos().y - 1.45) < 1e-6);
  g.p.yaw = 20; g.run(0.3);
  assert.ok(Math.abs(pos().x) < 1e-6, "small head turns leave it where it is");
  g.p.yaw = 40; g.run(0.3);
  assert.ok(Math.abs(pos().x - 0.7 * Math.sin(40 * Math.PI / 180)) < 1e-6, "in front of the face again");
  assert.match(g.text(), /手を振って/, "looking aside is not waving");
});

test("raising a hand without moving it is not a wave; an instruction that is not followed is skipped after 30 s", (t) => {
  const g = start(t);
  g.run(2.5);
  g.p.rh = new V3(0.3, 1.6, -1.9);
  g.run(5.0);
  assert.match(g.text(), /手を振って/);
  g.run(26.0);
  assert.equal(g.shown(), true, "next instruction");
  assert.match(g.text(), /目をそらして/);
  assert.deepEqual(g.cues(), [], "the NPC is not told about a skipped instruction");
  g.p.yaw = -50; g.run(0.5);                              // looking left counts as looking away, too
  assert.deepEqual(g.cues(), ["lookAway"]);
  g.run(1.2);
  g.p.yaw = 0; g.run(0.5);
  g.run(3.2);
  g.run(31.0);                                            // never steps aside
  g.run(1.0);
  // still looking at the NPC: the last instruction is not shown at all, the NPC is told at once
  assert.deepEqual(g.cues(), ["lookAway", "lookBack", "lookAgain"]);
  assert.equal(g.shown(), false);
  assert.equal(g.group.collectedData.greetTimeouts, 2);
  const secs = g.group.collectedData.greetStepSec.split(",").map(Number);
  assert.deepEqual([secs[0], secs[3], secs[4]], [-1, -1, 0]);
  g.run(3.2);
  assert.equal(g.item.signals.filter((s) => s === "state_triggerTransition").length, 1);
});

test("leaving the greeting state (or a session reset) hides the panel and stops the guide", (t) => {
  const g = start(t);
  g.run(2.5);
  assert.equal(g.shown(), true);
  g.item.itemState.state_exit = true;
  g.run(0.1);
  assert.equal(g.shown(), false);
  g.wave();
  assert.deepEqual(g.cues(), []);
});
