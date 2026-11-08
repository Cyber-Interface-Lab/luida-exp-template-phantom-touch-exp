// "いいえ" button of the ParticipantManager's new-participant prompt (see ParticipantManager.js, nr_*).
// The ParticipantManager moves this item next to its panel while hidden ("luida_prompt_place"), shows it only
// when the player in front of it can resume (same account as an enrolled participant who left) and hides it
// with the panel. Pressing it reports the player to the ParticipantManager, which puts them back into their
// participant slot instead of resetting the session. Needs a MovableItem (setPosition) and a collider in "Body".
$.onStart(() => {
  $.subNode("Body").setEnabled(false);
});

$.onReceive((messageType, arg, sender) => {
  switch (messageType) {
    case "luida_prompt_place":
      $.state.manager = sender;
      if (arg && arg.pos) $.setPosition(arg.pos);
      if (arg && arg.rot) $.setRotation(arg.rot);
      break;
    case "luida_prompt_show":
      $.state.manager = sender;
      $.subNode("Body").setEnabled(true);
      break;
    case "luida_prompt_hide":
      $.subNode("Body").setEnabled(false);
      break;
    default:
      break;
  }
});

$.onInteract((player) => {
  if ($.state.manager) $.state.manager.send("luida_prompt_no", { player: player });
});
