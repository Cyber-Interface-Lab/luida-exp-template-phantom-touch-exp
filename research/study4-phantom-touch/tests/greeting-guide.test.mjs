// Guided greeting (generated GreetingGuide item): the NPC greets first ('hello'), then one instruction at a time on a
// panel in front of the participant, hidden the moment the participant has followed it; the NPC is told with
// 'npc_greet_cue'; every pause outlasts the NPC's answer; the state ends after the last instruction.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, loadItem, makePlayer, makeHandle, LUIDA_SCRIPTS, ITEM_SCRIPTS } from "./cluster-mock.mjs";

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
function start(t, social = "with") {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const p = makeParticipant();
  const npc = makeHandle("NPC");
  const group = { participants: [p], currentCondition: { social, block: "1" } };
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
  return { item, p, npc, group, run, text, shown, cues, wave, faceNpc, now: () => now };
}

test("the NPC greets first; the five instructions then appear one by one, each hidden once followed", (t) => {
  const g = start(t);
  g.run(0.9);
  assert.deepEqual(g.cues(), []);
  g.run(0.2);
  assert.deepEqual(g.cues(), ["hello"], "the NPC greets 1 s after the state began");
  g.run(2.8);
  assert.equal(g.shown(), false, "no instruction while the NPC's greeting (1.6 s) and the margin last");
  g.run(0.2);
  assert.match(g.text(), /手を振って/, "first instruction 4 s after the state began");
  assert.equal(g.shown(), true);
  g.wave();
  assert.equal(g.shown(), false, "hidden as soon as the wave is seen");
  assert.deepEqual(g.cues(), ["hello", "wave"]);
  g.run(2.5);
  assert.equal(g.shown(), false, "no panel while the NPC waves back");
  g.run(0.6);
  assert.match(g.text(), /目をそらして/);
  g.p.yaw = 60; g.run(0.5);
  assert.equal(g.shown(), false);
  g.run(1.0);
  assert.match(g.text(), /相手の顔を見て/);
  g.p.yaw = 0; g.run(0.5);
  assert.deepEqual(g.cues(), ["hello", "wave", "lookAway", "lookBack"]);
  g.run(1.8);
  assert.equal(g.shown(), false, "the NPC's nod (0.8 s) and the margin");
  g.run(0.5);
  assert.match(g.text(), /右へ1歩/);
  g.p.head = new V3(0.5, 1.5, -2); g.run(0.2);
  assert.equal(g.shown(), false);
  g.run(2.5);
  assert.equal(g.shown(), false, "the NPC turns to the participant");
  g.run(0.5);
  assert.match(g.text(), /相手の顔を見て/, "the NPC is 27 deg to the left now: asked to look at it again");
  g.faceNpc(); g.run(0.5);
  assert.deepEqual(g.cues(), ["hello", "wave", "lookAway", "lookBack", "move", "lookAgain"]);
  assert.equal(g.group.collectedData.greetTimeouts, 0);
  assert.equal(g.group.collectedData.greetStepSec.split(",").length, 5);
  g.run(2.3);
  assert.equal(g.item.signals.includes("state_triggerTransition"), false, "not while the NPC's last wave (1.6 s) and the margin last");
  g.run(0.6);
  assert.deepEqual(g.item.signals.filter((s) => s === "state_triggerTransition"), ["state_triggerTransition"]);
  g.run(5.0);
  assert.equal(g.shown(), false);
  assert.equal(g.item.signals.filter((s) => s === "state_triggerTransition").length, 1, "only once");
});

