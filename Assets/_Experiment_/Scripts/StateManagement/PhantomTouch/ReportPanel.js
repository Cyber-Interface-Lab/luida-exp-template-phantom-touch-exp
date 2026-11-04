const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            rp_hideAll(); HideChild('Text');
        } }
    ],
    5: [
        { type: "exec", action: (deltaTime) => {
            rp_begin();
        } }
    ]
};

const duringStateActions = {
    5: [
        { type: "exec", action: (deltaTime) => {
            rp_update(deltaTime);
        } }
    ]
};

const stateExitActions = {
    5: [
        { type: "exec", action: (deltaTime) => {
            rp_end();
        } }
    ]
};


function Update(deltaTime) {
    rp_flush();
}

// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: ReportPanel (0-10 rating -> manipulation check -> type -> location) ----
const RP_BTN = ['RP_0', 'RP_1', 'RP_2', 'RP_3', 'RP_4', 'RP_5', 'RP_6', 'RP_7', 'RP_8', 'RP_9', 'RP_10'];
const RP_DONE = 'RP_Done';
const RP_TYPES = ['圧迫感', 'ぞわぞわ・むずむず', '温かさ', '冷たさ', '風・空気の動き', 'しびれ', 'その他'];
const RP_LOCS = ['額', '目のまわり', '頬', '鼻・口のまわり', 'あご', '頭の側面・耳', '首', 'その他'];
let rp_queue = [];
function rp_enqueue(id, cfg) { rp_queue.push({ id: id, cfg: cfg }); }
// Messages to other items are rate-limited (10/s per item); spread them over frames.
function rp_flush() {
  let n = 0;
  while (rp_queue.length > 0 && n < 4) {
    const m = rp_queue.shift();
    try { const h = $.worldItemReference(m.id); if (h) h.send('btn_cfg', m.cfg); } catch (e) { $.log('[ReportPanel] send ' + m.id + ': ' + e); }
    n++;
  }
}
function rp_showOptions(labels, multi) {
  for (let i = 0; i < RP_BTN.length; i++) {
    rp_enqueue(RP_BTN[i], i < labels.length ? { visible: true, label: labels[i], on: false } : { visible: false, on: false });
  }
  rp_enqueue(RP_DONE, { visible: !!multi, label: '決定', on: false });
  $.state.rp_sel = [];
}
function rp_hideAll() {
  for (let i = 0; i < RP_BTN.length; i++) rp_enqueue(RP_BTN[i], { visible: false, on: false });
  rp_enqueue(RP_DONE, { visible: false, on: false });
}
function rp_begin() {
  $.state.rp_step = 1; $.state.rp_active = true;
  $.state.rp_rating = -1; $.state.rp_mc = -1; $.state.rp_type = ''; $.state.rp_loc = '';
  $.state.rp_startTs = Date.now();
  ShowChild('Text');
  rp_render();
}
function rp_render() {
  const s = $.state.rp_step;
  if (s === 1) {
    SetText('相手の手が近づいたとき、顔に何か感じましたか？\n0 = まったく感じなかった　…　10 = 非常に強く感じた');
    rp_showOptions(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], false);
  } else if (s === 2) {
    SetText('相手はあなたに注意を向けていると感じましたか？\n1 = まったく感じなかった　…　7 = 強く感じた');
    rp_showOptions(['1', '2', '3', '4', '5', '6', '7'], false);
  } else if (s === 3) {
    SetText('どんな感覚でしたか？\n当てはまるものをすべて選び、「決定」を押してください。');
    rp_showOptions(RP_TYPES, true);
  } else if (s === 4) {
    SetText('どこに感じましたか？\n当てはまるものをすべて選び、「決定」を押してください。');
    rp_showOptions(RP_LOCS, true);
  }
}
function rp_update(dt) {
  rp_flush();
  if (!$.state.rp_active) return;
  const b = $.getStateCompat('this', 'rp_btn', 'integer');
  if (!(b > 0)) return;
  $.setStateCompat('this', 'rp_btn', 0);
  const idx = b - 1;              // 0..10 = option buttons, 11 = Done
  const s = $.state.rp_step;
  if (s === 1) {
    if (idx >= 0 && idx <= 10) { $.state.rp_rating = idx; $.state.rp_step = 2; rp_render(); }
  } else if (s === 2) {
    if (idx >= 0 && idx <= 6) {
      $.state.rp_mc = idx + 1;
      if ($.state.rp_rating >= 1) { $.state.rp_step = 3; rp_render(); } else rp_finish();
    }
  } else if (s === 3 || s === 4) {
    const labels = s === 3 ? RP_TYPES : RP_LOCS;
    if (idx === 11) {
      const sel = $.state.rp_sel || [];
      if (sel.length === 0) return;
      const val = sel.slice().sort((a, b2) => a - b2).map(i => i + 1).join(',');
      if (s === 3) { $.state.rp_type = val; $.state.rp_step = 4; rp_render(); }
      else { $.state.rp_loc = val; rp_finish(); }
    } else if (idx >= 0 && idx < labels.length) {
      let sel = $.state.rp_sel || [];
      const k = sel.indexOf(idx);
      if (k >= 0) sel.splice(k, 1); else sel.push(idx);
      $.state.rp_sel = sel;
      rp_enqueue(RP_BTN[idx], { on: k < 0 });
    }
  }
}
function rp_finish() {
  $.state.rp_active = false;
  SendDataToCollector('rating', $.state.rp_rating);
  SendDataToCollector('mc', $.state.rp_mc);
  SendDataToCollector('ptype', $.state.rp_type || '');
  SendDataToCollector('ploc', $.state.rp_loc || '');
  SendDataToCollector('reportDoneTs', Date.now());
  ProcessAndSaveCollectedData();
  rp_hideAll();
  SetText('ありがとうございます。');
  ToNextState();
}
function rp_end() { rp_hideAll(); HideChild('Text'); $.state.rp_active = false; }