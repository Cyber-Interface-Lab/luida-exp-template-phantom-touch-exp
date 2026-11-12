// Height platform (Study4Platform.js): the cube is raised by "platform_set" { h }; the blue standing mark (TopMarker)
// comes along on its top, so a participant on the platform can still see where the centre is.
// Run: node --test "research/study4-phantom-touch/tests/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, loadItem } from "./cluster-mock.mjs";

const PLATFORM_JS = path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/Study4Platform.js");

test("the blue mark is shown on the raised platform's top and hidden with it", () => {
  const item = loadItem([PLATFORM_JS], { world: { global: {}, players: [] }, name: "HeightPlatform" });
  item.cb.start();
  const cube = item.subNodes.Cube, mark = item.subNodes.TopMarker;
  assert.equal(cube.enabled, false);
  assert.equal(mark.enabled, false);
  item.receive("platform_set", { h: 0.08 }, null);
  assert.equal(cube.enabled, true);
  assert.equal(mark.enabled, true);
  assert.ok(Math.abs(cube.pos.y - (0.08 - 0.5)) < 1e-9, "cube top at h");
  assert.ok(Math.abs(mark.pos.y - 0.09) < 1e-9, "mark just above the top");
  item.receive("platform_set", { h: 0 }, null);
  assert.equal(cube.enabled, false);
  assert.equal(mark.enabled, false);
});
