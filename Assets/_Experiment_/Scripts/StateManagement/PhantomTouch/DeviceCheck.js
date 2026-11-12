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
// ---- Study 4: DeviceCheck (head yaw left/right + both hands held at the forehead) ----
// Runs in the pose-check state (after the avatar switch, before the NPC appears) on the 1st trial of each block,
// with the MirrorPanel's front mirror shown; the later trials of a block skip it immediately.
// The hands-at-the-forehead hold also measures the participant's own forehead height in this avatar, where the NPC's
// hand goes (Cluster puts the first-person camera a little off the avatar's eye bones, and an item script cannot read
// the camera): both hands above the eyes (head bone + DC_EYE_UP) and below DC_HANDS_MAX_UP, each staying within
// DC_HANDS_STILL of where it was when the hold began, for DC_HANDS_SEC. The mean height of both hands above the head
// bone over the hold is sent to the NPC ('npc_forehead_cal'), which aims its hand there in this block.
const DC_YAW_DEG = 25, DC_RESCUE_SEC = 60;
const DC_HANDS_SEC = 3.0;        // hold this long ...
const DC_EYE_UP = 0.06;          // ... both hands higher than the eyes (head bone + this; the eye bones of the project's
                                 //     VRoid models; not read: the editor emulator throws for avatars without them) ...
const DC_HANDS_MAX_UP = 0.25;    // ... but not raised above the head (head bone + this) ...
const DC_HANDS_STILL = 0.05;     // ... each hand within this of where it was when the hold began (m)
const DC_FORCE_LABEL = '確認できない場合は\nこちらを押してください';
function dc_send(cfg) { try { const h = $.worldItemReference('DC_Force'); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[DeviceCheck] send: ' + e); } }
function dc_begin() {
  $.state.dc_active = false;
  if (!firstTrialOfBlock()) { ToNextState(); return; }
  $.state.dc_active = true;
  $.state.dc_start = Date.now();
  $.state.dc_left = false; $.state.dc_right = false;
  $.state.dc_hold = 0; $.state.dc_anchorL = null; $.state.dc_anchorR = null; $.state.dc_sum = null;
  $.state.dc_cal = null;           // { up, left, right } once a hold has been completed
  $.state.dc_yaw0 = null; $.state.dc_rescue = false; $.state.dc_lastText = '';
  $.setStateCompat('this', 'dc_btn', 0);
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
    ($.state.dc_cal ? '[済] ' : '[　] ') + '両手を額の高さに（3秒）';
  if (t !== $.state.dc_lastText) { $.state.dc_lastText = t; SetText(t); }
}
// Both hands at the forehead, held still: accumulate; any break starts the hold again from the current position.
function dc_holdHands(head, lh, rh, dt) {
  if ($.state.dc_cal) return;
  const at = (h) => h && h.y > head.y + DC_EYE_UP && h.y < head.y + DC_HANDS_MAX_UP;
  const near = (h, a) => a && h.clone().sub(a).length() <= DC_HANDS_STILL;
  if (!(head && at(lh) && at(rh))) { $.state.dc_hold = 0; $.state.dc_anchorL = null; return; }
  if (!near(lh, $.state.dc_anchorL) || !near(rh, $.state.dc_anchorR)) {
    $.state.dc_anchorL = lh; $.state.dc_anchorR = rh; $.state.dc_hold = 0; $.state.dc_sum = { l: 0, r: 0, w: 0 };
  }
  const s = $.state.dc_sum;
  s.l += (lh.y - head.y) * dt; s.r += (rh.y - head.y) * dt; s.w += dt;
  $.state.dc_sum = s;
  $.state.dc_hold = ($.state.dc_hold || 0) + dt;
  if ($.state.dc_hold >= DC_HANDS_SEC && s.w > 0) {
    const l = s.l / s.w, r = s.r / s.w;
    $.state.dc_cal = { up: (l + r) / 2, left: l, right: r };
    $.log('[DeviceCheck] hands held at the forehead: ' + ((l + r) / 2).toFixed(3) + ' m above the head bone (left ' + l.toFixed(3) + ', right ' + r.toFixed(3) + ')');
  }
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
  dc_holdHands(p.getHumanoidBonePosition(HumanoidBone.Head), p.getHumanoidBonePosition(HumanoidBone.LeftHand),
    p.getHumanoidBonePosition(HumanoidBone.RightHand), dt);
  const elapsed = (Date.now() - ($.state.dc_start || Date.now())) / 1000;
  if (elapsed > DC_RESCUE_SEC && !$.state.dc_rescue) { $.state.dc_rescue = true; dc_send({ visible: true }); }
  let forced = false;
  const b = $.getStateCompat('this', 'dc_btn', 'integer');
  if (b > 0) { $.setStateCompat('this', 'dc_btn', 0); if ($.state.dc_rescue) forced = true; }
  const passed = $.state.dc_left && $.state.dc_right && !!$.state.dc_cal;
  if (passed || forced) { dc_finish(elapsed, forced); return; }
  dc_render();
}
// The forehead height goes to the NPC when the hold was completed (also when the rest was passed with the rescue
// button); without it the NPC uses the avatar's eye bones.
function dc_finish(elapsed, forced) {
  $.state.dc_active = false;
  const c = $.state.dc_cal;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  SendDataToCollector('deviceCheckSec', elapsed);
  SendDataToCollector('deviceCheckForced', !!forced);
  SendDataToCollector('foreheadCalUp', c ? r3(c.up) : '');
  SendDataToCollector('foreheadCalLeftUp', c ? r3(c.left) : '');
  SendDataToCollector('foreheadCalRightUp', c ? r3(c.right) : '');
  if (c) {
    try { $.worldItemReference('NPC').send('npc_forehead_cal', { up: c.up }); }
    catch (e) { $.log('[DeviceCheck] npc_forehead_cal: ' + e); }
  }
  $.log('[DeviceCheck] pose check ' + (forced ? 'forced' : 'passed') + ' after ' + elapsed.toFixed(1) + ' s; forehead height ' +
        (c ? r3(c.up) + ' m above the head bone' : 'not measured'));
  ProcessAndSaveCollectedData();
  dc_send({ visible: false });
  SetText('確認できました。\nありがとうございます。');
  ToNextState();
}
function dc_end() { dc_send({ visible: false }); HideChild('Text'); $.state.dc_active = false; }