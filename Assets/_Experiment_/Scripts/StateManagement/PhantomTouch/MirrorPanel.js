const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorFront').setEnabled(false)
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorTouch').setEnabled(false)
        } }
    ],
    1: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              $.subNode('Mirror').setEnabled(true)
            }
        } }
    ],
    2: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              $.subNode('MirrorFront').setEnabled(true)
            }
        } },
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              $.subNode('Mirror').setEnabled(false)
            }
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            if (CONDITION['rep'] === '1') {
              $.subNode('Mirror').setEnabled(true)
            }
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorTouch').setEnabled(true)
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
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
    3: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } }
    ],
    4: [
        { type: "exec", action: (deltaTime) => {
            $.subNode('MirrorTouch').setEnabled(false)
        } },
        { type: "exec", action: (deltaTime) => {
            $.subNode('Mirror').setEnabled(false)
        } }
    ]
};