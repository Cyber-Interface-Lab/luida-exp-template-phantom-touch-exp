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

// ---- Study 4: ExitPortal (gate back to the recruitment world, at the participant's feet) ----
const EP_DELAY_SEC = 10;
function ep_begin() { $.state.ep_startTs = Date.now(); $.state.ep_shown = false; }
function ep_update() {
  if ($.state.ep_shown) return;
  if (Date.now() - ($.state.ep_startTs || Date.now()) < EP_DELAY_SEC * 1000) return;
  const gate = $.subNode('WorldGateToLuidaBar');
  if (!gate) return;
  const p = PARTICIPANTS[1];
  const feet = (p && p.exists()) ? p.getPosition() : null;
  if (feet) {
    const r = $.getRotation();
    const inv = new Quaternion(-r.x, -r.y, -r.z, r.w);
    gate.setPosition(feet.clone().sub($.getPosition()).applyQuaternion(inv));
  }
  gate.setEnabled(true);
  $.state.ep_shown = true;
  $.log('[ExitPortal] gate shown' + (feet ? ' at the participant' : ' (participant not found)'));
}