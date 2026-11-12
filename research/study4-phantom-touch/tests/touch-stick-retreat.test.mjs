// Backing away with the stick during the touch: NpcDirector lets the stick move the participant slowly in Trial - Touch
// (and freezes it again on exit); the NPC logs the avatar position next to the head (trace columns rx, ry, rz and the
// rootRetreat estimate) and, once it has gone, puts a participant who moved away back on the marker.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { ROOT, loadItem, makePlayer, makeHandle, Vector3, Quaternion, LUIDA_SCRIPTS, ITEM_SCRIPTS } from "./cluster-mock.mjs";

const SLI_BASE_JS = path.join(LUIDA_SCRIPTS, "StateManagement/StateListeningItemBase.js");
const NPC_JS = path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/NpcController.js");
const S_TOUCH = 4, S_REPORT = 5;

function moveRatePlayer() {
  const p = makePlayer("p1");
  p.rates = [];
  p.setMoveSpeedRate = (r) => { p.rates.push(r); };
  return p;
}

test("the stick moves the participant slowly during the touch only", () => {
  const p = moveRatePlayer();
  const npc = makeHandle("NPC");
  const group = { participants: [p], currentCondition: { social: "with", block: "1", order: "daily_first" } };
  const world = { global: { state_currentID: S_TOUCH, exp_trialID: 0 }, players: [p] };
  const item = loadItem([SLI_BASE_JS, path.join(ITEM_SCRIPTS, "NpcDirector.js")],
    { world, groupState: group, name: "NpcDirector", refs: { NPC: npc } });
  item.cb.start();
  item.itemState.state_enter = true;
  item.update(0.05);
  const rate = vm.runInContext("ND_TOUCH_MOVE_RATE", item.ctx);
  assert.equal(rate, 0.1);
  assert.equal(p.rates.at(-1), rate, "slow stick from the start of the touch");
  assert.equal(group.collectedData.touchMoveRate, rate, "the rate is recorded with the trial");
  assert.ok(npc.sent.some((m) => m.type === "npc_trial_start"));
  item.update(1.1);
  assert.equal(p.rates.at(-1), rate, "re-applied (LUIDA's player script may reset it)");
  // Trial - Touch -> Trial - Report
  world.global.state_currentID = S_REPORT;
  item.itemState.state_exit = true;
  item.itemState.state_enter = true;
  item.update(0.05);
  assert.equal(p.rates.at(-1), 0, "frozen again in the report");
  item.update(1.1);
  assert.equal(p.rates.at(-1), 0);
});

function loadNpc(p) {
  const group = { participants: [p] };
  const world = { global: {}, players: [p] };
  const item = loadItem([NPC_JS], { world, groupState: group, name: "NPC", globals: { HumanoidBone: { Head: 10 } } });
  return { item, group, ctx: item.ctx, st: item.state };
}

test("the trace carries the avatar position; rootRetreat measures how far the stick moved the participant back", () => {
  const p = makePlayer("p1");
  const { ctx, st } = loadNpc(p);
  // the hand approaches along -z (NPC in front at +z): moving back (-z) is moving away from it
  Object.assign(st, { npc_axisW: new Vector3(0, 0, -1), npc_base: null, npc_rootBase: null, npc_rootAway: 0, npc_away: 0,
    npc_latMin: 0, npc_latMax: 0, npc_onsetDist: -1, npc_trace: [] });
  const rot = new Quaternion(0, 0, 0, 1);
  let n = 0;
  const sample = (back, lean, root = true) => {
    const t = ++n / 10;
    const rootPos = new Vector3(0, 0, -2 - back);
    const head = { pos: new Vector3(0, 1.5, -2 - back - lean), rot };
    ctx.sampleTrace(0.1, t, head, new Vector3(0, 1.5, -1.6), 0.3 + back + lean, root ? rootPos : null);
  };
  for (let i = 0; i < 10; i++) sample(0, 0);             // baseline (first 1 s of the approach)
  for (let i = 1; i <= 12; i++) sample(0.05 * i, 0);     // backs away 0.6 m with the stick
  for (let i = 1; i <= 5; i++) sample(0.6, 0.02 * i);    // then leans back 0.1 m
  sample(0.6, 0.1, false);                                // avatar position not readable for a moment
  assert.ok(Math.abs(st.npc_rootAway - 0.6) < 1e-6, "rootRetreat = stick movement only: " + st.npc_rootAway);
  assert.ok(Math.abs(st.npc_away - 0.7) < 1e-6, "retreatDist = stick + lean: " + st.npc_away);
  const rows = st.npc_trace.concat(vm.runInContext("traceBuf", ctx));
  assert.equal(rows.length, 28);
  for (const r of rows) assert.equal(r.split(",").length, 12, "t,hx,hy,hz,hqx,hqy,hqz,hqw,d,rx,ry,rz: " + r);
  assert.deepEqual(rows[21].split(",").slice(9), ["0", "0", "-2.6"]);
  assert.deepEqual(rows.at(-1).split(",").slice(9), ["", "", ""]);
});

test("once the NPC has gone, a participant who moved away is put back on the marker (on their platform)", () => {
  const p = makePlayer("p1");
  let pos = new Vector3(0.1, 0.1, -2.6);
  p.getPosition = () => pos.clone();
  const { item, ctx, st, group } = loadNpc(p);
  st.npc_origin = new Vector3(0, 0, -2);
  st.npc_platformH = 0.1;
  ctx.returnParticipant();
  const last = p.positions.at(-1);
  assert.deepEqual([last.x, last.y, last.z], [0, 0.1, -2]);
  assert.equal(group.collectedData.returnedToMarker, true);
  assert.ok(item.logs.some((l) => /put back on the marker from 0\.608 m/.test(l)), item.logs.join("\n"));
  // still on the marker (within RETURN_MIN_DIST): left where they are
  pos = new Vector3(0.05, 0.1, -2.08);
  const n = p.positions.length;
  ctx.returnParticipant();
  assert.equal(p.positions.length, n);
  assert.equal(group.collectedData.returnedToMarker, false);
});
