const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('WorldGateToLuidaBar').setEnabled(false)
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            ep_begin();
        } }
    ]
};

const duringStateActions = {
    11: [
        { type: "exec", action: (deltaTime) => {
            ep_update();
        } }
    ]
};

const stateExitActions = {
};


// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: ExitPortal (participant teleported into a gate far from the spawn point) ----
const EP_DELAY_SEC = 10;
const EP_GATE_OFFSET = new Vector3(100, 100, 100);   // item-local
function ep_begin() { $.state.ep_startTs = Date.now(); $.state.ep_shown = false; }
function ep_update() {
  if ($.state.ep_shown) return;
  if (Date.now() - ($.state.ep_startTs || Date.now()) < EP_DELAY_SEC * 1000) return;
  const gate = $.subNode('WorldGateToLuidaBar');
  if (!gate) return;
  gate.setPosition(EP_GATE_OFFSET);
  gate.setEnabled(true);
  $.state.ep_shown = true;
  const p = PARTICIPANTS[1];
  if (p && p.exists()) {
    p.setPosition($.getPosition().add(EP_GATE_OFFSET.clone().applyQuaternion($.getRotation())).add(new Vector3(0, 0.5, 0)));
    $.log('[ExitPortal] participant teleported to the exit gate');
  } else {
    $.log('[ExitPortal] gate shown (participant not found)');
  }
}