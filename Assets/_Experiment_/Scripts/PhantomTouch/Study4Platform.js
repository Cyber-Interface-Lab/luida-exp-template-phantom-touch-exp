// ===== Study 4: height platform under the participant's standing spot =====
// The NPC (NpcController.js) compares head-bone heights at the start of each block's greeting and, when the
// participant is the shorter one, sends "platform_set" { h } so that the participant stands h metres higher.
// Sub-node "Cube": 1 m tall; its top is at the item origin (floor) when h = 0, i.e. fully underground, so it
// is hidden then and shown only while raised. Sub-node "TopMarker": the blue standing mark (like the scene's
// FloorMarker, which the raised cube covers), shown on the cube's top while raised.

const CUBE_HEIGHT = 1.0;

$.onStart(() => {
  apply(0);
});

$.onReceive((messageType, arg, sender) => {
  if (messageType !== "platform_set") return;
  try {
    apply(arg && typeof arg.h === "number" && arg.h > 0 ? arg.h : 0);
  } catch (e) {
    $.log("[Study4Platform] platform_set failed: " + e);
  }
});

function apply(h) {
  $.state.h = h;
  const cube = $.subNode("Cube");
  if (!cube) return;
  cube.setPosition(new Vector3(0, h - CUBE_HEIGHT / 2, 0));
  cube.setEnabled(h > 0.001);
  const mark = $.subNode("TopMarker");
  if (mark) {
    mark.setPosition(new Vector3(0, h + 0.01, 0));
    mark.setEnabled(h > 0.001);
  }
}
