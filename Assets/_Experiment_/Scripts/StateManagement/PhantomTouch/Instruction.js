const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            ins_okBegin();
        } },
        { type: "exec", action: (deltaTime) => {
            ins_show('center', 'ようこそ。\nこの実験では、正面に現れる相手に挨拶をしたあと、\n相手の手があなたの顔にゆっくり近づく様子を、\n正面の鏡で見ていただきます。そのたびに、\n感じたことを短い質問にお答えください。\n途中で、アバターの着替えと機器の確認をお願いします。\n読み終わったら、下の「OK」を押してください。');
        } }
    ],
    1: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', 'ブロック ' + CONDITION['block'] + ' / 2');
        } }
    ],
    2: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') ins_show('front', '鏡を見ながら、次の動きをしてください。\n1) 頭をゆっくり左右に向ける\n2) 両手を頭より高く上げる');
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') ins_show('front', '30秒間、目の前のアバターを見ながら\n挨拶してください。\n（例：手を振る、少し横に動く）');
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            ins_show('touch', '後ろの相手の手がゆっくり顔に近づきます。\n顔を正面に向けたまま、楽な姿勢で\n鏡を見ていてください。');
        } }
    ],
    5: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', '下のパネルで質問に答えてください。');
        } }
    ],
    6: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '2') ins_show('above', 'あなたがいま使っているアバター（問題文では\n「仮想身体」と表現されていることがあります）\nについて伺います。');
        } }
    ],
    7: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', '少し休憩します…');
        } }
    ],
    8: [
        { type: "exec", action: (deltaTime) => {
            ins_show('above', 'あなたの顔に触れてきた相手についてのアンケートです。');
        } }
    ],
    9: [
        { type: "exec", action: (deltaTime) => {
            ins_show('above', '最後のアンケートです。');
        } }
    ],
    10: [
        { type: "exec", action: (deltaTime) => {
            ins_okBegin();
        } },
        { type: "exec", action: (deltaTime) => {
            ins_show('center', 'ご参加いただき、ありがとうございました。\nこの実験では、「ファントムセンス（VR感覚・V感）」のうち、\n誰かに触れられたと感じる「ファントムタッチ錯覚」が、\n相手の反応や自分のアバターに影響されるかを調べていました。\nファントムタッチ錯覚とは、VR で相手のアバターの手が顔に\n近づいたり触れたりしたときに、実際には触れられていないのに、\n顔に感覚が生じる現象です。\n具体的には、相手が目を合わせたり手を振ったりするかどうかと、\n普段使いのアバターかどうかで、\n感じ方がどう変わるかを比べました。\n【お願い】 今月中は、この実験の内容や条件について、\nほかの方に話さないようお願いします。\n読み終わったら、下の「OK」を押してください。', 0.022);
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            ins_endBegin();
        } }
    ]
};

const duringStateActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            if (ins_okPressed()) { ins_okButton(false); ToNextState(); }
        } }
    ],
    10: [
        { type: "exec", action: (deltaTime) => {
            if (ins_okPressed()) { ins_okButton(false); ToNextState(); }
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            ins_endTick();
        } }
    ]
};

const stateExitActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            ins_okButton(false);
        } }
    ],
    10: [
        { type: "exec", action: (deltaTime) => {
            ins_okButton(false);
        } }
    ]
};


// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: Instruction board (placements; backing quad scaled to the text) ----
// slots: front = above the NPC's head, above = just above the questionnaire form, center = straight ahead,
//        touch = just above the near mirror shown during the touch
const INS_SLOTS = {
  front: { p: new Vector3(0, 2.1867, 1.5), r: new Quaternion(-0.1994, 0, 0, 0.9799), size: 0.024 },
  above: { p: new Vector3(0, 2.55, 1.7), r: new Quaternion(-0.2627, 0, 0, 0.9649), size: 0.03 },
  center: { p: new Vector3(0, 1.65, 1.5), r: new Quaternion(-0.0333, 0, 0, 0.9994), size: 0.024 },
  touch: { p: new Vector3(0, 2.0688, 0.97), r: new Quaternion(-0.2431, 0, 0, 0.97), size: 0.0155 },
};
// CCK TextView metrics (Noto Sans CJK): full-width glyph ~1.85 x size wide, ASCII ~0.56 of that, line ~2.74 x size
const INS_GLYPH_W = 1.85, INS_LINE_H = 2.74, INS_PAD = 0.05;
function ins_show(slot, text, size) {
  const s = INS_SLOTS[slot] || INS_SLOTS.front;
  const sz = size || s.size;
  const t = $.subNode('Text');
  if (t) {
    t.setPosition(s.p); t.setRotation(s.r);
    try { t.setTextSize(sz); } catch (e) { $.log('[Instruction] setTextSize: ' + e); }
  }
  SetText(text);
  const lines = text ? String(text).split('\n') : [];
  let w = 0;
  for (const ln of lines) { let lw = 0; for (let i = 0; i < ln.length; i++) lw += ln.charCodeAt(i) < 0x80 ? 0.56 : 1; if (lw > w) w = lw; }
  const bg = $.subNode('Bg');
  if (!bg) return;
  if (lines.length === 0 || w === 0) { bg.setEnabled(false); return; }
  try {
    bg.getUnityComponent('Transform').unityProp.localScale = new Vector3(w * INS_GLYPH_W * sz + INS_PAD * 2, lines.length * INS_LINE_H * sz + INS_PAD, 1);
    bg.setEnabled(true);
  } catch (e) { $.log('[Instruction] backing: ' + e); }
}
// Debrief 'OK' button (item DB_Ok; its Interact Item Trigger writes the Integer state 'ins_btn' here)
function ins_okButton(visible) {
  try { const h = $.worldItemReference('DB_Ok'); if (h) h.send('btn_cfg', { visible: visible, label: 'OK' }); }
  catch (e) { $.log('[Instruction] send DB_Ok: ' + e); }
}
function ins_okBegin() { $.setStateCompat('this', 'ins_btn', 0); ins_okButton(true); }
function ins_okPressed() {
  const b = $.getStateCompat('this', 'ins_btn', 'integer');
  if (!(b > 0)) return false;
  $.setStateCompat('this', 'ins_btn', 0);
  return true;
}
// End: countdown to the exit gate (ExitPortal uses the same delay). After the participant has left, the next
// person who joins the same space sees a waiting text; the LUIDA ParticipantManager asks them, in front of
// them, whether they are a new participant and brings the world back to Start when they confirm.
const INS_END_SEC = 10;
function ins_endBegin() { $.state.ins_endTs = Date.now(); $.state.ins_endText = null; ins_endTick(); }
function ins_endText() {
  const p = PARTICIPANTS[1];
  if (!p || !p.exists()) return 'しばらくお待ちください…';
  const left = Math.max(0, Math.ceil(INS_END_SEC - (Date.now() - ($.state.ins_endTs || Date.now())) / 1000));
  return left > 0
    ? 'ご参加ありがとうございました。\nあと ' + left + ' 秒で募集ワールドへ移動します。'
    : 'ご参加ありがとうございました。\n募集ワールドへ移動します。';
}
function ins_endTick() {
  const text = ins_endText();
  if (text === $.state.ins_endText) return;
  $.state.ins_endText = text;
  ins_show('center', text);
}