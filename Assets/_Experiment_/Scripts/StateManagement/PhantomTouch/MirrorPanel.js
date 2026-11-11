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
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorTouch').setEnabled(false)
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
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            $.state.mp_fitted = mp_fitTouch();
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorTouch').setEnabled(true)
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } }
    ]
};

const duringStateActions = {
    4: [
        { type: "exec", action: (deltaTime) => {
            if (!$.state.mp_fitted) $.state.mp_fitted = mp_fitTouch();
        } }
    ]
};

const stateExitActions = {
    2: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorFront').setEnabled(false)
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorTouch').setEnabled(false)
        } },
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
// ---- Study 4: MirrorPanel (the touch mirror is fitted to the participant's height) ----
const MP_TOUCH = { local: new Vector3(0.9192, 0.075, -0.3808), baseY: 1.275, w: 0.9, floorY: 0,
  minBottom: 0.3, maxTop: 2.1, margin: 0.05, eyeAboveHead: 0.07, topAboveHead: 0.22 };
// returns false while the participant's bones cannot be read (the mirror keeps its previous size)
function mp_fitTouch() {
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return false;
  let head = null;
  try { head = p.getHumanoidBonePosition(HumanoidBone.Head); } catch (e) { head = null; }
  const root = p.getPosition();
  if (!head || !root || head.y - root.y < 0.3) return false;
  const c = MP_TOUCH;
  const eye = head.y + c.eyeAboveHead, feet = Math.min(root.y, c.floorY), top = head.y + c.topAboveHead;
  const bottom = Math.max(c.minBottom, (eye + feet) / 2 - c.margin);
  const upper = Math.min(c.maxTop, Math.max(bottom + 0.3, (eye + top) / 2 + c.margin));
  const node = $.subNode('MirrorTouch');
  if (!node) return true;
  const mid = (bottom + upper) / 2;
  node.setPosition(new Vector3(c.local.x, c.local.y + mid - c.baseY, c.local.z));
  try { node.getUnityComponent('Transform').unityProp.localScale = new Vector3(c.w, upper - bottom, 1); }
  catch (e) { $.log('[MirrorPanel] mirror size: ' + e); }
  $.log('[MirrorPanel] touch mirror ' + bottom.toFixed(2) + '..' + upper.toFixed(2) + ' m (head bone ' + head.y.toFixed(2) + ', feet ' + root.y.toFixed(2) + ')');
  return true;
}