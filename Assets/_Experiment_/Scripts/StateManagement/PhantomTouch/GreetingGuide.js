const stateEnterActions = {
    0: [
        { type: "exec", action: (deltaTime) => {
            $.setStateCompat('this', 'exp_showItem', true);
        } },
        { type: "exec", action: (deltaTime) => {
            gg_stop();
        } }
    ],
    3: [
        { type: "exec", action: (deltaTime) => {
            gg_begin();
        } }
    ]
};

const duringStateActions = {
    3: [
        { type: "exec", action: (deltaTime) => {
            gg_tick(deltaTime);
        } }
    ]
};

const stateExitActions = {
    3: [
        { type: "exec", action: (deltaTime) => {
            gg_stop();
        } }
    ]
};


// ---- legacy free-form code (migrate to event handlers when possible) ----

// ---- Study 4: GreetingGuide (guided greeting: one instruction at a time, close in front of the participant) ----
// Runs in the greeting state of every trial, in both social conditions. Each instruction is shown on a small red
// panel in front of the participant's face and disappears the moment they have followed it, so that they can
// watch what the NPC does: the NPC is told with 'npc_greet_cue' and answers only in the social-cue condition.
// After the last instruction the state ends; the greeting has no time limit of its own.
const GG_NPC = new Vector3(0, 0, -1);        // where the NPC stands (horizontal)
const GG_RIGHT = new Vector3(1, 0, 0);      // the marker's right
const GG_DIST = 0.7, GG_DROP = 0.05, GG_EYE_UP = 0.07;   // panel: in front of / below the head bone; eyes above it
const GG_SIZE = 0.014, GG_GLYPH_W = 1.85, GG_LINE_H = 2.74, GG_PAD = 0.04;
// id: the cue sent to the NPC; watch: seconds without a panel after the instruction was followed
const GG_STEPS = [
  { id: 'wave', text: '相手に向かって\n手を振ってください', watch: 3.0 },
  { id: 'lookAway', text: '顔を右に向けて、\n相手から目をそらしてください', watch: 1.0 },
  { id: 'lookBack', text: 'もう一度、\n相手の顔を見てください', watch: 3.0 },
  { id: 'move', text: '右へ1歩（約50cm）\n動いてください', watch: 3.0 },
  { id: 'lookAgain', text: 'もう一度、\n相手の顔を見てください', watch: 3.0 },
];
const GG_START_SEC = 2.0;        // before the first instruction (the NPC appears and settles)
const GG_TIMEOUT_SEC = 30;       // an instruction not followed for this long is skipped (greetTimeouts)
const GG_MAX_SEC = 180;          // the greeting ends after this long, whatever happened
const GG_LOOK_AT_DEG = 20;       // looking at the NPC: head forward within this angle of the NPC's head ...
const GG_LOOK_AWAY_DEG = 45;     // ... looking away: head yaw at least this far from the NPC ...
const GG_LOOK_HOLD_SEC = 0.3;    // ... for this long
const GG_HAND_BELOW_HEAD = 0.10; // waving: a hand (wrist) higher than the head bone minus this ...
const GG_WAVE_TRAVEL = 0.12;     // ... that has moved this far horizontally while raised (m)
const GG_MOVE_DIST = 0.30;       // stepping aside: the head has moved this far sideways (m)
const GG_REPLACE_DEG = 30;       // the panel is put in front of the face again when it is this far off the
const GG_REPLACE_DIST = 0.25;    //   head's forward direction, or this much nearer / farther than GG_DIST

