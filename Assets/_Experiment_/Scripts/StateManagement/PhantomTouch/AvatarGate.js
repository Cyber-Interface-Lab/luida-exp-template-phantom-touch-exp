const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            ag_showButtons(false, false); HideChild('Text');
        } }
    ],
    2: [
        { type: "sleep", value: 0.5 },
        { type: "exec", action: (deltaTime) => {
            ag_begin();
        } }
    ]
};

const duringStateActions = {
    2: [
        { type: "exec", action: (deltaTime) => {
            ag_update(deltaTime);
        } }
    ]
};

const stateExitActions = {
    2: [
        { type: "exec", action: (deltaTime) => {
            ag_end();
        } }
    ]
};


// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: AvatarGate (avatar switch instruction + automatic check + two-step confirmation) ----
// Bone-length signature of the LUIDA transparent avatar (transparent-avatar.vrm). Update after test T2.
const AG_T_ARM = 0.485;      // upper arm + forearm (m)
const AG_T_SHOULDER = 0.332; // distance between the two upper-arm joints (m)
const AG_TOL = 0.015;
const AG_STABLE_MS = 1000;

function ag_send(id, cfg) {
  try { const h = $.worldItemReference(id); if (h) h.send('btn_cfg', cfg); } catch (e) { $.log('[AvatarGate] send ' + id + ': ' + e); }
}
function ag_showButtons(changed, yesNo) {
  ag_send('AG_Changed', { visible: changed, label: '着替えました' });
  ag_send('AG_Yes', { visible: yesNo, label: 'はい' });
  ag_send('AG_No', { visible: yesNo, label: 'いいえ' });
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
function ag_isTransparent(s) {
  return !!s && Math.abs(s.armLen - AG_T_ARM) < AG_TOL && Math.abs(s.shoulder - AG_T_SHOULDER) < AG_TOL;
}
function ag_targetMatches(sig) {
  if (!sig) return false;
  const transparent = ag_isTransparent(sig);
  return $.state.ag_avatar === 'assigned' ? transparent : !transparent;
}
function ag_begin() {
  $.state.ag_active = false;
  if (!CONDITION || CONDITION['rep'] !== '1') {
    // second trial of a block: no avatar change, skip the setup immediately
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
  ShowChild('Text');
  ag_showButtons(false, false);
  ag_renderText('');
  $.log('[AvatarGate] block ' + CONDITION['block'] + ' -> ' + $.state.ag_avatar);
}
function ag_renderText(note) {
  const daily = $.state.ag_avatar === 'daily';
  let t;
  if ($.state.ag_step === 1) {
    t = daily
      ? 'メニューを開き、普段いちばんよく使うアバターに着替えてください。\n着替え終わったら「着替えました」を押してください。'
      : 'メニューを開き、この実験で最初に着ていた透明アバターに着替えてください。\n着替え終わったら「着替えました」を押してください。';
  } else {
    t = daily
      ? 'いま着ているアバターは、あなたが普段最もよく使うアバターですか？'
      : 'いま着ているのは透明アバター（自分の体が見えない状態）ですか？';
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
  const ok = match && (Date.now() - ($.state.ag_matchSince || 0)) >= AG_STABLE_MS;
  if (ok !== $.state.ag_okShown) {
    $.state.ag_okShown = ok;
    if ($.state.ag_step === 1) {
      ag_showButtons(ok, false);
      ag_renderText(ok ? '' : ($.state.ag_avatar === 'assigned' ? '（まだ透明アバターになっていません）' : '（まだ透明アバターのままです）'));
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
      ag_renderText('（アバターが目標と一致していません。もう一度着替えてください）');
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
  SendDataToCollector('avatarIsTransparent', ag_isTransparent(sig));
  SendDataToCollector('setupSec', (Date.now() - ($.state.ag_startTs || Date.now())) / 1000);
  SendDataToCollector('setupRetry', $.state.ag_retry || 0);
  ProcessAndSaveCollectedData();
  ag_showButtons(false, false);
  SetText('ありがとうございます。まもなく始まります。');
  ToNextState();
}
function ag_end() {
  ag_showButtons(false, false);
  HideChild('Text');
  $.state.ag_active = false;
}