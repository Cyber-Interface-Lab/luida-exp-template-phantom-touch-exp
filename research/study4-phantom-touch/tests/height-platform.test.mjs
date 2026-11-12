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
  assert.ok(Math.abs(cube.pos.y - (0.08 - 2.5)) < 1e-9, "cube top at h (5 m tall cube)");
  assert.ok(Math.abs(mark.pos.y - 0.09) < 1e-9, "mark just above the top");
  item.receive("platform_set", { h: 0 }, null);
  assert.equal(cube.enabled, false);
  assert.equal(mark.enabled, false);
});

test("a very small avatar's height is read (it used to count as unreadable below 0.5 m and got no platform)", () => {
  const NPC_JS = path.join(ROOT, "Assets/_Experiment_/Scripts/PhantomTouch/NpcController.js");
  const p = { exists: () => true, getPosition: () => ({ x: 0, y: 0, z: -2 }), getHumanoidBonePosition: (b) => (b === 10 ? { x: 0, y: 0.45, z: -2 } : null) };
  const item = loadItem([NPC_JS], { world: { global: {}, players: [p] }, groupState: { participants: [p] }, name: "NPC", globals: { HumanoidBone: { Head: 10 } } });
  assert.equal(item.ctx.participantHeight(p), 0.45);
  p.getHumanoidBonePosition = () => null;
  assert.equal(item.ctx.participantHeight(p), null, "bones not readable");
});
