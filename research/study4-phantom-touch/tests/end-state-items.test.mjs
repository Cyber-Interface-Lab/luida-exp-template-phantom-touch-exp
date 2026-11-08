// End state of the generated ExitPortal and Instruction items (exit gate far from the spawn point; texts while
// the next participant waits for the session reset).
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadItem, makePlayer, LUIDA_SCRIPTS, ITEM_SCRIPTS } from "./cluster-mock.mjs";

const SLI_BASE_JS = path.join(LUIDA_SCRIPTS, "StateManagement/StateListeningItemBase.js");
const S_END = 11;

function endItem(name, group) {
  const world = { global: { state_currentID: S_END }, players: [] };
  const item = loadItem([SLI_BASE_JS, path.join(ITEM_SCRIPTS, name + ".js")], { world, groupState: group, name, refs: {} });
  item.cb.start();
  item.itemState.state_enter = true;
  return { world, item };
}

test("ExitPortal: after the countdown the participant is teleported into the gate parked far away", (t) => {
  const p1 = makePlayer("p1");
  const { item } = endItem("ExitPortal", { participants: [p1] });
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  item.update(0.1);
  assert.equal(item.subNodes.WorldGateToLuidaBar?.enabled ?? null, null, "gate not shown during the countdown");
  now += 10_000;
  item.update(0.1);
  const gate = item.subNodes.WorldGateToLuidaBar;
  assert.equal(gate.enabled, true);
  assert.deepEqual([gate.pos.x, gate.pos.y, gate.pos.z], [100, 100, 100]);
  assert.equal(p1.positions.length, 1);
  assert.deepEqual([p1.positions[0].x, p1.positions[0].y, p1.positions[0].z], [100, 100.5, 100]);
  item.update(0.1);
  assert.equal(p1.positions.length, 1, "only once");
});

test("ExitPortal: a participant who already left is not teleported", (t) => {
  const p1 = makePlayer("p1");
  p1.here = false;
  const { item } = endItem("ExitPortal", { participants: [p1] });
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  item.update(0.1);
  now += 60_000;
  item.update(0.1);
  assert.equal(item.subNodes.WorldGateToLuidaBar.enabled, true);
  assert.equal(p1.positions.length, 0);
});

test("Instruction: countdown, then waiting text after the participant left", (t) => {
  const p1 = makePlayer("p1");
  const group = { participants: [p1] };
  const { item } = endItem("Instruction", group);
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const text = () => item.subNodes.Text.text;
  item.update(0.1);
  assert.match(text(), /あと 10 秒で募集ワールドへ/);
  now += 10_000;
  item.update(0.1);
  assert.match(text(), /募集ワールドへ移動します/);
  p1.here = false;                                     // left; the next player joined
  item.update(0.1);
  assert.equal(text(), "しばらくお待ちください…");
  group.participants = [];                             // no participant at all
  item.update(0.1);
  assert.equal(text(), "しばらくお待ちください…");
});
