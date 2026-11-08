const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } }
    ],
    2: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              $.subNode('MirrorFront').setEnabled(true)
            }
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(true)
        } }
    ]
};

const duringStateActions = {
};

const stateExitActions = {
    2: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorFront').setEnabled(false)
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } }
    ]
};