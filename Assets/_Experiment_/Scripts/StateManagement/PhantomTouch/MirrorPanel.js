const stateEnterActions = {
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