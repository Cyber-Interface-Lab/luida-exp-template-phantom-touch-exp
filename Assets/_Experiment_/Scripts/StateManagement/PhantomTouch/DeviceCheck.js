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
// participant holds the right hand beside the headset (their own eye height) and clicks the large button straight
// ahead (DC_Eye; an item script cannot see a bare trigger pull, only Interact / Use on an item). The right hand's
// height above the head bone, averaged over the last DC_EYE_WINDOW_SEC, is sent to the NPC ('npc_eye_cal'), which
// aims its hand from it in this block.
const DC_YAW_DEG = 25, DC_HANDS_SEC = 1.0, DC_RESCUE_SEC = 60;
const DC_FORCE_LABEL = '確認できない場合は\nこちらを押してください';
const DC_EYE_LABEL = 'ここに向けて\nトリガーを引く';
const DC_EYE_WINDOW_SEC = 0.5;                  // the hand height is averaged over this long before the click ...
const DC_EYE_STILL = 0.03;                      // ... and must not have varied by more than this (m)
const DC_EYE_MIN = -0.05, DC_EYE_MAX = 0.30;    // accepted eye height above the head bone (m)
const DC_EYE_RESCUE_SEC = 45, DC_EYE_RESCUE_TRIES = 3;   // then the rescue button skips the measurement
let dcEyeSamples = [];
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
  let t;
  if ($.state.dc_phase === 'eye') {
    const why = $.state.dc_eyeWhy;
    t = (why === 'moving' ? '手を止めてから、もう一度' : why ? '手を目の高さに上げて、もう一度' : '目の高さの確認') + '\n' +
      '右手をヘッドセットの右横\n（ご自身の目の高さ）に添えて、\n正面のボタンに向けて\nトリガーを引いてください';
  } else {
    t = 'トラッキングの確認\n' +
      (($.state.dc_left && $.state.dc_right) ? '[済] ' : '[　] ') + '頭を左右に向ける\n' +
      (($.state.dc_hands || 0) >= DC_HANDS_SEC ? '[済] ' : '[　] ') + '両手を頭より上に（1秒）';
  }
  if (t !== $.state.dc_lastText) { $.state.dc_lastText = t; SetText(t); }
}
function dc_update(dt) {
  if (!$.state.dc_active) return;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  const b = $.getStateCompat('this', 'dc_btn', 'integer');   // 1: rescue button, 2: eye-height button
  if (b > 0) $.setStateCompat('this', 'dc_btn', 0);
  if ($.state.dc_phase === 'eye') { dc_eyeUpdate(p, b); return; }
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
  const forced = b === 1 && !!$.state.dc_rescue;
  const passed = $.state.dc_left && $.state.dc_right && ($.state.dc_hands || 0) >= DC_HANDS_SEC;
  if (passed || forced) { dc_eyeBegin(elapsed, forced); return; }
  dc_render();
}
// 2nd part. After a forced pose check (tracking trouble) the rescue button stays, so this part can be skipped at once.
function dc_eyeBegin(elapsed, forced) {
  SendDataToCollector('deviceCheckSec', elapsed);
  SendDataToCollector('deviceCheckForced', !!forced);
  $.state.dc_phase = 'eye';
  $.state.dc_eyeStart = Date.now();
  $.state.dc_eyeTries = 0; $.state.dc_eyeWhy = '';
  $.state.dc_rescue = !!forced;
  dcEyeSamples = [];
  dc_send({ visible: !!forced });
  dc_sendEye({ visible: true, label: DC_EYE_LABEL });
  dc_render();
  $.log('[DeviceCheck] pose check ' + (forced ? 'forced' : 'passed') + ' after ' + elapsed.toFixed(1) + ' s; eye height next');
}
function dc_eyeUpdate(p, b) {
  const now = Date.now();
  const head = p.getHumanoidBonePosition(HumanoidBone.Head), rh = p.getHumanoidBonePosition(HumanoidBone.RightHand);
  if (head && rh) dcEyeSamples.push({ t: now, up: rh.y - head.y, hand: rh.y, head: head.y });
  while (dcEyeSamples.length > 0 && now - dcEyeSamples[0].t > DC_EYE_WINDOW_SEC * 1000) dcEyeSamples.shift();
  const elapsed = (now - ($.state.dc_eyeStart || now)) / 1000;
  if (!$.state.dc_rescue && (elapsed > DC_EYE_RESCUE_SEC || ($.state.dc_eyeTries || 0) >= DC_EYE_RESCUE_TRIES)) {
    $.state.dc_rescue = true; dc_send({ visible: true });
  }
  if (b === 1 && $.state.dc_rescue) { dc_finish(null, elapsed); return; }
  if (b === 2) {
    const m = dc_eyeMeasure();
    if (m.ok) { dc_finish(m, elapsed); return; }
    $.state.dc_eyeTries = ($.state.dc_eyeTries || 0) + 1;
    $.state.dc_eyeWhy = m.why;
    $.log('[DeviceCheck] eye height not taken (' + m.why + (m.up !== undefined ? ', hand ' + m.up.toFixed(3) + ' m above the head bone' : '') +
          '); attempt ' + $.state.dc_eyeTries);
  }
  dc_render();
}
// The right hand's height above the head bone over the last DC_EYE_WINDOW_SEC: still enough and plausible?
function dc_eyeMeasure() {
  const n = dcEyeSamples.length;
  if (n < 2) return { ok: false, why: 'bones' };
  let up = 0, hand = 0, head = 0, lo = Infinity, hi = -Infinity;
  for (const s of dcEyeSamples) { up += s.up; hand += s.hand; head += s.head; if (s.up < lo) lo = s.up; if (s.up > hi) hi = s.up; }
  up /= n; hand /= n; head /= n;
  if (hi - lo > DC_EYE_STILL) return { ok: false, why: 'moving', up: up };
  if (up < DC_EYE_MIN || up > DC_EYE_MAX) return { ok: false, why: 'range', up: up };
  return { ok: true, up: up, hand: hand, head: head };
}
// m: the measurement, or null when skipped with the rescue button (the NPC then uses the avatar's eye bones).
function dc_finish(m, eyeSec) {
  $.state.dc_active = false;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  SendDataToCollector('eyeCalUp', m ? r3(m.up) : '');
  SendDataToCollector('eyeCalHandY', m ? r3(m.hand) : '');
  SendDataToCollector('eyeCalHeadY', m ? r3(m.head) : '');
  SendDataToCollector('eyeCalSec', Math.round(eyeSec * 10) / 10);
  SendDataToCollector('eyeCalRetries', $.state.dc_eyeTries || 0);
  SendDataToCollector('eyeCalSkipped', !m);
  if (m) {
    try { $.worldItemReference('NPC').send('npc_eye_cal', { up: m.up }); }
    catch (e) { $.log('[DeviceCheck] npc_eye_cal: ' + e); }
  }
  $.log('[DeviceCheck] eye height ' + (m ? r3(m.up) + ' m above the head bone (hand ' + r3(m.hand) + ', head bone ' + r3(m.head) + ')' : 'skipped') +
        ' after ' + eyeSec.toFixed(1) + ' s, ' + ($.state.dc_eyeTries || 0) + ' failed attempt(s)');
  ProcessAndSaveCollectedData();
  dc_send({ visible: false }); dc_sendEye({ visible: false });
  SetText('確認できました。\nありがとうございます。');
  ToNextState();
}
function dc_end() { dc_send({ visible: false }); dc_sendEye({ visible: false }); HideChild('Text'); $.state.dc_active = false; }