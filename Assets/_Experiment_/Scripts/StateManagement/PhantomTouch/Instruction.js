const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            ins_show('side', 'ようこそ。\n正面の質問紙で研究の説明を\n読み、各項目にチェックを\n入れて進んでください。');
        } }
    ],
    1: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', 'トラッキングを確認します。\n1) 頭をゆっくり左右に向ける\n2) 両手を頭より高く上げる');
        } }
    ],
    2: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', 'ブロック ' + CONDITION['block'] + ' / 2');
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') ins_show('front', '15秒間、目の前の\nアバターを見て、\n手を振って挨拶してください。');
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', '正面の相手の手が\nゆっくり近づきます。\n顔を正面に向けたまま、\n楽な姿勢で見ていてください。');
        } }
    ],
    5: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', '右側のパネルで\n質問に答えてください。');
        } }
    ],
    6: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '2') ins_show('side', '質問紙に\n答えてください。');
        } }
    ],
    7: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', '少し休憩します…');
        } }
    ],
    8: [
        { type: "exec", action: (deltaTime) => {
            ins_show('side', 'さきほどの相手（NPC）\nについての質問紙に\n答えてください。');
        } }
    ],
    9: [
        { type: "exec", action: (deltaTime) => {
            ins_show('side', '最後に、あなた自身の\nメタバース利用についての\n質問紙に答えてください。');
        } }
    ],
    10: [
        { type: "exec", action: (deltaTime) => {
            ins_show('side', 'ご協力ありがとうございました。\nこの実験は、他者のアバターの\n手が近づいたときに生じる\n感覚（ファントムタッチ）を\n調べるものでした。\n質問紙で、確認とギフト券\n送付先の入力をお願いします。');
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            ins_show('front', 'ご参加ありがとうございました。\n右側のゲートから\n募集ワールドへ戻れます。');
        } }
    ]
};

const duringStateActions = {
};

const stateExitActions = {
};


// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: Instruction board (two placements; coloured backing sized to the line count) ----
const INS_SLOTS = {
  front: { p: new Vector3(0, 2.1867, 1.5), r: new Quaternion(-0.1994, 0, 0, 0.9799) },
  side: { p: new Vector3(-1.1491, 1.65, 0.9642), r: new Quaternion(-0.0302, -0.4224, -0.0141, 0.9058) },
};
const INS_BG_MAX = 7;
function ins_show(slot, text) {
  const s = INS_SLOTS[slot] || INS_SLOTS.front;
  const t = $.subNode('Text');
  if (t) { t.setPosition(s.p); t.setRotation(s.r); }
  SetText(text);
  const n = Math.min(INS_BG_MAX, text ? String(text).split('\n').length : 0);
  for (let i = 1; i <= INS_BG_MAX; i++) { const bg = $.subNode('Bg_' + i); if (bg) bg.setEnabled(i === n); }
}