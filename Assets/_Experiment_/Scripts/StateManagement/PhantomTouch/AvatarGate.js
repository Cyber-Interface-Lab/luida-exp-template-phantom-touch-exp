const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            ag_showButtons(false, false); HideChild('Text'); ag_photos(false);
        } }
    ],
    1: [
        { type: "sleep", value: 0.5 },
        { type: "exec", action: (deltaTime) => {
            ag_begin();
        } }
    ]
};

const duringStateActions = {
    1: [
        { type: "exec", action: (deltaTime) => {
            ag_update(deltaTime);
        } }
    ]
};

const stateExitActions = {
    1: [
        { type: "exec", action: (deltaTime) => {
            ag_end();
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
// ---- Study 4: AvatarGate (avatar switch instruction + automatic check + two-step confirmation) ----
// Bone-length signature of the LUIDA "Default Avatar" (participantAvatarMode = DEFAULT; luida_default_avatar).
// Not measured yet: while AG_D_ARM / AG_D_SHOULDER are 0 the automatic check is off and the gate relies on
// the participant's two-step self-report (recorded as avatarCheckFallback = true). To calibrate, wear the
// Default Avatar in Cluster, read the "[AvatarGate] signature" log line and put its values here.
const AG_D_ARM = 0;          // upper arm + forearm (m)
const AG_D_SHOULDER = 0;     // distance between the two upper-arm joints (m)
const AG_TOL = 0.015;
const AG_STABLE_MS = 1000;
// If the automatic check has not matched after this many seconds, show the button anyway and rely on
// the participant's two-step self-report (recorded as avatarCheckFallback). 0 disables the fallback.
const AG_FALLBACK_SEC = 30;
const AG_LOG_SEC = 5;          // log the measured bone-length signature this often (calibration aid)

function ag_send(id, cfg) {
  try { const h = $.worldItemReference(id); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[AvatarGate] send ' + id + ': ' + e); }
}
function ag_showButtons(changed, yesNo) {
  ag_send('AG_Changed', { visible: changed, label: '着替えました' });
  ag_send('AG_Yes', { visible: yesNo, label: 'はい' });
  ag_send('AG_No', { visible: yesNo, label: 'いいえ' });
}
// Photo 1: open the menu and tap 'Avatar'. Photo 2 picks 'LUIDA Default Avatar', so it is shown only when that is
// the avatar to wear (in the daily-avatar block it could lead to the wrong choice).
function ag_photos(show) {
  if (show) ShowChild('MenuPhoto1'); else HideChild('MenuPhoto1');
  if (show && $.state.ag_avatar === 'assigned') ShowChild('MenuPhoto2'); else HideChild('MenuPhoto2');
}
function ag_signature(p) {
  const ua = p.getHumanoidBonePosition(HumanoidBone.LeftUpperArm);
  const la = p.getHumanoidBonePosition(HumanoidBone.LeftLowerArm);
  const h = p.getHumanoidBonePosition(HumanoidBone.LeftHand);
  const rua = p.getHumanoidBonePosition(HumanoidBone.RightUpperArm);
  const head = p.getHumanoidBonePosition(HumanoidBone.Head);
  const hips = p.getHumanoidBonePosition(HumanoidBone.Hips);
  const root = p.getPosition();
  if (!ua || !la || !h || !rua || !head || !root) return null;
  return {
    armLen: ua.clone().sub(la).length() + la.clone().sub(h).length(),
    shoulder: ua.clone().sub(rua).length(),
    headH: head.y - root.y,
    hipsH: hips ? hips.y - root.y : -1,
  };
}
function ag_calibrated() { return AG_D_ARM > 0 && AG_D_SHOULDER > 0; }
function ag_isDefault(s) {
  return ag_calibrated() && !!s && Math.abs(s.armLen - AG_D_ARM) < AG_TOL && Math.abs(s.shoulder - AG_D_SHOULDER) < AG_TOL;
}
function ag_targetMatches(sig) {
  if (!sig || !ag_calibrated()) return false;
  const isDefault = ag_isDefault(sig);
  return $.state.ag_avatar === 'assigned' ? isDefault : !isDefault;
}
function ag_begin() {
  $.state.ag_active = false;
  if (!firstTrialOfBlock()) {
    // later trial of a block: no avatar change, skip the setup immediately
    HideChild('Text');
    ag_showButtons(false, false);
    ToNextState();
    return;
  }
  const dailyFirst = CONDITION['order'] === 'daily_first';
  $.state.ag_avatar = (dailyFirst === (CONDITION['block'] === '1')) ? 'daily' : 'assigned';
  $.state.ag_step = 1;
  $.state.ag_active = true;
  $.state.ag_startTs = Date.now();
  $.state.ag_retry = 0;
  $.state.ag_lastMatch = null;
  $.state.ag_matchSince = Date.now();
  $.state.ag_okShown = null;
  $.state.ag_fallback = !ag_calibrated();   // not calibrated: self-report only
  $.state.ag_logAt = 0;
  ShowChild('Text');
  ag_photos(true);   // photos of how to switch the avatar, next to the panel
  ag_showButtons(false, false);
  ag_renderText('');
  $.log('[AvatarGate] block ' + CONDITION['block'] + ' -> ' + $.state.ag_avatar);
}
function ag_renderText(note) {
  const daily = $.state.ag_avatar === 'daily';
  let t;
  if ($.state.ag_step === 1) {
    t = daily
      ? 'メニューから、普段いちばんよく使うアバターに\n着替えてください。\n左の鏡に着替えたアバターが映るまで待ってから、\n「着替えました」を押してください。'
      : 'メニューのアバター変更に表示される\n「LUIDA Default Avatar」に着替えてください。\n左の鏡に着替えたアバターが映るまで待ってから、\n「着替えました」を押してください。';
  } else {
    t = daily
      ? 'いま着ているアバターは、\nあなたが普段いちばんよく使うアバターですか？'
      : 'いま着ているのは\n「LUIDA Default Avatar」ですか？';
  }
  if (note) t += '\n' + note;
  SetText(t);
}
function ag_update(dt) {
  if (!$.state.ag_active) return;
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return;
  const sig = ag_signature(p);
  const match = ag_targetMatches(sig);
  if (match !== $.state.ag_lastMatch) { $.state.ag_lastMatch = match; $.state.ag_matchSince = Date.now(); }
  const elapsed = (Date.now() - ($.state.ag_startTs || Date.now())) / 1000;
  if (sig && elapsed >= ($.state.ag_logAt || 0)) {
    $.state.ag_logAt = elapsed + AG_LOG_SEC;
    $.log('[AvatarGate] signature armLen=' + sig.armLen.toFixed(3) + ' shoulder=' + sig.shoulder.toFixed(3) +
          ' headH=' + sig.headH.toFixed(3) + ' calibrated=' + ag_calibrated() + ' default=' + ag_isDefault(sig) + ' target=' + $.state.ag_avatar);
  }
  if (!$.state.ag_fallback && AG_FALLBACK_SEC > 0 && elapsed >= AG_FALLBACK_SEC && !match) {
    $.state.ag_fallback = true;
    $.log('[AvatarGate] automatic check did not match within ' + AG_FALLBACK_SEC + ' s; falling back to self-report');
    $.state.ag_okShown = null;   // force a redraw below
  }
  const ok = $.state.ag_fallback || (match && (Date.now() - ($.state.ag_matchSince || 0)) >= AG_STABLE_MS);
  if (ok !== $.state.ag_okShown) {
    $.state.ag_okShown = ok;
    if ($.state.ag_step === 1) {
      ag_showButtons(ok, false);
      ag_renderText(ok ? '' : ($.state.ag_avatar === 'assigned' ? '（まだ「LUIDA Default Avatar」に\nなっていません）' : '（まだ「LUIDA Default Avatar」の\nままです）'));
    }
  }
  const b = $.getStateCompat('this', 'gate_btn', 'integer');
  if (!(b > 0)) return;
  $.setStateCompat('this', 'gate_btn', 0);
  if (b === 1 && $.state.ag_step === 1 && ok) {
    $.state.ag_step = 2;
    ag_showButtons(false, true);
    ag_renderText('');
  } else if (b === 2 && $.state.ag_step === 2) {
    if (!ok) {
      $.state.ag_step = 1;
      $.state.ag_okShown = null;
      ag_showButtons(false, false);
      ag_renderText('（アバターが一致していません。\nもう一度着替えてください）');
      return;
    }
    ag_confirm(sig);
  } else if (b === 3 && $.state.ag_step === 2) {
    $.state.ag_retry = ($.state.ag_retry || 0) + 1;
    $.state.ag_step = 1;
    $.state.ag_okShown = null;
    ag_showButtons(false, false);
    ag_renderText('');
  }
}
function ag_confirm(sig) {
  $.state.ag_active = false;
  SendDataToCollector('avatar', $.state.ag_avatar);
  SendDataToCollector('avatarArmLen', sig ? sig.armLen : -1);
  SendDataToCollector('avatarShoulder', sig ? sig.shoulder : -1);
  SendDataToCollector('avatarHeadH', sig ? sig.headH : -1);
  SendDataToCollector('avatarHipsH', sig ? sig.hipsH : -1);
  SendDataToCollector('avatarIsDefault', ag_calibrated() ? ag_isDefault(sig) : null);
  SendDataToCollector('setupSec', (Date.now() - ($.state.ag_startTs || Date.now())) / 1000);
  SendDataToCollector('setupRetry', $.state.ag_retry || 0);
  SendDataToCollector('avatarCheckFallback', !!$.state.ag_fallback);
  ProcessAndSaveCollectedData();
  ag_showButtons(false, false);
  ag_photos(false);
  SetText('ありがとうございます。');
  ToNextState();
}
function ag_end() {
  ag_showButtons(false, false);
  HideChild('Text');
  ag_photos(false);
  $.state.ag_active = false;
}