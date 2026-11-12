// ===== Study 4: wall in front of the standing spot until the experiment session starts =====
// Before the Start state (and again after a session reset) the panels and buttons ahead of the participant are not
// in use yet, and the buttons would be visible and clickable. This item's "Wall" sub-node (floor to ceiling, room
// wide, with a collider) hides them until LUIDA's global state "exp_arePlayersEnough" is set, which happens when the
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
