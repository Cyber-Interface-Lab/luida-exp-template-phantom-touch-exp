// Start blocker (Study4StartBlocker.js): the wall in front of the standing spot is shown until LUIDA's global
// "exp_arePlayersEnough" is set (the session starts: the Start state), and again after a session reset clears it.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, loadItem } from "./cluster-mock.mjs";

const JS = path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/Study4StartBlocker.js");

test("the wall stands until the session starts and comes back after a session reset", () => {
  const world = { global: {}, players: [] };
  const item = loadItem([JS], { world, name: "StartBlocker" });
  item.cb.start();
  item.update(0.02);
  assert.equal(item.subNodes.Wall.enabled, true, "before the session (global not set yet)");
  world.global.exp_arePlayersEnough = true;
  item.update(0.02);
  assert.equal(item.subNodes.Wall.enabled, false, "the session runs");
  world.global.exp_arePlayersEnough = false;
  item.update(0.02);
  assert.equal(item.subNodes.Wall.enabled, true, "after a session reset");
});