// NPC_CFG of the NPC controller (literal values only)
function npcCfg() {
  const src = fs.readFileSync(path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/NpcController.js"), "utf8").replace(/\r\n/g, "\n");
  const m = src.match(/const NPC_CFG = (\{[\s\S]*?\n\});/);
  assert.ok(m, "NPC_CFG not found");
  return vm.runInNewContext("(" + m[1] + ")");
}

test("every pause lasts until the NPC's answer (NPC_CFG) has ended, plus a margin", (t) => {
  const cfg = npcCfg();
  const g = start(t);
  const guide = vm.runInContext("({ GG_HELLO, GG_STEPS, GG_REACT_MARGIN, GG_NO_REACT_PAUSE })", g.item.ctx);
  // longest body turn: from 60 deg off down to BODY_TURN_STOP_DEG at BODY_TURN_RATE (exponential)
  const turnSec = Math.log(60 / cfg.BODY_TURN_STOP_DEG) / cfg.BODY_TURN_RATE;
  const answer = (r) => (!r ? 0 : r.wave ? cfg.WAVE_SEC : r.nod ? cfg.NOD_SEC : r.turn ? turnSec : 0);
  assert.ok(guide.GG_REACT_MARGIN >= 1.0);
  assert.ok(guide.GG_HELLO.react >= answer(cfg.GREET_REACTIONS.hello) && answer(cfg.GREET_REACTIONS.hello) > 0);
  for (const step of guide.GG_STEPS) {
    const r = cfg.GREET_REACTIONS[step.id];
    assert.ok(step.react >= answer(r), step.id + ": guide waits " + step.react + " s, the NPC answers for " + answer(r) + " s");
    assert.equal(step.react > 0, !!r, step.id + ": the guide's react time and the NPC's answer must agree");
  }
  assert.deepEqual(Object.keys(cfg.GREET_REACTIONS).sort(), ["hello", ...guide.GG_STEPS.filter((s) => s.react > 0).map((s) => s.id)].sort());
});

test("the timeline is the same with and without social cues", (t) => {
  const timeline = (social) => {
    const g = start(t, social);
    const t0 = g.now(), ev = [];
    let last = "";
    const watch = (sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) {
      g.run(0.05);
      const k = g.shown() ? g.text() : "";
      if (k !== last) { ev.push([Math.round((g.now() - t0) / 50) * 50, k]); last = k; }
      if (k.includes("手を振って")) g.wave();
      else if (k.includes("目をそらして")) g.p.yaw = 60;
      else if (k.includes("右へ1歩")) g.p.head = new V3(0.5, 1.5, -2);
      else if (k.includes("相手の顔を見て")) g.faceNpc();
    } };
    watch(30);
    ev.push(["transition", g.item.signals.filter((s) => s === "state_triggerTransition").length]);
    return ev;
  };
  const withCues = timeline("with"), without = timeline("without");
  assert.equal(withCues[withCues.length - 1][1], 1);
  assert.deepEqual(without, withCues);
});

test("the panel sits 0.7 m in front of the face, below the eyes, and comes along when the head turns", (t) => {
  const g = start(t);
  g.run(4.2);
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
  g.run(4.2);
  g.p.rh = new V3(0.3, 1.6, -1.9);
  g.run(5.0);
  assert.match(g.text(), /手を振って/);
  g.run(26.0);
  assert.equal(g.shown(), true, "next instruction");
  assert.match(g.text(), /目をそらして/);
  assert.deepEqual(g.cues(), ["hello"], "the NPC is not told about a skipped instruction");
  g.p.yaw = -50; g.run(0.5);                              // looking left counts as looking away, too
  assert.deepEqual(g.cues(), ["hello", "lookAway"]);
  g.run(1.2);
  g.p.yaw = 0; g.run(0.5);
  g.run(2.4);
  g.run(31.0);                                            // never steps aside
  g.run(1.0);
  // still looking at the NPC: the last instruction is not shown at all, the NPC is told at once
  assert.deepEqual(g.cues(), ["hello", "lookAway", "lookBack", "lookAgain"]);
  assert.equal(g.shown(), false);
  assert.equal(g.group.collectedData.greetTimeouts, 2);
  const secs = g.group.collectedData.greetStepSec.split(",").map(Number);
  assert.deepEqual([secs[0], secs[3], secs[4]], [-1, -1, 0]);
  g.run(3.2);
  assert.equal(g.item.signals.filter((s) => s === "state_triggerTransition").length, 1);
});

test("leaving the greeting state (or a session reset) hides the panel and stops the guide", (t) => {
  const g = start(t);
  g.run(4.2);
  assert.equal(g.shown(), true);
  g.item.itemState.state_exit = true;
  g.run(0.1);
  assert.equal(g.shown(), false);
  g.wave();
  assert.deepEqual(g.cues(), ["hello"]);
});
