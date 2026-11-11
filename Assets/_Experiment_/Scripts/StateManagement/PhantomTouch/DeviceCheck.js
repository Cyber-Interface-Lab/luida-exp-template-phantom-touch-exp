const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            dc_send({ visible: false, label: DC_FORCE_LABEL }); HideChild('Text');
        } }
    ],
    2: [
        { type: "exec", action: (deltaTime) => {
            dc_begin();
        } }
    ]
};

const duringStateActions = {
    2: [
        { type: "exec", action: (deltaTime) => {
            dc_update(deltaTime);
        } }
    ]
};

const stateExitActions = {
    2: [
        { type: "exec", action: (deltaTime) => {
            dc_end();
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
// ---- Study 4: DeviceCheck (head yaw left/right + both hands above the head) ----
// Runs in the pose-check state (after the avatar switch, before the NPC appears) on the 1st trial of each block,
// with the MirrorPanel's front mirror shown; the later trials of a block skip it immediately.
const DC_YAW_DEG = 25, DC_HANDS_SEC = 1.0, DC_RESCUE_SEC = 60;
const DC_FORCE_LABEL = '確認できない場合は\nこちらを押してください';
function dc_send(cfg) { try { const h = $.worldItemReference('DC_Force'); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[DeviceCheck] send: ' + e); } }
function dc_begin() {
  $.state.dc_active = false;
  if (!firstTrialOfBlock()) { ToNextState(); return; }
  $.state.dc_active = true;
  $.state.dc_start = Date.now();
  $.state.dc_left = false; $.state.dc_right = false; $.state.dc_hands = 0;
  $.state.dc_yaw0 = null; $.state.dc_rescue = false; $.state.dc_lastText = '';
  ShowChild('Text');
  dc_send({ visible: false, label: DC_FORCE_LABEL });
  dc_render();
}
function dc_yaw(p) {
  const r = p.getHumanoidBoneRotation(HumanoidBone.Head);
  if (!r) return null;
  const f = new Vector3(0, 0, 1).applyQuaternion(r);
  return Math.atan2(f.x, f.z) * 180 / Math.PI;
}
function dc_angleDiff(a, b) { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function dc_render() {
  const t = 'トラッキングの確認\n' +
    (($.state.dc_left && $.state.dc_right) ? '[済] ' : '[　] ') + '頭を左右に向ける\n' +
    (($.state.dc_hands || 0) >= DC_HANDS_SEC ? '[済] ' : '[　] ') + '両手を頭より上に（1秒）';
  if (t !== $.state.dc_lastText) { $.state.dc_lastText = t; SetText(t); }
}
function dc_update(dt) {
  if (!$.state.dc_active) return;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  const yaw = dc_yaw(p);
  if (yaw !== null) {
    if ($.state.dc_yaw0 === null || $.state.dc_yaw0 === undefined) $.state.dc_yaw0 = yaw;
    const d = dc_angleDiff(yaw, $.state.dc_yaw0);
    if (d <= -DC_YAW_DEG) $.state.dc_left = true;
    if (d >= DC_YAW_DEG) $.state.dc_right = true;
  }
  const head = p.getHumanoidBonePosition(HumanoidBone.Head);
  const lh = p.getHumanoidBonePosition(HumanoidBone.LeftHand);
  const rh = p.getHumanoidBonePosition(HumanoidBone.RightHand);
  if (head && lh && rh && lh.y > head.y && rh.y > head.y) $.state.dc_hands = ($.state.dc_hands || 0) + dt;
  else if (($.state.dc_hands || 0) < DC_HANDS_SEC) $.state.dc_hands = 0;
  const elapsed = (Date.now() - ($.state.dc_start || Date.now())) / 1000;
  if (elapsed > DC_RESCUE_SEC && !$.state.dc_rescue) { $.state.dc_rescue = true; dc_send({ visible: true }); }
  let forced = false;
  const b = $.getStateCompat('this', 'dc_btn', 'integer');
  if (b > 0) { $.setStateCompat('this', 'dc_btn', 0); if ($.state.dc_rescue) forced = true; }
  const passed = $.state.dc_left && $.state.dc_right && ($.state.dc_hands || 0) >= DC_HANDS_SEC;
  if (passed || forced) { dc_finish(elapsed, forced); return; }
  dc_render();
}
function dc_finish(elapsed, forced) {
  $.state.dc_active = false;
  SendDataToCollector('deviceCheckSec', elapsed);
  SendDataToCollector('deviceCheckForced', !!forced);
  ProcessAndSaveCollectedData();
  dc_send({ visible: false });
  SetText('確認できました。\nありがとうございます。');
  ToNextState();
}
function dc_end() { dc_send({ visible: false }); HideChild('Text'); $.state.dc_active = false; }