// ===== Study 4: generic button item =====
// Attached to each button Item (RP_*, AG_*, DC_*). The click itself is handled by
// CCK's Interact Item Trigger on the same GameObject (writes an Integer state on the
// owner item). This script only handles appearance, driven by "btn_cfg" messages
// sent by the owner state-listening item:
//   { label?: string, visible?: boolean, on?: boolean, fit?: [maxWidth, maxHeight, maxSize] }
// With fit, the label text size is chosen so the label (may contain "\n") fits in maxWidth x maxHeight (m).
// Sub-nodes: "Visual" (normal cube), "VisualOn" (highlighted cube), "Label" (TextView).

// CCK TextView glyph metrics (Noto Sans CJK): full-width glyph ~1.85 x size wide, line ~2.74 x size tall,
// ASCII glyphs ~0.56 of a full-width one.
function fitSize(text, fit) {
  const lines = String(text).split("\n");
  let w = 0;
  for (const line of lines) {
    let lw = 0;
    for (let i = 0; i < line.length; i++) lw += line.charCodeAt(i) < 0x80 ? 0.56 : 1.0;
    if (lw > w) w = lw;
  }
  let size = fit[2];
  if (w > 0) size = Math.min(size, fit[0] / (1.85 * w));
  return Math.min(size, fit[1] / (2.74 * lines.length));
}

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
      if (label) {
        label.setText(String(arg.label));
        if (arg.fit && arg.fit.length === 3) label.setTextSize(fitSize(arg.label, arg.fit));
      }
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