function gg_begin() {
  $.state.gg_active = true;
  $.state.gg_startTs = Date.now();
  $.state.gg_step = 0; $.state.gg_phase = 'wait'; $.state.gg_t = 0; $.state.gg_wait = GG_START_SEC;
  $.state.gg_secs = []; $.state.gg_timeouts = 0;
  gg_hide();
}
function gg_stop() { $.state.gg_active = false; gg_hide(); }
function gg_hide() {
  $.state.gg_shown = false;
  SetText('');
  const bg = $.subNode('Bg');
  if (bg) bg.setEnabled(false);
}
function gg_head(p) {
  const pos = p.getHumanoidBonePosition(HumanoidBone.Head), rot = p.getHumanoidBoneRotation(HumanoidBone.Head);
  return (pos && rot) ? { pos: pos, rot: rot, fwd: new Vector3(0, 0, 1).applyQuaternion(rot) } : null;
}
// Panel in front of the face: GG_DIST along the head's horizontal forward, GG_DROP below the head bone, turned to
// the eyes. (The item does not move; the Text sub-node is placed in its local frame.)
function gg_place(head) {
  const t = $.subNode('Text');
  if (!t) return;
  const f = head.fwd.clone(); f.y = 0;
  if (f.length() < 0.2) return;
  f.normalize();
  const world = head.pos.clone().add(f.multiplyScalar(GG_DIST)).add(new Vector3(0, -GG_DROP, 0));
  const d = world.clone().sub(head.pos.clone().add(new Vector3(0, GG_EYE_UP, 0))).normalize();
  const rot = new Quaternion().setFromEulerAngles(new Vector3(-Math.asin(d.y) * 180 / Math.PI, Math.atan2(d.x, d.z) * 180 / Math.PI, 0));
  const inv = $.getRotation().clone().invert();
  t.setPosition(world.clone().sub($.getPosition()).applyQuaternion(inv));
  t.setRotation(inv.clone().multiply(rot));
  $.state.gg_anchor = world;
}
function gg_follow(head) {
  const a = $.state.gg_anchor;
  if (!a) { gg_place(head); return; }
  const to = a.clone().sub(head.pos); to.y = 0;
  const f = head.fwd.clone(); f.y = 0;
  if (f.length() < 0.2 || to.length() < 1e-3) return;
  const ang = Math.acos(Math.max(-1, Math.min(1, f.normalize().dot(to.clone().normalize())))) * 180 / Math.PI;
  if (ang > GG_REPLACE_DEG || Math.abs(to.length() - GG_DIST) > GG_REPLACE_DIST) gg_place(head);
}
function gg_show(text, head) {
  gg_place(head);
  SetText(text);
  const lines = String(text).split('\n');
  let w = 0;
  for (const ln of lines) { let lw = 0; for (let i = 0; i < ln.length; i++) lw += ln.charCodeAt(i) < 0x80 ? 0.56 : 1; if (lw > w) w = lw; }
  const bg = $.subNode('Bg');
  if (bg) {
    try {
      bg.getUnityComponent('Transform').unityProp.localScale = new Vector3(w * GG_GLYPH_W * GG_SIZE + GG_PAD * 2, lines.length * GG_LINE_H * GG_SIZE + GG_PAD, 1);
      bg.setEnabled(true);
    } catch (e) { $.log('[GreetingGuide] backing: ' + e); }
  }
  $.state.gg_shown = true;
}
// Angle (deg) between the head's forward direction and the direction to the NPC's head (taken at the participant's
// head height: the heights are matched). yawOnly: horizontal angle; 0 while the head points steeply up or down.
function gg_npcAngle(head, yawOnly) {
  const to = GG_NPC.clone().sub(head.pos); to.y = 0;
  const f = head.fwd.clone();
  if (yawOnly) { f.y = 0; if (f.length() < 0.3) return 0; }
  if (to.length() < 1e-3) return 0;
  return Math.acos(Math.max(-1, Math.min(1, f.normalize().dot(to.normalize())))) * 180 / Math.PI;
}
// Horizontal travel of a raised hand relative to the head since the last frame; rel is remembered in prev.
function gg_handStep(h, head, prev) {
  if (!h || h.y <= head.pos.y - GG_HAND_BELOW_HEAD) return { rel: null, d: 0 };
  const rel = h.clone().sub(head.pos); rel.y = 0;
  return { rel: rel, d: prev ? rel.clone().sub(prev).length() : 0 };
}
function gg_waved(p, head) {
  const l = gg_handStep(p.getHumanoidBonePosition(HumanoidBone.LeftHand), head, $.state.gg_prevL);
  const r = gg_handStep(p.getHumanoidBonePosition(HumanoidBone.RightHand), head, $.state.gg_prevR);
  $.state.gg_prevL = l.rel; $.state.gg_prevR = r.rel;
  $.state.gg_travel = ($.state.gg_travel || 0) + l.d + r.d;
  return $.state.gg_travel >= GG_WAVE_TRAVEL;
}
// Has the participant followed instruction id? now: judge this instant (before the panel is shown); otherwise the
// gaze conditions must hold for GG_LOOK_HOLD_SEC.
function gg_done(id, p, head, dt, now) {
  if (id === 'wave') return gg_waved(p, head);
  if (id === 'move') return Math.abs(head.pos.clone().sub($.state.gg_base).dot(GG_RIGHT)) >= GG_MOVE_DIST;
  const ok = id === 'lookAway' ? gg_npcAngle(head, true) >= GG_LOOK_AWAY_DEG : gg_npcAngle(head, false) <= GG_LOOK_AT_DEG;
  if (now) return ok;
  $.state.gg_hold = ok ? ($.state.gg_hold || 0) + dt : 0;
  return $.state.gg_hold >= GG_LOOK_HOLD_SEC;
}
function gg_tick(dt) {
  if (!$.state.gg_active) return;
  if ((Date.now() - ($.state.gg_startTs || Date.now())) / 1000 > GG_MAX_SEC) {
    $.log('[GreetingGuide] not finished within ' + GG_MAX_SEC + ' s; moving on');
    gg_report(); gg_finish(); return;
  }
  const p = PARTICIPANTS[1];
  const head = (p && p.exists()) ? gg_head(p) : null;
  if (!head) return;
  $.state.gg_t = ($.state.gg_t || 0) + dt;
  const i = $.state.gg_step || 0;
  if ($.state.gg_phase === 'wait') {
    if ($.state.gg_t < ($.state.gg_wait || 0)) return;
    if (i >= GG_STEPS.length) { gg_finish(); return; }
    // next instruction; not shown at all when the participant is already doing it
    $.state.gg_phase = 'prompt'; $.state.gg_t = 0; $.state.gg_hold = 0;
    $.state.gg_base = head.pos; $.state.gg_travel = 0; $.state.gg_prevL = null; $.state.gg_prevR = null;
    if (gg_done(GG_STEPS[i].id, p, head, dt, true)) gg_next(i, 0, false);
    else gg_show(GG_STEPS[i].text, head);
    return;
  }
  if (gg_done(GG_STEPS[i].id, p, head, dt, false)) { gg_next(i, $.state.gg_t, false); return; }
  if ($.state.gg_t > GG_TIMEOUT_SEC) { gg_next(i, -1, true); return; }
  gg_follow(head);
}
// Instruction i is over (followed after sec seconds, or skipped): hide the panel at once, tell the NPC, pause.
function gg_next(i, sec, timedOut) {
  gg_hide();
  const step = GG_STEPS[i];
  const secs = $.state.gg_secs || [];
  secs.push(timedOut ? -1 : Math.round(sec * 10) / 10);
  $.state.gg_secs = secs;
  if (timedOut) $.state.gg_timeouts = ($.state.gg_timeouts || 0) + 1;
  else {
    try { $.worldItemReference('NPC').send('npc_greet_cue', { cue: step.id }); }
    catch (e) { $.log('[GreetingGuide] cue: ' + e); }
  }
  $.log('[GreetingGuide] ' + step.id + (timedOut ? ' skipped (timeout)' : ' done after ' + secs[secs.length - 1] + ' s'));
  $.state.gg_step = i + 1; $.state.gg_phase = 'wait'; $.state.gg_t = 0;
  $.state.gg_wait = timedOut ? 0.5 : step.watch;
  // written before the last pause, so well before the NPC writes its own greeting counters at the end of the state
  if (i + 1 >= GG_STEPS.length) gg_report();
}
function gg_report() {
  SendDataToCollector('greetStepSec', ($.state.gg_secs || []).join(','));
  SendDataToCollector('greetTimeouts', $.state.gg_timeouts || 0);
}
function gg_finish() { gg_stop(); ToNextState(); }