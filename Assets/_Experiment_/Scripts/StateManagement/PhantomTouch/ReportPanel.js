const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            rp_hideAll(true); HideChild('Text');
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
// Numbers (0-10, 1-7) use the RP_* grid (4 x 3, rp_btn 1..11). The word options (sensation type, location) use the
// wider RPW_* grid (2 x 4, rp_btn 21..28); RP_Done (rp_btn 12) confirms them. When 'その他' is chosen, '決定' asks
// for a short text (Cluster text input) saved as ptypeOther / plocOther; closing the input, or pressing '決定'
// again, leaves it empty. ptype / ploc hold the 1-based positions in RP_TYPES / RP_LOCS, e.g. '1,5'.
const RP_BTN = ['RP_0', 'RP_1', 'RP_2', 'RP_3', 'RP_4', 'RP_5', 'RP_6', 'RP_7', 'RP_8', 'RP_9', 'RP_10'];
const RP_WORD = ['RPW_0', 'RPW_1', 'RPW_2', 'RPW_3', 'RPW_4', 'RPW_5', 'RPW_6', 'RPW_7'];
const RP_WORD_VALUE0 = 21;
const RP_DONE = 'RP_Done';
const RP_DONE_VALUE = 12;
const RP_TYPES = ['触れられた感じ\n（Touch）', '圧迫感（Pressure）', '温かさ', '冷たさ', 'ピリピリ・チクチク・\nしびれ（Tingling）', 'くすぐったさ・かゆみ', '風が通る感じ', 'その他'];
const RP_LOCS = ['額', '目・目のまわり', '頬', '鼻・鼻のまわり', '唇・口のまわり', 'あご', '頭の側面・耳', 'その他'];
// label fit inside the option buttons: [max width, max height, max size] (m); see Study4Button.js
const RP_FIT = [0.144, 0.085, 0.024];
const RP_FIT_WORD = [0.345, 0.10, 0.018];   // word options: up to 2 lines x 10 full-width glyphs at the question's size
const RP_DONE_FIT = [0.23, 0.07, 0.022];
const RP_OTHER_TITLE = { 3: '「その他」の感覚を、短く書いてください。', 4: '「その他」の場所を、短く書いてください。' };
const RP_TEXT_RETRY_MS = 2000, RP_TEXT_RETRIES = 5;   // the input is asked again while the player is busy
const RP_SKIP_GUARD_MS = 1500;   // a double click on '決定' must not skip the text input
let rp_queue = [];
function rp_enqueue(id, cfg) { rp_queue.push({ id: id, cfg: cfg }); }
// Messages to other items are rate-limited; spread them over frames.
function rp_flush() {
  let n = 0;
  while (rp_queue.length > 0 && n < 4) {
    const m = rp_queue.shift();
    try { const h = $.worldItemReference(m.id); if (h) h.send('btn_cfg', m.cfg); } catch (e) { $.log('[ReportPanel] send ' + m.id + ': ' + e); }
    n++;
  }
}
function rp_hideSet(set) { for (let i = 0; i < set.length; i++) rp_enqueue(set[i], { visible: false, on: false }); }
// Shows the number set or the word set with the given labels; the other set is hidden if it was shown.
function rp_showOptions(labels, multi) {
  const set = multi ? RP_WORD : RP_BTN;
  if ($.state.rp_set === (multi ? 'num' : 'word')) rp_hideSet(multi ? RP_BTN : RP_WORD);
  for (let i = 0; i < set.length; i++) {
    rp_enqueue(set[i], i < labels.length ? { visible: true, label: labels[i], on: false, fit: multi ? RP_FIT_WORD : RP_FIT } : { visible: false, on: false });
  }
  rp_enqueue(RP_DONE, { visible: !!multi, label: '決定', on: false, fit: RP_DONE_FIT });
  $.state.rp_set = multi ? 'word' : 'num';
  $.state.rp_sel = [];
}
// all = true hides every button (Start: each button shows itself when its script starts).
function rp_hideAll(all) {
  const cur = all ? '' : $.state.rp_set;
  if (cur !== 'word' && cur !== 'none') rp_hideSet(RP_BTN);
  if (cur !== 'num' && cur !== 'none') rp_hideSet(RP_WORD);
  if (cur !== 'none') rp_enqueue(RP_DONE, { visible: false, on: false });
  $.state.rp_set = 'none';
}
function rp_begin() {
  $.state.rp_step = 1; $.state.rp_active = true;
  $.state.rp_rating = -1; $.state.rp_mc = -1; $.state.rp_type = ''; $.state.rp_loc = '';
  $.state.rp_typeOther = ''; $.state.rp_locOther = '';
  $.state.rp_wait = 0; $.state.rp_waitMeta = ''; $.state.rp_textRetryAt = 0;
  $.state.rp_startTs = Date.now();
  ShowChild('Text');
  rp_render();
}
function rp_render() {
  const s = $.state.rp_step;
  if (s === 1) {
    SetText('相手の手が近づいたとき、顔に何か感じましたか？\n0：まったく感じなかった　10：非常に強く感じた');
    rp_showOptions(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], false);
  } else if (s === 2) {
    SetText('相手はあなたに注意を向けていると感じましたか？\n1：まったく感じなかった　7：強く感じた');
    rp_showOptions(['1', '2', '3', '4', '5', '6', '7'], false);
  } else if (s === 3) {
    SetText('どんな感覚でしたか？当てはまるものをすべて選び、\n「決定」を押してください。');
    rp_showOptions(RP_TYPES, true);
  } else if (s === 4) {
    SetText('どこに感じましたか？当てはまるものをすべて選び、\n「決定」を押してください。');
    rp_showOptions(RP_LOCS, true);
  }
}
function rp_update(dt) {
  rp_flush();
  if (!$.state.rp_active) return;
  rp_retryText();
  const b = $.getStateCompat('this', 'rp_btn', 'integer');
  if (!(b > 0)) return;
  $.setStateCompat('this', 'rp_btn', 0);
  const s = $.state.rp_step;
  if (s === 1) {
    const idx = b - 1;            // RP_0..RP_10
    if (idx >= 0 && idx <= 10) { $.state.rp_rating = idx; $.state.rp_step = 2; rp_render(); }
  } else if (s === 2) {
    const idx = b - 1;
    if (idx >= 0 && idx <= 6) {
      $.state.rp_mc = idx + 1;
      if ($.state.rp_rating >= 1) { $.state.rp_step = 3; rp_render(); } else rp_finish();
    }
  } else if (s === 3 || s === 4) {
    if ($.state.rp_wait) {        // waiting for the 'その他' text: the options are locked, '決定' skips it
      if (b === RP_DONE_VALUE && Date.now() - ($.state.rp_waitTs || 0) >= RP_SKIP_GUARD_MS) rp_otherDone('');
      return;
    }
    const labels = s === 3 ? RP_TYPES : RP_LOCS;
    if (b === RP_DONE_VALUE) {
      const sel = $.state.rp_sel || [];
      if (sel.length === 0) return;
      const val = sel.slice().sort((a, b2) => a - b2).map(i => i + 1).join(',');
      if (s === 3) $.state.rp_type = val; else $.state.rp_loc = val;
      if (sel.indexOf(labels.length - 1) >= 0) rp_askOther(s); else rp_next(s);
    } else {
      const idx = b - RP_WORD_VALUE0;   // RPW_0..RPW_7
      if (idx < 0 || idx >= labels.length) return;
      let sel = $.state.rp_sel || [];
      const k = sel.indexOf(idx);
      if (k >= 0) sel.splice(k, 1); else sel.push(idx);
      $.state.rp_sel = sel;
      rp_enqueue(RP_WORD[idx], { on: k < 0 });
    }
  }
}
function rp_next(s) {
  if (s === 3) { $.state.rp_step = 4; rp_render(); } else rp_finish();
}
// ---- 'その他' text ----
function rp_askOther(s) {
  $.state.rp_wait = s;
  $.state.rp_waitTs = Date.now();
  $.state.rp_waitMeta = 'rp_other_' + s + '_' + $.state.rp_waitTs;   // late answers to an older request are ignored
  $.state.rp_textTries = 0;
  SetText('「その他」の内容を、入力欄に書いてください。\n書かない場合は「決定」をもう一度押してください。');
  rp_requestText();
}
function rp_requestText() {
  $.state.rp_textRetryAt = 0;
  $.state.rp_textTries = ($.state.rp_textTries || 0) + 1;
  try {
    const p = PARTICIPANTS[1];
    if (p) p.requestTextInput($.state.rp_waitMeta, RP_OTHER_TITLE[$.state.rp_wait]);
    else $.log('[ReportPanel] no participant for the text input');
  } catch (e) {
    $.log('[ReportPanel] requestTextInput: ' + e);
    $.state.rp_textRetryAt = Date.now() + RP_TEXT_RETRY_MS;
  }
}
function rp_retryText() {
  const at = $.state.rp_textRetryAt || 0;
  if (!$.state.rp_wait || at <= 0 || Date.now() < at) return;
  if (($.state.rp_textTries || 0) >= RP_TEXT_RETRIES) { $.state.rp_textRetryAt = 0; return; }
  rp_requestText();
}
function rp_clean(t) { return String(t || '').replace(/[\r\n\t]+/g, ' ').trim(); }
function rp_otherDone(text) {
  const s = $.state.rp_wait;
  $.state.rp_wait = 0; $.state.rp_waitMeta = ''; $.state.rp_textRetryAt = 0;
  if (s === 3) $.state.rp_typeOther = text; else $.state.rp_locOther = text;
  rp_next(s);
}
$.onTextInput((text, meta, status) => {
  try {
    if (!$.state.rp_active || !$.state.rp_wait || meta !== $.state.rp_waitMeta) return;
    if (status === TextInputStatus.Success) rp_otherDone(rp_clean(text));
    else if (status === TextInputStatus.Busy) $.state.rp_textRetryAt = Date.now() + RP_TEXT_RETRY_MS;
    else rp_otherDone('');        // Refused: the participant closed the input without writing
  } catch (e) { $.log('[ReportPanel] text input: ' + e); }
});
function rp_finish() {
  $.state.rp_active = false;
  $.state.rp_wait = 0;
  SendDataToCollector('rating', $.state.rp_rating);
  SendDataToCollector('mc', $.state.rp_mc);
  SendDataToCollector('ptype', $.state.rp_type || '');
  SendDataToCollector('ptypeOther', $.state.rp_typeOther || '');
  SendDataToCollector('ploc', $.state.rp_loc || '');
  SendDataToCollector('plocOther', $.state.rp_locOther || '');
  SendDataToCollector('reportDoneTs', Date.now());
  ProcessAndSaveCollectedData();
  rp_hideAll();
  SetText('ありがとうございます。');
  ToNextState();
}
function rp_end() { rp_hideAll(); HideChild('Text'); $.state.rp_active = false; $.state.rp_wait = 0; }