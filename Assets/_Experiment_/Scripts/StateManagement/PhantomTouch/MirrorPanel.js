const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
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
    4: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } }
    ]
};