const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            dc_send({ visible: false, label: DC_FORCE_LABEL }); dc_sendEye({ visible: false, label: DC_EYE_LABEL }); HideChild('Text');
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
// ---- Study 4: DeviceCheck (head yaw left/right + both hands above the head, then the eye height) ----
// Runs in the pose-check state (after the avatar switch, before the NPC appears) on the 1st trial of each block,
// with the MirrorPanel's front mirror shown; the later trials of a block skip it immediately.
// 1st part ('pose'): tracking check. 2nd part ('eye'): the participant's own eye height in this avatar. Cluster puts
// the first-person camera a little off the avatar's eye bones, and an item script cannot read the camera. So the
// participant holds one hand beside the headset (their own eye height) and presses the large button straight ahead
// (DC_Eye) with the other hand. The higher hand's height above the head bone at that moment is sent to the NPC
// ('npc_eye_cal'), which aims its hand from it in this block.
const DC_YAW_DEG = 25, DC_HANDS_SEC = 1.0, DC_RESCUE_SEC = 60;
const DC_FORCE_LABEL = '確認できない場合は\nこちらを押してください';
const DC_EYE_LABEL = 'ここを押す';
function dc_btnSend(id, cfg) { try { const h = $.worldItemReference(id); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[DeviceCheck] send ' + id + ': ' + e); } }
function dc_send(cfg) { dc_btnSend('DC_Force', cfg); }
function dc_sendEye(cfg) { dc_btnSend('DC_Eye', cfg); }
function dc_begin() {
  $.state.dc_active = false;
  if (!firstTrialOfBlock()) { ToNextState(); return; }
  $.state.dc_active = true;
  $.state.dc_phase = 'pose';
  $.state.dc_start = Date.now();
  $.state.dc_left = false; $.state.dc_right = false; $.state.dc_hands = 0;
  $.state.dc_yaw0 = null; $.state.dc_rescue = false; $.state.dc_lastText = '';
  $.setStateCompat('this', 'dc_btn', 0);
  ShowChild('Text');
  dc_send({ visible: false, label: DC_FORCE_LABEL });
  dc_sendEye({ visible: false, label: DC_EYE_LABEL });
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
  const t = $.state.dc_phase === 'eye'
    ? '目の高さの確認\n片手をヘッドセットの横\n（ご自身の目の高さ）に添えたまま、\nもう片方の手で\n正面のボタンを押してください'
    : 'トラッキングの確認\n' +
      (($.state.dc_left && $.state.dc_right) ? '[済] ' : '[　] ') + '頭を左右に向ける\n' +
      (($.state.dc_hands || 0) >= DC_HANDS_SEC ? '[済] ' : '[　] ') + '両手を頭より上に（1秒）';
  if (t !== $.state.dc_lastText) { $.state.dc_lastText = t; SetText(t); }
}
function dc_update(dt) {
  if (!$.state.dc_active) return;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  const b = $.getStateCompat('this', 'dc_btn', 'integer');   // 1: rescue button, 2: eye-height button
  if (b > 0) $.setStateCompat('this', 'dc_btn', 0);
  const head = p.getHumanoidBonePosition(HumanoidBone.Head);
  const lh = p.getHumanoidBonePosition(HumanoidBone.LeftHand);
  const rh = p.getHumanoidBonePosition(HumanoidBone.RightHand);
  if ($.state.dc_phase === 'eye') { if (b === 2) dc_finish(head, lh, rh); return; }
  const yaw = dc_yaw(p);
  if (yaw !== null) {
    if ($.state.dc_yaw0 === null || $.state.dc_yaw0 === undefined) $.state.dc_yaw0 = yaw;
    const d = dc_angleDiff(yaw, $.state.dc_yaw0);
    if (d <= -DC_YAW_DEG) $.state.dc_left = true;
    if (d >= DC_YAW_DEG) $.state.dc_right = true;
  }
  if (head && lh && rh && lh.y > head.y && rh.y > head.y) $.state.dc_hands = ($.state.dc_hands || 0) + dt;
  else if (($.state.dc_hands || 0) < DC_HANDS_SEC) $.state.dc_hands = 0;
  const elapsed = (Date.now() - ($.state.dc_start || Date.now())) / 1000;
  if (elapsed > DC_RESCUE_SEC && !$.state.dc_rescue) { $.state.dc_rescue = true; dc_send({ visible: true }); }
  const forced = b === 1 && !!$.state.dc_rescue;
  const passed = $.state.dc_left && $.state.dc_right && ($.state.dc_hands || 0) >= DC_HANDS_SEC;
  if (passed || forced) { dc_eyeBegin(elapsed, forced); return; }
  dc_render();
}
// 2nd part: the eye-height button replaces the rescue button
function dc_eyeBegin(elapsed, forced) {
  SendDataToCollector('deviceCheckSec', elapsed);
  SendDataToCollector('deviceCheckForced', !!forced);
  $.state.dc_phase = 'eye';
  $.state.dc_eyeStart = Date.now();
  dc_send({ visible: false });
  dc_sendEye({ visible: true, label: DC_EYE_LABEL });
  dc_render();
  $.log('[DeviceCheck] pose check ' + (forced ? 'forced' : 'passed') + ' after ' + elapsed.toFixed(1) + ' s; eye height next');
}
// The button was pressed: the higher hand is the one held at eye height.
function dc_finish(head, lh, rh) {
  $.state.dc_active = false;
  const eyeSec = (Date.now() - ($.state.dc_eyeStart || Date.now())) / 1000;
  const hand = (lh && rh) ? (lh.y >= rh.y ? lh : rh) : (lh || rh);
  const side = !hand ? '' : hand === lh ? 'left' : 'right';
  const up = (head && hand) ? hand.y - head.y : null;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  SendDataToCollector('eyeCalUp', up !== null ? r3(up) : '');
  SendDataToCollector('eyeCalHand', side);
  SendDataToCollector('eyeCalHandY', hand ? r3(hand.y) : '');
  SendDataToCollector('eyeCalHeadY', head ? r3(head.y) : '');
  SendDataToCollector('eyeCalSec', Math.round(eyeSec * 10) / 10);
  if (up !== null) {
    try { $.worldItemReference('NPC').send('npc_eye_cal', { up: up }); }
    catch (e) { $.log('[DeviceCheck] npc_eye_cal: ' + e); }
  }
  $.log('[DeviceCheck] eye height ' + (up !== null ? r3(up) + ' m above the head bone (' + side + ' hand ' + r3(hand.y) + ', head bone ' + r3(head.y) + ')' : 'not read (bones)') +
        ' after ' + eyeSec.toFixed(1) + ' s');
  ProcessAndSaveCollectedData();
  dc_sendEye({ visible: false });
  SetText('確認できました。\nありがとうございます。');
  ToNextState();
}
function dc_end() { dc_send({ visible: false }); dc_sendEye({ visible: false }); HideChild('Text'); $.state.dc_active = false; }