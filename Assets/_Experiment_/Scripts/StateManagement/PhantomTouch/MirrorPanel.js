const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorFront').setEnabled(false)
        } }
    ],
    1: [
        { type: "exec", action: (deltaTime) => {
            if (firstTrialOfBlock()) $.subNode('Mirror').setEnabled(true);
        } }
    ],
    2: [
        { type: "exec", action: (deltaTime) => {
            if (firstTrialOfBlock()) { $.subNode('MirrorFront').setEnabled(true); $.subNode('Mirror').setEnabled(false); }
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(true)
        } }
    ]
};

const duringStateActions = {
};

const stateExitActions = {
    2: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorFront').setEnabled(false)
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } }
    ]
};


// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: position of this trial in its avatar block ----
const TRIALS_PER_BLOCK = 2;
function trialInBlock() {
  const t = $.getStateCompat('global', 'exp_trialID', 'integer');
  return ((typeof t === 'number' && t >= 0) ? t % TRIALS_PER_BLOCK : 0) + 1;
}
function firstTrialOfBlock() { return trialInBlock() === 1; }
function lastTrialOfBlock() { return trialInBlock() === TRIALS_PER_BLOCK; }
// A mirror shown or hidden by another item (the DeviceCheck hides the front mirror for the pose check's
// last step): { name, visible }
$.onReceive((messageType, arg) => {
  if (messageType !== 'mp_mirror' || !arg) return;
  const n = $.subNode(String(arg.name));
  if (n) n.setEnabled(!!arg.visible);
});