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
// ---- Study 4: DeviceCheck (head yaw, arms out; then hands on the head) ----
// Runs in the pose-check state (after the avatar switch, before the NPC appears) on the 1st trial of each block,
// with the MirrorPanel's front mirror shown; the later trials of a block skip it immediately.
// Tracking check, with the mirror: 1) turn the head left and right; 2) hold both arms straight out to the sides for
// DC_HOLD_SEC (any order; not measured). Then the front mirror goes away ('mp_mirror' to the MirrorPanel) and the
// instruction straight ahead ('ins_text' to the Instruction item) asks for 3) both hands on the head for DC_HOLD_SEC:
// their mean height above the head bone goes to the NPC ('npc_hands_cal'), which aims a little below it in this block.
// Every limit is a fraction of the avatar's height (head bone above the feet, H), so very small and very large avatars
// are judged alike. A hold breaks when a hand leaves the pose or moves DC_STILL * H from where it was when the hold
// began; it then starts again from there. The rescue button (after DC_RESCUE_SEC) ends the check in any step.
const DC_YAW_DEG = 25, DC_RESCUE_SEC = 60, DC_HOLD_SEC = 3.0;
const DC_STILL = 0.035;                  // ~5 cm for a 1.45 m head height
// arms out to the sides: each hand at least DC_SIDE_OUT * H out to its side, at most DC_SIDE_FWD * H forward or back,
// between DC_SIDE_DOWN * H below and DC_SIDE_UP * H above the head bone, both within DC_LEVEL * H of each other's height
const DC_SIDE_OUT = 0.25, DC_SIDE_FWD = 0.2, DC_SIDE_DOWN = 0.35, DC_SIDE_UP = 0.05, DC_LEVEL = 0.1;
// hands on the head: each hand between DC_HEAD_MIN * H and DC_HEAD_MAX * H above the head bone (above the eyes, below
// arms raised straight up), within DC_HEAD_SIDE * H to the side and DC_HEAD_FWD * H forward or back of it
const DC_HEAD_MIN = 0.05, DC_HEAD_MAX = 0.25, DC_HEAD_SIDE = 0.2, DC_HEAD_FWD = 0.15;
const DC_HEAD_TEXT = '両手を自分の頭の上に、\n3秒置いてください';
const DC_HEAD_TEXT_SIZE = 0.045;         // straight ahead at 1.5 m (the Start panel's text: 0.024)
const DC_FORCE_LABEL = '確認できない場合は\nこちらを押してください';
function dc_ref(id, type, arg) { try { const h = $.worldItemReference(id); if (h) h.send(type, arg); } catch (e) { $.log('[DeviceCheck] send ' + id + ': ' + e); } }
function dc_send(cfg) { dc_ref('DC_Force', 'btn_cfg', cfg); }
function dc_begin() {
  $.state.dc_active = false;
  if (!firstTrialOfBlock()) { ToNextState(); return; }
  $.state.dc_active = true;
  $.state.dc_phase = 'pose';
  $.state.dc_start = Date.now();
  $.state.dc_left = false; $.state.dc_right = false; $.state.dc_out = false;
  $.state.dc_hold = 0; $.state.dc_anchorL = null; $.state.dc_anchorR = null; $.state.dc_sum = null;
  $.state.dc_cal = null;           // { up, left, right } once the hands-on-the-head hold is done
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
    ($.state.dc_out ? '[済] ' : '[　] ') + '両腕を真横に（3秒）\n' +
    ($.state.dc_cal ? '[済] ' : '[　] ') + '両手を頭の上に（3秒）';
  if (t !== $.state.dc_lastText) { $.state.dc_lastText = t; SetText(t); }
}
// One hold step: ok = both hands in the pose this frame. Returns the means of add()'s two values once DC_HOLD_SEC is reached.
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
// The hands relative to the head bone, along the body's facing (not the head's: it turns in step 1), and H.
function dc_hands(p) {
  const head = p.getHumanoidBonePosition(HumanoidBone.Head), root = p.getPosition();
  const lh = p.getHumanoidBonePosition(HumanoidBone.LeftHand), rh = p.getHumanoidBonePosition(HumanoidBone.RightHand);
  if (!head || !root || !lh || !rh) return null;
  const H = head.y - root.y;
  if (!(H > 0.05)) return null;
  const fwd = new Vector3(0, 0, 1).applyQuaternion(p.getRotation()); fwd.y = 0; fwd.normalize();
  const right = new Vector3(fwd.z, 0, -fwd.x);
  const rel = (h) => { const d = h.clone().sub(head); return { side: d.x * right.x + d.z * right.z, fwd: d.x * fwd.x + d.z * fwd.z, up: d.y }; };
  return { lh: lh, rh: rh, H: H, L: rel(lh), R: rel(rh) };
}
function dc_armsOut(p, dt) {
  const h = dc_hands(p);
  if (!h || $.state.dc_out) return;
  const H = h.H, L = h.L, R = h.R;
  const inBand = (q) => q.up > -DC_SIDE_DOWN * H && q.up < DC_SIDE_UP * H && Math.abs(q.fwd) < DC_SIDE_FWD * H;
  const ok = L.side < -DC_SIDE_OUT * H && R.side > DC_SIDE_OUT * H && inBand(L) && inBand(R) && Math.abs(L.up - R.up) < DC_LEVEL * H;
  if (dc_hold(ok, h.lh, h.rh, H, dt, () => [L.up, R.up])) { $.state.dc_out = true; $.log('[DeviceCheck] arms out held'); }
}
function dc_handsOnHead(p, dt) {
  const h = dc_hands(p);
  if (!h || $.state.dc_cal) return;
  const H = h.H, L = h.L, R = h.R;
  const on = (q) => q.up > DC_HEAD_MIN * H && q.up < DC_HEAD_MAX * H && Math.abs(q.side) < DC_HEAD_SIDE * H && Math.abs(q.fwd) < DC_HEAD_FWD * H;
  const m = dc_hold(on(L) && on(R), h.lh, h.rh, H, dt, () => [L.up, R.up]);
  if (m) {
    $.state.dc_cal = { up: (m.a + m.b) / 2, left: m.a, right: m.b };
    $.log('[DeviceCheck] hands on the head: ' + $.state.dc_cal.up.toFixed(3) + ' m above the head bone (left ' + m.a.toFixed(3) + ', right ' + m.b.toFixed(3) + ')');
  }
}
// Tracking check done: the front mirror goes, the hands-on-the-head instruction comes straight ahead.
function dc_headBegin() {
  $.state.dc_phase = 'head';
  $.state.dc_hold = 0; $.state.dc_anchorL = null;
  dc_ref('MirrorPanel', 'mp_mirror', { name: 'MirrorFront', visible: false });
  dc_ref('Instruction', 'ins_text', { slot: 'center', text: DC_HEAD_TEXT, size: DC_HEAD_TEXT_SIZE });
  $.log('[DeviceCheck] tracking check done; hands on the head next');
}
function dc_update(dt) {
  if (!$.state.dc_active) return;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  if ($.state.dc_phase === 'pose') {
    const yaw = dc_yaw(p);
    if (yaw !== null) {
      if ($.state.dc_yaw0 === null || $.state.dc_yaw0 === undefined) $.state.dc_yaw0 = yaw;
      const d = dc_angleDiff(yaw, $.state.dc_yaw0);
      if (d <= -DC_YAW_DEG) $.state.dc_left = true;
      if (d >= DC_YAW_DEG) $.state.dc_right = true;
    }
    dc_armsOut(p, dt);
    if ($.state.dc_left && $.state.dc_right && $.state.dc_out) dc_headBegin();
  } else dc_handsOnHead(p, dt);
  const elapsed = (Date.now() - ($.state.dc_start || Date.now())) / 1000;
  if (elapsed > DC_RESCUE_SEC && !$.state.dc_rescue) { $.state.dc_rescue = true; dc_send({ visible: true }); }
  let forced = false;
  const b = $.getStateCompat('this', 'dc_btn', 'integer');
  if (b > 0) { $.setStateCompat('this', 'dc_btn', 0); if ($.state.dc_rescue) forced = true; }
  if ($.state.dc_cal || forced) { dc_finish(elapsed, forced); return; }
  dc_render();
}
// The hands' height goes to the NPC when the hold was completed; otherwise (rescue button) the NPC uses the eye bones.
function dc_finish(elapsed, forced) {
  $.state.dc_active = false;
  const c = $.state.dc_cal;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  SendDataToCollector('deviceCheckSec', elapsed);
  SendDataToCollector('deviceCheckForced', !!forced);
  SendDataToCollector('poseHandsUp', c ? r3(c.up) : '');
  SendDataToCollector('poseHandsLeftUp', c ? r3(c.left) : '');
  SendDataToCollector('poseHandsRightUp', c ? r3(c.right) : '');
  if (c) dc_ref('NPC', 'npc_hands_cal', { up: c.up });
  if ($.state.dc_phase === 'head') dc_ref('Instruction', 'ins_text', { slot: 'center', text: '' });
  $.log('[DeviceCheck] pose check ' + (forced ? 'forced' : 'passed') + ' after ' + elapsed.toFixed(1) + ' s; ' +
        (c ? 'hands on the head ' + r3(c.up) + ' m above the head bone' : 'hands not measured'));
  ProcessAndSaveCollectedData();
  dc_send({ visible: false });
  SetText('確認できました。\nありがとうございます。');
  ToNextState();
}
function dc_end() { dc_send({ visible: false }); HideChild('Text'); $.state.dc_active = false; }