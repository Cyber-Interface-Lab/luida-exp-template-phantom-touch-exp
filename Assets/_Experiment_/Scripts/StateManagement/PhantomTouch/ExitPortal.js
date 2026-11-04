const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } }
    ],
    11: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('WorldGateToLuidaBar').setEnabled(true)
        } }
    ]
};

const duringStateActions = {
};

const stateExitActions = {
};