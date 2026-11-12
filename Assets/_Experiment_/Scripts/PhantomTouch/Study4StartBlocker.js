// ===== Study 4: covers over the buttons until the experiment session starts =====
// Before the Start state (and again after a session reset) the buttons are not in use yet but would be visible and
// clickable. This item's "Wall" sub-node (one board with a collider in front of each button group; Study4SceneBuilder
// EnsureStartBlocker) hides them until LUIDA's global state "exp_arePlayersEnough" is set, which happens when the
// session starts (the Start state is entered at the same moment); a session reset clears it again.

$.onStart(() => {
  $.state.shown = null;
});

$.onUpdate(() => {
  const started = !!$.getStateCompat("global", "exp_arePlayersEnough", "boolean");
  if ($.state.shown === !started) return;
  $.state.shown = !started;
  const wall = $.subNode("Wall");
  if (wall) wall.setEnabled(!started);
});
