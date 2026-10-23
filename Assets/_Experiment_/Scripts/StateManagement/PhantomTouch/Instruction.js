const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`ようこそ。\n目の前の質問紙で研究の説明を読み、各項目にチェックを入れて進んでください。`);
        } }
    ],
    1: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`トラッキングの確認をします。\n1) 頭をゆっくり左右に向けてください\n2) 両手を頭より高く上げてください`);
        } }
    ],
    2: [
        { type: "exec", action: (deltaTime) => {
            SetText('ブロック ' + CONDITION['block'] + ' / 2');
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`正面の相手の手がゆっくり近づきます。\n顔の正面を向いたまま、楽な姿勢で立って見ていてください。`);
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`右側のパネルで質問に答えてください。`);
        } }
    ],
    5: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['block'] === '1' && CONDITION['rep'] === '2') SetText('質問紙に答えてください。');
        } }
    ],
    6: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['block'] === '2' && CONDITION['rep'] === '2') SetText('質問紙に答えてください。');
        } }
    ],
    7: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`少し休憩します…`);
        } }
    ],
    8: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`正面の相手（NPC）についての質問紙に答えてください。`);
        } }
    ],
    9: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`最後に、あなた自身のメタバース利用についての質問紙に答えてください。`);
        } }
    ],
    10: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`ご協力ありがとうございました。\nこの実験は、他者のアバターの手が近づいたときに生じる感覚（ファントムタッチ）を調べるものでした。\n質問紙で確認とギフト券送付先の入力をお願いします。`);
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Text').setText(`ご参加ありがとうございました。\n右側のゲートから募集ワールドへ戻れます。`);
        } }
    ]
};

const duringStateActions = {
};

const stateExitActions = {
};