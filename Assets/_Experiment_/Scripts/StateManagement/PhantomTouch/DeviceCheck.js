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
// ---- Study 4: DeviceCheck (head yaw, arms out to the sides, arms forward) ----
// Runs in the pose-check state (after the avatar switch, before the NPC appears) on the 1st trial of each block,
// with the MirrorPanel's front mirror shown; the later trials of a block skip it immediately.
// Three things, the arm poses in this order (the head may turn any time): 1) turn the head left and right; 2) hold both
// arms straight out to the sides for DC_HOLD_SEC: the hands' mean height is the shoulder height; 3) hold both arms
// straight forward for DC_HOLD_SEC: each hand's distance from the shoulder is the arm length. The NPC is told both
// ('npc_body_cal') and aims at shoulder + arm / 2 in this block. Every limit is a fraction of the avatar's height (head
// bone above the feet, H), so very small and very large avatars are judged alike. A hold breaks when a hand leaves
// the pose or moves DC_STILL * H from where it was when the hold began; it then starts again from there.
const DC_YAW_DEG = 25, DC_RESCUE_SEC = 60, DC_HOLD_SEC = 3.0;
const DC_STILL = 0.035;                  // ~5 cm for a 1.45 m head height
// arms out to the sides: each hand at least DC_SIDE_OUT * H out to its side, at most DC_SIDE_FWD * H forward or back,
// between DC_SIDE_DOWN * H below and DC_SIDE_UP * H above the head bone, both within DC_LEVEL * H of each other's height
const DC_SIDE_OUT = 0.25, DC_SIDE_FWD = 0.2, DC_SIDE_DOWN = 0.35, DC_SIDE_UP = 0.05, DC_LEVEL = 0.1;
// arms forward: each hand at least DC_FWD_OUT * H in front of the head bone, at most DC_FWD_SIDE * H to the side, within
// DC_FWD_LEVEL * H of the shoulder height measured with the arms out
const DC_FWD_OUT = 0.2, DC_FWD_SIDE = 0.2, DC_FWD_LEVEL = 0.12;
const DC_FORCE_LABEL = '確認できない場合は\nこちらを押してください';
function dc_send(cfg) { try { const h = $.worldItemReference('DC_Force'); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[DeviceCheck] send: ' + e); } }
function dc_begin() {
  $.state.dc_active = false;
  if (!firstTrialOfBlock()) { ToNextState(); return; }
  $.state.dc_active = true;
  $.state.dc_start = Date.now();
  $.state.dc_left = false; $.state.dc_right = false;
  $.state.dc_hold = 0; $.state.dc_anchorL = null; $.state.dc_anchorR = null; $.state.dc_sum = null;
  $.state.dc_shoulderUp = null;    // relative to the head bone, once the arms-out hold is done
  $.state.dc_arm = null;           // { len, left, right } once the arms-forward hold is done
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
    (($.state.dc_shoulderUp !== null && $.state.dc_shoulderUp !== undefined) ? '[済] ' : '[　] ') + '両腕を横に（3秒）\n' +
    ($.state.dc_arm ? '[済] ' : '[　] ') + '両腕を前に（3秒）';
  if (t !== $.state.dc_lastText) { $.state.dc_lastText = t; SetText(t); }
}
// One hold step: ok = both hands in the pose this frame. Returns the accumulated sums once DC_HOLD_SEC is reached.
function dc_hold(ok, lh, rh, H, dt, add) {
  if (!ok) { $.state.dc_hold = 0; $.state.dc_anchorL = null; return null; }
  const near = (h, a) => a && h.clone().sub(a).length() <= DC_STILL * H;
  if (!near(lh, $.state.dc_anchorL) || !near(rh, $.state.dc_anchorR)) {
    $.state.dc_anchorL = lh; $.state.dc_anchorR = rh; $.state.dc_hold = 0; $.state.dc_sum = { a: 0, b: 0, w: 0 };
  }
  const s = $.state.dc_sum, v = add();
  s.a += v[0] * dt; s.b += v[1] * dt; s.w += dt;
  $.state.dc_sum = s;
  $.state.dc_hold = ($.state.dc_hold || 0) + dt;
  if ($.state.dc_hold < DC_HOLD_SEC || s.w <= 0) return null;
  $.state.dc_hold = 0; $.state.dc_anchorL = null;
  return { a: s.a / s.w, b: s.b / s.w };
}
function dc_arms(p, dt) {
  const head = p.getHumanoidBonePosition(HumanoidBone.Head), root = p.getPosition();
  const lh = p.getHumanoidBonePosition(HumanoidBone.LeftHand), rh = p.getHumanoidBonePosition(HumanoidBone.RightHand);
  if (!head || !root || !lh || !rh) return;
  const H = head.y - root.y;
  if (!(H > 0.05)) return;
  // the body's facing (not the head's: it turns in step 1)
  const rot = p.getRotation();
  const fwd = new Vector3(0, 0, 1).applyQuaternion(rot); fwd.y = 0; fwd.normalize();
  const right = new Vector3(fwd.z, 0, -fwd.x);
  const rel = (h) => { const d = h.clone().sub(head); return { side: d.x * right.x + d.z * right.z, fwd: d.x * fwd.x + d.z * fwd.z, up: d.y }; };
  const L = rel(lh), R = rel(rh);
  if ($.state.dc_shoulderUp === null || $.state.dc_shoulderUp === undefined) {
    const inBand = (q) => q.up > -DC_SIDE_DOWN * H && q.up < DC_SIDE_UP * H && Math.abs(q.fwd) < DC_SIDE_FWD * H;
    const ok = L.side < -DC_SIDE_OUT * H && R.side > DC_SIDE_OUT * H && inBand(L) && inBand(R) && Math.abs(L.up - R.up) < DC_LEVEL * H;
    const m = dc_hold(ok, lh, rh, H, dt, () => [L.up, R.up]);
    if (m) {
      $.state.dc_shoulderUp = (m.a + m.b) / 2;
      $.log('[DeviceCheck] arms out: shoulder ' + $.state.dc_shoulderUp.toFixed(3) + ' m from the head bone (left hand ' + m.a.toFixed(3) + ', right ' + m.b.toFixed(3) + ')');
    }
    return;
  }
  if ($.state.dc_arm) return;
  const s = $.state.dc_shoulderUp;
  const inFront = (q) => q.fwd > DC_FWD_OUT * H && Math.abs(q.side) < DC_FWD_SIDE * H && Math.abs(q.up - s) < DC_FWD_LEVEL * H;
  // the shoulder joints are taken at the head bone's depth, the hands straight in front of them
  const len = (q) => Math.sqrt(q.fwd * q.fwd + (q.up - s) * (q.up - s));
  const m = dc_hold(inFront(L) && inFront(R), lh, rh, H, dt, () => [len(L), len(R)]);
  if (m) {
    $.state.dc_arm = { len: (m.a + m.b) / 2, left: m.a, right: m.b };
    $.log('[DeviceCheck] arms forward: arm ' + $.state.dc_arm.len.toFixed(3) + ' m (left ' + m.a.toFixed(3) + ', right ' + m.b.toFixed(3) + ')');
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
  dc_arms(p, dt);
  const elapsed = (Date.now() - ($.state.dc_start || Date.now())) / 1000;
  if (elapsed > DC_RESCUE_SEC && !$.state.dc_rescue) { $.state.dc_rescue = true; dc_send({ visible: true }); }
  let forced = false;
  const b = $.getStateCompat('this', 'dc_btn', 'integer');
  if (b > 0) { $.setStateCompat('this', 'dc_btn', 0); if ($.state.dc_rescue) forced = true; }
  const passed = $.state.dc_left && $.state.dc_right && !!$.state.dc_arm;
  if (passed || forced) { dc_finish(elapsed, forced); return; }
  dc_render();
}
// The shoulder height and arm length go to the NPC when both arm holds were completed; otherwise (rescue button) the
// NPC reads them from the avatar's bones.
function dc_finish(elapsed, forced) {
  $.state.dc_active = false;
  const s = $.state.dc_shoulderUp, a = $.state.dc_arm;
  const both = typeof s === 'number' && !!a;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  SendDataToCollector('deviceCheckSec', elapsed);
  SendDataToCollector('deviceCheckForced', !!forced);
  SendDataToCollector('poseShoulderUp', typeof s === 'number' ? r3(s) : '');
  SendDataToCollector('poseArmLen', a ? r3(a.len) : '');
  SendDataToCollector('poseArmLeft', a ? r3(a.left) : '');
  SendDataToCollector('poseArmRight', a ? r3(a.right) : '');
  if (both) {
    try { $.worldItemReference('NPC').send('npc_body_cal', { shoulderUp: s, arm: a.len }); }
    catch (e) { $.log('[DeviceCheck] npc_body_cal: ' + e); }
  }
  $.log('[DeviceCheck] pose check ' + (forced ? 'forced' : 'passed') + ' after ' + elapsed.toFixed(1) + ' s; ' +
        (both ? 'shoulder ' + r3(s) + ' m from the head bone, arm ' + r3(a.len) + ' m' : 'body not measured'));
  ProcessAndSaveCollectedData();
  dc_send({ visible: false });
  SetText('確認できました。\nありがとうございます。');
  ToNextState();
}
function dc_end() { dc_send({ visible: false }); HideChild('Text'); $.state.dc_active = false; }