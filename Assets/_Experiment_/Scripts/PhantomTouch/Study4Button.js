// ===== Study 4: generic button item =====
// Attached to each button Item (RP_*, AG_*, DC_*). The click itself is handled by
// CCK's Interact Item Trigger on the same GameObject (writes an Integer state on the
// owner item). This script only handles appearance, driven by "btn_cfg" messages
// sent by the owner state-listening item:
//   { label?: string, visible?: boolean, on?: boolean }
// Sub-nodes: "Visual" (normal cube), "VisualOn" (highlighted cube), "Label" (TextView).

$.onStart(() => {
  $.state.visible = true;
  $.state.on = false;
  applyVisual();
});

$.onReceive((messageType, arg, sender) => {
  if (messageType !== "btn_cfg" || !arg) return;
  try {
    if (arg.label !== undefined) {
      const label = $.subNode("Label");
      if (label) label.setText(String(arg.label));
    }
    if (arg.visible !== undefined) $.state.visible = !!arg.visible;
    if (arg.on !== undefined) $.state.on = !!arg.on;
    applyVisual();
  } catch (e) {
    $.log("[Study4Button] btn_cfg failed: " + e);
  }
});

function applyVisual() {
  const visible = $.state.visible !== false;
  const on = !!$.state.on;
  const normal = $.subNode("Visual");
  const highlighted = $.subNode("VisualOn");
  const label = $.subNode("Label");
  if (normal) normal.setEnabled(visible && !on);
  if (highlighted) highlighted.setEnabled(visible && on);
  if (label) label.setEnabled(visible);
}
