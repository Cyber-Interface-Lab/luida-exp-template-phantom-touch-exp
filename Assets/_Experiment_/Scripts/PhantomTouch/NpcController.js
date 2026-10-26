// ===== Study 4 NPC controller =====
// Runs on the NPC item (a LUIDA avatar wrapper built from a VRM, with AvatarSyncClone.js
// replaced by this script). Expects the generated NPC_BoneMap.js header to be prepended
// by LuidaScriptCombiner (BONE_MAP, BONE_PARENT, AVATAR_* constants).
//
// Messages (sent by the NpcDirector state-listening item):
//   "npc_setup"           { social: boolean }   -> remember the social-cue condition (NPC stays hidden)
//   "npc_hide"            {}                    -> hide the body (avatar-switch phase)
//   "npc_show"            { social? }           -> stand at conversation distance in front of the participant and show the body
//   "npc_greeting_begin"  { social? }           -> greeting period: gaze + reactions (social condition only)
//   "npc_greeting_end"    {}                    -> stop the greeting reactions, write greeting counters
//   "npc_trial_start"     { block, rep, avatar, social } -> step closer -> prep -> raise hand -> approach (2 cm/s) -> hold -> retract -> step back
//   "npc_abort"           {}                    -> back to idle
// Output:
//   item signal "npc_done" (a GlobalLogic on this item relays it to the global signal "npc_done")
//   per-trial measurements merged into $.groupState.collectedData (this item is an ItemGroupMember)
//
// All pose math is done in the item-local frame of the NPC root, in the "normalized skeleton"
// convention used by Cluster (T-pose = identity). The same world->local retargeting formula as
// AvatarSyncClone.js is used to drive the bone sub-nodes.

const NPC_CFG = {
  REACH_SPEED: 0.02,       // m/s (thesis 6.2.3)
  PREP_SEC: 2.0,           // wait (and step closer) before the hand is raised
  READY_SEC: 1.2,          // raise the hand to the ready position (fast, not part of the stimulus)
  READY_FWD: 0.12,         // ready fingertip: in front of the shoulder (m)
  READY_UP: 0.02,
  READY_IN: 0.06,          // ... and slightly toward the body midline
  HOLD_SEC: 2.0,           // hold at the face
  RETRACT_SPEED: 0.10,     // m/s
  STOP_MARGIN: 0.03,       // stop this far before the face surface
  FACE_UP: 0.05,           // face point: head bone + up*FACE_UP + forward*FACE_FWD (head frame)
  FACE_FWD: 0.10,
  FINGER_LEN: 0.09,        // wrist -> fingertip along the forearm direction
  SAMPLE_INTERVAL: 0.1,    // 10 Hz trace
  STAND_FACTOR: 0.93,      // usable fraction of (upper arm + forearm + finger) when choosing the reach spot
  MIN_STAND_DIST: 0.40,    // minimum horizontal root-to-head distance at the reach spot (m)
  IDLE_EXTRA_DIST: 0.45,   // conversation distance = reach distance + this (m)
  MAX_SAMPLES: 400,        // trace cap (10 Hz -> 40 s)
  GLIDE_SEC: 1.0,          // step closer / step back duration
  GAZE_MAX_DEG: 60,
  LOOK_AT_DEG: 30,         // participant "looks at" the NPC when head forward is within this angle
  LOOK_AWAY_DEG: 45,       // ... and stops when it exceeds this angle (hysteresis)
  GREET_SEC: 1.5,          // nod + wave duration
  WAVE_COOLDOWN_SEC: 2.5,  // minimum interval between reactive waves
  HAND_RAISE_OFFSET: 0.10, // a hand counts as raised when above (head height - this)
  SMILE_MIN_SEC: 4.0,      // spontaneous smiles during the greeting period, random interval
  SMILE_MAX_SEC: 7.0,
  SMILE_COOLDOWN_SEC: 1.5,
  RETREAT_THRESHOLD: 0.02, // m, for the in-world retreat-onset estimate
  MODEL_NODE: "Model",     // sub-node holding the VRM model (toggled for visibility)
  FACE_NODE: "Face",       // sub-node with the face SkinnedMeshRenderer + smile Animator
};

const IDENT = new Quaternion(0, 0, 0, 1);
const UP = new Vector3(0, 1, 0);

// ---------------------------------------------------------------- math helpers
function v3(x, y, z) { return new Vector3(x, y, z); }
function vadd(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
function vsub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
function vscale(a, s) { return v3(a.x * s, a.y * s, a.z * s); }
function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function vcross(a, b) { return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
function vlen(a) { return Math.sqrt(vdot(a, a)); }
function vnorm(a) { const l = vlen(a); return l > 1e-9 ? vscale(a, 1 / l) : v3(0, 0, 1); }
function vlerp(a, b, t) { return vadd(a, vscale(vsub(b, a), t)); }
function vhoriz(a) { return vnorm(v3(a.x, 0, a.z)); }
function vcopy(a) { return v3(a.x, a.y, a.z); }

function qmul(a, b) {
  return new Quaternion(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);
}
function qinv(q) { return new Quaternion(-q.x, -q.y, -q.z, q.w); }
function qrot(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return v3(
    v.x + q.w * tx + (q.y * tz - q.z * ty),
    v.y + q.w * ty + (q.z * tx - q.x * tz),
    v.z + q.w * tz + (q.x * ty - q.y * tx));
}
function qaxis(axis, deg) {
  const a = vnorm(axis);
  const h = deg * Math.PI / 360;
  const s = Math.sin(h);
  return new Quaternion(a.x * s, a.y * s, a.z * s, Math.cos(h));
}
// Minimal rotation taking direction a to direction b.
function qfromTo(a, b) {
  const an = vnorm(a), bn = vnorm(b);
  const d = Math.max(-1, Math.min(1, vdot(an, bn)));
  if (d > 0.99999) return new Quaternion(0, 0, 0, 1);
  if (d < -0.99999) {
    let axis = vcross(v3(1, 0, 0), an);
    if (vlen(axis) < 1e-6) axis = vcross(v3(0, 1, 0), an);
    return qaxis(axis, 180);
  }
  const axis = vcross(an, bn);
  return qaxis(axis, Math.acos(d) * 180 / Math.PI);
}
function qslerp(a, b, t) {
  if (t <= 0) return a; if (t >= 1) return b;
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (cos > 0.9995) {
    return qnormalize(new Quaternion(a.x + (bx - a.x) * t, a.y + (by - a.y) * t, a.z + (bz - a.z) * t, a.w + (bw - a.w) * t));
  }
  const th = Math.acos(cos), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return new Quaternion(a.x * wa + bx * wb, a.y * wa + by * wb, a.z * wa + bz * wb, a.w * wa + bw * wb);
}
function qnormalize(q) {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  return new Quaternion(q.x / l, q.y / l, q.z / l, q.w / l);
}
function qangleDeg(q) { return 2 * Math.acos(Math.max(-1, Math.min(1, Math.abs(q.w)))) * 180 / Math.PI; }
function qclamp(q, maxDeg) { const a = qangleDeg(q); return a > maxDeg ? qslerp(IDENT, q, maxDeg / a) : q; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function easeInOut(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function f3(x) { return (Math.round(x * 1000) / 1000).toString(); }
function nowSec() { return Date.now() / 1000; }

// ---------------------------------------------------------------- bone cache
let boneNodes = [];
let nodeByBone = {};

function cacheBones() {
  boneNodes = [];
  nodeByBone = {};
  if (typeof BONE_MAP === "undefined") return;
  for (let i = 0; i < BONE_MAP.length; i++) {
    const entry = BONE_MAP[i];
    const node = $.subNode(entry.name);
    if (!node) continue;
    const parentBone = (typeof BONE_PARENT !== "undefined" && BONE_PARENT[entry.bone] !== undefined) ? BONE_PARENT[entry.bone] : null;
    const info = {
      bone: entry.bone,
      node: node,
      parentBone: parentBone,
      rest: entry.rest !== undefined ? entry.rest : IDENT,
      restParent: entry.restParent !== undefined ? entry.restParent : IDENT,
    };
    boneNodes.push(info);
    nodeByBone[entry.bone] = info;
  }
}

function itemPose() {
  const pos = $.getPosition();
  const rot = $.getRotation();
  return { pos: pos || v3(0, 0, 0), rot: rot || IDENT };
}
function toLocal(world, ip) { return qrot(qinv(ip.rot), vsub(world, ip.pos)); }
function toWorld(local, ip) { return vadd(ip.pos, qrot(ip.rot, local)); }

// Rest geometry (item-local, measured once while the model is still in its rest pose and visible).
function measureRest() {
  const need = [HumanoidBone.RightUpperArm, HumanoidBone.RightLowerArm, HumanoidBone.RightHand,
                HumanoidBone.LeftUpperArm, HumanoidBone.LeftLowerArm, HumanoidBone.LeftHand,
                HumanoidBone.Head, HumanoidBone.Hips];
  const ip = itemPose();
  const p = {};
  for (const b of need) {
    const info = nodeByBone[b];
    if (!info) return null;
    const gp = info.node.getGlobalPosition();
    if (!gp) return null;
    p[b] = toLocal(gp, ip);
  }
  const right = vhoriz(vsub(p[HumanoidBone.RightUpperArm], p[HumanoidBone.LeftUpperArm]));
  const fwd = vnorm(vcross(right, UP));
  const rest = {
    right: right, fwd: fwd,
    sR: p[HumanoidBone.RightUpperArm], sL: p[HumanoidBone.LeftUpperArm],
    head: p[HumanoidBone.Head],
    axisRU: vnorm(vsub(p[HumanoidBone.RightLowerArm], p[HumanoidBone.RightUpperArm])),
    axisRL: vnorm(vsub(p[HumanoidBone.RightHand], p[HumanoidBone.RightLowerArm])),
    axisLU: vnorm(vsub(p[HumanoidBone.LeftLowerArm], p[HumanoidBone.LeftUpperArm])),
    axisLL: vnorm(vsub(p[HumanoidBone.LeftHand], p[HumanoidBone.LeftLowerArm])),
    L1: vlen(vsub(p[HumanoidBone.RightLowerArm], p[HumanoidBone.RightUpperArm])),
    L2: vlen(vsub(p[HumanoidBone.RightHand], p[HumanoidBone.RightLowerArm])),
  };
  if (rest.L1 < 0.05 || rest.L2 < 0.05) return null;
  return rest;
}

function restGeom() {
  if ($.state.npc_rest) return $.state.npc_rest;
  if (boneNodes.length === 0) cacheBones();
  const r = measureRest();
  if (r) {
    $.state.npc_rest = r;
    $.log("[NPC] rest geometry: L1=" + f3(r.L1) + " L2=" + f3(r.L2) + " shoulderH=" + f3(r.sR.y));
  }
  return r;
}

// ---------------------------------------------------------------- visibility & face
function applyVisibility() {
  const node = $.subNode(NPC_CFG.MODEL_NODE);
  if (!node) return;
  try { node.setEnabled(!!$.state.npc_visible); } catch (e) { $.log("[NPC] setEnabled failed: " + e); }
  $.state.npc_visibilityApplied = !!$.state.npc_visible;
}
function setVisible(v) {
  $.state.npc_visible = !!v;
  applyVisibility();
}
// Trigger the smile animation (Animator on the Face sub-node, trigger "smile"). Silently ignored
// when the model has no face animator.
function smile() {
  const t = nowSec();
  if (t - ($.state.npc_lastSmile || 0) < NPC_CFG.SMILE_COOLDOWN_SEC) return;
  $.state.npc_lastSmile = t;
  $.state.npc_smiles = ($.state.npc_smiles || 0) + 1;
  try {
    const face = $.subNode(NPC_CFG.FACE_NODE);
    if (!face) return;
    const anim = face.getUnityComponent("Animator");
    if (anim) anim.setTrigger("smile");
  } catch (e) {
    if (!$.state.npc_smileWarned) { $.state.npc_smileWarned = true; $.log("[NPC] smile unavailable: " + e); }
  }
}

// ---------------------------------------------------------------- lifecycle
$.onStart(() => {
  $.state.npc_phase = "idle";
  $.state.npc_mode = "none";
  $.state.npc_t = 0;
  $.state.npc_social = false;
  $.state.npc_visible = false;
  $.state.npc_trial = null;
  $.state.npc_rest = null;
  $.state.npc_trace = [];
  $.state.npc_glide = null;
  cacheBones();
  $.log("[NPC] started, bones=" + boneNodes.length);
});

$.onReceive((messageType, arg, sender) => {
  try {
    if (messageType === "npc_setup") {
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      $.state.npc_phase = "idle";
      $.state.npc_t = 0;
      $.log("[NPC] setup social=" + $.state.npc_social);
    } else if (messageType === "npc_hide") {
      $.state.npc_mode = "none";
      $.state.npc_phase = "idle";
      setVisible(false);
    } else if (messageType === "npc_show") {
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      $.state.npc_phase = "idle";
      $.state.npc_t = 0;
      moveToStand(NPC_CFG.IDLE_EXTRA_DIST, false);
      setVisible(true);
      $.log("[NPC] shown social=" + $.state.npc_social);
    } else if (messageType === "npc_greeting_begin") {
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      if (!$.state.npc_visible) { moveToStand(NPC_CFG.IDLE_EXTRA_DIST, false); setVisible(true); }
      beginGreeting();
    } else if (messageType === "npc_greeting_end") {
      endGreeting();
    } else if (messageType === "npc_trial_start") {
      $.state.npc_trial = arg || {};
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      if ($.state.npc_mode === "greeting") endGreeting();
      if (!$.state.npc_visible) setVisible(true);
      startTrial();
    } else if (messageType === "npc_abort") {
      $.state.npc_phase = "idle";
      $.state.npc_t = 0;
      moveToStand(NPC_CFG.IDLE_EXTRA_DIST, true);
    }
  } catch (e) {
    $.log("[NPC] onReceive error: " + e);
  }
});

// ---------------------------------------------------------------- participant
function participant() {
  try {
    const ps = $.groupState ? $.groupState.participants : null;
    if (ps && ps.length > 0 && ps[0] && ps[0].exists()) return ps[0];
  } catch (e) { /* not a group member */ }
  const near = $.getPlayersNear($.getPosition(), 50);
  return near && near.length > 0 ? near[0] : null;
}

function headOf(p) {
  const pos = p.getHumanoidBonePosition(HumanoidBone.Head);
  const rot = p.getHumanoidBoneRotation(HumanoidBone.Head);
  if (!pos || !rot) return null;
  return { pos: pos, rot: rot, fwd: qrot(rot, v3(0, 0, 1)) };
}
function facePointWorld(head) {
  return vadd(head.pos, qrot(head.rot, v3(0, NPC_CFG.FACE_UP, NPC_CFG.FACE_FWD)));
}

// Standing pose in front of the participant. extraDist = 0 -> reach spot (fingertip reaches the
// face point with a slightly bent arm); extraDist > 0 -> that much farther (conversation distance).
function standPose(extraDist) {
  const p = participant(); if (!p) return null;
  const head = headOf(p); if (!head) return null;
  const rest = restGeom(); if (!rest) return null;
  const root = p.getPosition() || v3(head.pos.x, head.pos.y - 1.5, head.pos.z);
  const reachTotal = (rest.L1 + rest.L2 + NPC_CFG.FINGER_LEN) * NPC_CFG.STAND_FACTOR;
  const shoulderY = rest.sR.y + root.y;
  const dy = (head.pos.y + NPC_CFG.FACE_UP) - shoulderY;
  const horizShoulderToFace = Math.sqrt(Math.max(0, reachTotal * reachTotal - dy * dy));
  const lateral = Math.abs(rest.sR.x);
  const fwdShoulderToFace = Math.sqrt(Math.max(0, horizShoulderToFace * horizShoulderToFace - lateral * lateral));
  const horiz = Math.max(NPC_CFG.MIN_STAND_DIST, fwdShoulderToFace + NPC_CFG.FACE_FWD) + (extraDist || 0);
  const pfwd = vhoriz(head.fwd);
  const pos = v3(head.pos.x + pfwd.x * horiz, root.y, head.pos.z + pfwd.z * horiz);
  const faceDir = vhoriz(vsub(head.pos, pos));
  const rot = qfromTo(rest.fwd, faceDir);
  return { pos: pos, rot: rot, horiz: horiz, dy: dy };
}
function moveToStand(extraDist, glide) {
  const sp = standPose(extraDist);
  if (!sp) return false;
  if (glide) {
    const ip = itemPose();
    $.state.npc_glide = { fromPos: ip.pos, fromRot: ip.rot, toPos: sp.pos, toRot: sp.rot, t: 0 };
  } else {
    $.state.npc_glide = null;
    $.setPosition(sp.pos);
    $.setRotation(sp.rot);
  }
  $.log("[NPC] stand " + f3(sp.horiz) + " m in front (dy=" + f3(sp.dy) + ", glide=" + !!glide + ")");
  return true;
}

// ---------------------------------------------------------------- greeting period
function beginGreeting() {
  $.state.npc_mode = "greeting";
  $.state.npc_greetStartTs = Date.now();
  $.state.npc_gGaze = 0; $.state.npc_gHand = 0; $.state.npc_gWaves = 0; $.state.npc_smiles = 0;
  $.state.npc_gazeAligned = false;
  $.state.npc_handUp = false;
  $.state.npc_lastWave = 0;
  $.state.npc_nextSmile = nowSec() + 1.0 + Math.random() * 2.0;
  $.log("[NPC] greeting begin social=" + $.state.npc_social);
}
function endGreeting() {
  if ($.state.npc_mode !== "greeting") return;
  $.state.npc_mode = "none";
  pushData({
    greetSec: (Date.now() - ($.state.npc_greetStartTs || Date.now())) / 1000,
    greetGazeEvents: $.state.npc_gGaze || 0,
    greetHandRaises: $.state.npc_gHand || 0,
    greetNpcWaves: $.state.npc_gWaves || 0,
    greetNpcSmiles: $.state.npc_smiles || 0,
  });
  $.log("[NPC] greeting end: gaze=" + ($.state.npc_gGaze || 0) + " hands=" + ($.state.npc_gHand || 0) + " waves=" + ($.state.npc_gWaves || 0));
}
// Start a reactive wave (nod + left-hand wave) if not already waving and the cooldown has passed.
function reactWave() {
  const t = nowSec();
  if ($.state.npc_greet) return false;
  if (t - ($.state.npc_lastWave || 0) < NPC_CFG.WAVE_COOLDOWN_SEC) return false;
  $.state.npc_lastWave = t;
  $.state.npc_greet = { t: 0 };
  $.state.npc_gWaves = ($.state.npc_gWaves || 0) + 1;
  smile();
  return true;
}
// Detect the participant's social signals (gaze alignment, raised hand) with hysteresis / edges.
function detectParticipantSignals(p, head, rest, ip) {
  const npcHeadW = toWorld(rest.head, ip);
  const toNpc = vnorm(vsub(npcHeadW, head.pos));
  const ang = Math.acos(Math.max(-1, Math.min(1, vdot(vnorm(head.fwd), toNpc)))) * 180 / Math.PI;
  let gazeEdge = false;
  if (!$.state.npc_gazeAligned && ang < NPC_CFG.LOOK_AT_DEG) { $.state.npc_gazeAligned = true; gazeEdge = true; }
  else if ($.state.npc_gazeAligned && ang > NPC_CFG.LOOK_AWAY_DEG) { $.state.npc_gazeAligned = false; }

  const lh = p.getHumanoidBonePosition(HumanoidBone.LeftHand);
  const rh = p.getHumanoidBonePosition(HumanoidBone.RightHand);
  const th = head.pos.y - NPC_CFG.HAND_RAISE_OFFSET;
  const up = !!((lh && lh.y > th) || (rh && rh.y > th));
  let handEdge = false;
  if (up && !$.state.npc_handUp) { $.state.npc_handUp = true; handEdge = true; }
  else if (!up && $.state.npc_handUp) { $.state.npc_handUp = false; }
  return { gazeEdge: gazeEdge, handEdge: handEdge, aligned: $.state.npc_gazeAligned, handUp: up };
}

// ---------------------------------------------------------------- trial control
function startTrial() {
  const rest = restGeom();
  if (!rest) { $.log("[NPC] rest geometry not ready; trial start deferred"); $.state.npc_pendingStart = true; return; }
  $.state.npc_pendingStart = false;
  moveToStand(0, true);                     // step closer to the reach spot during PREP
  $.state.npc_phase = "prep";
  $.state.npc_t = 0;
  $.state.npc_greet = null;
  $.state.npc_lookedAt = false;
  $.state.npc_lookTs = 0;
  $.state.npc_greeted = false;
  $.state.npc_trace = [];
  traceBuf = [];
  $.state.npc_trialStartTs = Date.now();
  $.log("[NPC] trial start " + JSON.stringify($.state.npc_trial || {}) + " social=" + $.state.npc_social);
}

let traceBuf = [];
let sampleTimer = 0;
let baseSamples = [];

function readyFingertip(rest) {
  return vadd(vadd(vadd(rest.sR, vscale(rest.fwd, NPC_CFG.READY_FWD)), vscale(UP, NPC_CFG.READY_UP)), vscale(rest.right, -NPC_CFG.READY_IN));
}

function beginApproach(head, rest, ip) {
  const H0 = readyFingertip(rest);  // local; the hand is already here after the READY phase
  const T = toLocal(facePointWorld(head), ip);
  const full = vlen(vsub(T, H0));
  const L = Math.max(0.02, full - NPC_CFG.STOP_MARGIN);
  $.state.npc_H0 = H0;
  $.state.npc_T = T;
  $.state.npc_L = L;
  $.state.npc_dir = vnorm(vsub(T, H0));
  $.state.npc_reachable = (vlen(vsub(T, rest.sR)) <= (rest.L1 + rest.L2 + NPC_CFG.FINGER_LEN));
  $.state.npc_phase = "approach";
  $.state.npc_t = 0;
  $.state.npc_reachStartTs = Date.now();
  $.state.npc_headPos0 = vcopy(head.pos);
  $.state.npc_headRot0 = head.rot.x + "," + head.rot.y + "," + head.rot.z + "," + head.rot.w;
  $.state.npc_contactTs = 0;
  $.state.npc_contactDist = -1;
  $.state.npc_base = null;
  $.state.npc_away = 0; $.state.npc_latMin = 0; $.state.npc_latMax = 0;
  $.state.npc_onsetDist = -1;
  $.state.npc_axisW = vhoriz(qrot(ip.rot, $.state.npc_dir));
  const H0w = toWorld(H0, ip), Tw = toWorld(T, ip);
  $.state.npc_H0w = f3(H0w.x) + "," + f3(H0w.y) + "," + f3(H0w.z);
  $.state.npc_Tw = f3(Tw.x) + "," + f3(Tw.y) + "," + f3(Tw.z);
  baseSamples = [];
  sampleTimer = 0;
  $.log("[NPC] approach: path=" + f3(L) + " m, duration=" + f3(L / NPC_CFG.REACH_SPEED) + " s, reachable=" + $.state.npc_reachable);
}

function finishTrial() {
  const traces = ($.state.npc_trace || []).concat(traceBuf);
  traceBuf = [];
  const tr = $.state.npc_trial || {};
  const data = {
    social: $.state.npc_social ? "with" : "without",
    npcBlock: tr.block !== undefined ? String(tr.block) : "",
    npcRep: tr.rep !== undefined ? String(tr.rep) : "",
    npcAvatar: tr.avatar !== undefined ? String(tr.avatar) : "",
    trialStartTs: $.state.npc_trialStartTs || 0,
    reachStartTs: $.state.npc_reachStartTs || 0,
    contactTs: $.state.npc_contactTs || 0,
    retractEndTs: Date.now(),
    pathLen: $.state.npc_L || 0,
    reachDur: ($.state.npc_contactTs && $.state.npc_reachStartTs) ? ($.state.npc_contactTs - $.state.npc_reachStartTs) / 1000 : 0,
    contactDist: $.state.npc_contactDist,
    reachable: !!$.state.npc_reachable,
    headPos0: $.state.npc_headPos0 ? (f3($.state.npc_headPos0.x) + "," + f3($.state.npc_headPos0.y) + "," + f3($.state.npc_headPos0.z)) : "",
    headRot0: $.state.npc_headRot0 || "",
    handStart: $.state.npc_H0w || "",   // fingertip world position at approach start
    faceTarget: $.state.npc_Tw || "",   // face target world position (fixed at approach start)
    traceFormat: "t,hx,hy,hz,hqx,hqy,hqz,hqw,d",
    retreatOnsetDist: $.state.npc_onsetDist,
    retreatDist: $.state.npc_away || 0,
    oscAmp: ($.state.npc_latMax || 0) - ($.state.npc_latMin || 0),
    lookedAtNpc: !!$.state.npc_lookedAt,
    lookTs: $.state.npc_lookTs || 0,
    greeted: !!$.state.npc_greeted,
    trace: traces.join(";"),
  };
  pushData(data);
  $.state.npc_trace = [];
  $.state.npc_phase = "idle";
  $.state.npc_t = 0;
  moveToStand(NPC_CFG.IDLE_EXTRA_DIST, true);   // step back to conversation distance
  $.sendSignalCompat("this", "npc_done");
  $.log("[NPC] trial done: samples=" + traces.length + " contactDist=" + f3(data.contactDist) + " retreat=" + f3(data.retreatDist));
}

function pushData(obj) {
  try {
    if ($.groupState) {
      const cd = $.groupState.collectedData || {};
      for (const k in obj) cd[k] = obj[k];
      $.groupState.collectedData = cd;
      return;
    }
  } catch (e) { $.log("[NPC] groupState write failed: " + e); }
  try {
    const h = $.worldItemReference("luida-data-collector");
    if (h) h.send("luida_collect", obj);
  } catch (e) { $.log("[NPC] luida_collect send failed: " + e); }
}

// ---------------------------------------------------------------- pose building
function idleArmDirs(rest) {
  const R = rest.right, F = rest.fwd, Lf = vscale(rest.right, -1);
  return {
    ru: vnorm(vadd(vadd(vscale(UP, -1.0), vscale(R, 0.22)), vscale(F, 0.05))),
    rl: vnorm(vadd(vadd(vscale(UP, -0.92), vscale(F, 0.30)), vscale(R, 0.12))),
    lu: vnorm(vadd(vadd(vscale(UP, -1.0), vscale(Lf, 0.22)), vscale(F, 0.05))),
    ll: vnorm(vadd(vadd(vscale(UP, -0.92), vscale(F, 0.30)), vscale(Lf, 0.12))),
  };
}
function fingertipFromDirs(S, L1, L2, upperDir, lowerDir) {
  const E = vadd(S, vscale(upperDir, L1));
  const W = vadd(E, vscale(lowerDir, L2));
  return vadd(W, vscale(lowerDir, NPC_CFG.FINGER_LEN));
}
// Two-bone IK for a wrist target W (local). Returns {upperDir, lowerDir}.
function solveArm(S, W, L1, L2, bendHint) {
  const toW = vsub(W, S);
  let d = vlen(toW);
  d = Math.max(0.03, Math.min(L1 + L2 - 0.002, d));
  const dir = vnorm(toW);
  let cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  cosA = Math.max(-1, Math.min(1, cosA));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  let perp = vsub(bendHint, vscale(dir, vdot(bendHint, dir)));
  if (vlen(perp) < 1e-4) perp = vcross(dir, UP);
  perp = vnorm(perp);
  const upperDir = vnorm(vadd(vscale(dir, cosA), vscale(perp, sinA)));
  const E = vadd(S, vscale(upperDir, L1));
  const lowerDir = vnorm(vsub(W, E));
  return { upperDir: upperDir, lowerDir: lowerDir, elbow: E };
}
// Arm directions so that the fingertip reaches F (local).
function armForFingertip(rest, F) {
  const hint = vnorm(vadd(vscale(UP, -0.8), vscale(rest.right, 0.6)));
  let lowerDir = vnorm(vsub(F, rest.sR));
  let sol = null;
  for (let i = 0; i < 2; i++) {
    const W = vsub(F, vscale(lowerDir, NPC_CFG.FINGER_LEN));
    sol = solveArm(rest.sR, W, rest.L1, rest.L2, hint);
    lowerDir = sol.lowerDir;
  }
  return sol;
}

function applyPose(Q) {
  const worldRots = {};
  for (let i = 0; i < boneNodes.length; i++) {
    const e = boneNodes[i];
    const q = Q[e.bone] || IDENT;
    worldRots[e.bone] = q;
    const parentQ = (e.parentBone === null || worldRots[e.parentBone] === undefined) ? IDENT : worldRots[e.parentBone];
    const desired = qmul(q, e.rest);
    const parent = qmul(parentQ, e.restParent);
    e.node.setRotation(qmul(qinv(parent), desired));
  }
}

// ---------------------------------------------------------------- per-frame
$.onUpdate((deltaTime) => {
  try { tick(deltaTime); } catch (e) { $.log("[NPC] tick error: " + e); }
});

function tick(dt) {
  if (boneNodes.length === 0) cacheBones();
  const rest = restGeom();
  if (!rest) return;                       // keep the model visible until the rest pose is measured

  // Visibility: hidden until shown (also re-applied after a script reload).
  if ($.state.npc_visibilityApplied !== !!$.state.npc_visible) applyVisibility();

  if ($.state.npc_pendingStart) { startTrial(); return; }

  // Glide to the target standing pose (position/rotation are networked, so keep it short).
  const g = $.state.npc_glide;
  if (g) {
    const t = clamp01((g.t || 0) + dt / NPC_CFG.GLIDE_SEC);
    const e = easeInOut(t);
    $.setPosition(vlerp(g.fromPos, g.toPos, e));
    $.setRotation(qslerp(g.fromRot, g.toRot, e));
    if (t >= 1) $.state.npc_glide = null; else { g.t = t; $.state.npc_glide = g; }
  }

  if (!$.state.npc_visible) return;        // nothing to animate while hidden

  const p = participant();
  const head = p ? headOf(p) : null;
  const ip = itemPose();
  const social = !!$.state.npc_social;
  const phase = $.state.npc_phase || "idle";
  const greeting = $.state.npc_mode === "greeting";
  let t = ($.state.npc_t || 0) + dt;
  $.state.npc_t = t;

  const Q = {};
  const R = rest.right, F = rest.fwd;

  // --- torso / idle motion (social only) ---
  if (social) {
    const breathe = Math.sin(2 * Math.PI * 0.25 * (Date.now() / 1000)) * 1.0;
    Q[HumanoidBone.Chest] = qaxis(R, breathe);
    if (phase === "approach" || phase === "hold") Q[HumanoidBone.Spine] = qaxis(R, 5);
  }

  // --- gaze (social only) ---
  if (social && head) {
    const npcHeadL = rest.head;
    const dir = vnorm(vsub(toLocal(head.pos, ip), npcHeadL));
    const qGazeFull = qclamp(qfromTo(F, dir), NPC_CFG.GAZE_MAX_DEG);
    const qNeck = qslerp(IDENT, qGazeFull, 0.3);
    const qHead = qslerp(IDENT, qGazeFull, 0.7);
    // eyes: look a bit further than the head, limited to 15 deg beyond it
    const extra = qmul(qinv(qHead), qGazeFull);
    const qEye = qmul(qHead, qclamp(extra, 15));
    Q[HumanoidBone.Neck] = qNeck;
    Q[HumanoidBone.Head] = qHead;
    Q[HumanoidBone.LeftEye] = qEye;
    Q[HumanoidBone.RightEye] = qEye;
  }

  // --- participant signals: greeting period (reactive), trial prep (logging + one greeting) ---
  if (head && (greeting || phase === "prep" || phase === "approach")) {
    const sig = detectParticipantSignals(p, head, rest, ip);
    if (greeting) {
      if (sig.gazeEdge) { $.state.npc_gGaze = ($.state.npc_gGaze || 0) + 1; if (social) reactWave(); }
      if (sig.handEdge) { $.state.npc_gHand = ($.state.npc_gHand || 0) + 1; if (social) reactWave(); }
      if (social && nowSec() >= ($.state.npc_nextSmile || 0)) {
        smile();
        $.state.npc_nextSmile = nowSec() + NPC_CFG.SMILE_MIN_SEC + Math.random() * (NPC_CFG.SMILE_MAX_SEC - NPC_CFG.SMILE_MIN_SEC);
      }
    } else if (sig.aligned && !$.state.npc_lookedAt) {
      $.state.npc_lookedAt = true;
      $.state.npc_lookTs = Date.now();
      if (social && phase === "prep" && !$.state.npc_greet) { $.state.npc_greet = { t: 0 }; $.state.npc_greeted = true; smile(); }
    }
  }

  // --- arms ---
  const idle = idleArmDirs(rest);
  let ru = idle.ru, rl = idle.rl, lu = idle.lu, ll = idle.ll;

  // greeting gesture (nod + left-hand wave), social only
  let nodDeg = 0;
  const greet = $.state.npc_greet;
  if (social && greet) {
    const gt = (greet.t || 0) + dt;
    const u = clamp01(gt / NPC_CFG.GREET_SEC);
    const lift = Math.sin(Math.PI * u);                 // 0 -> 1 -> 0
    const Lf = vscale(R, -1);
    const luRaised = vnorm(vadd(vadd(vscale(UP, -0.4), vscale(Lf, 0.75)), vscale(F, 0.2)));
    let llRaised = vnorm(vadd(vadd(vscale(UP, 0.85), vscale(F, 0.25)), vscale(Lf, 0.2)));
    llRaised = qrot(qaxis(F, 25 * Math.sin(2 * Math.PI * 2.5 * gt)), llRaised);
    lu = vnorm(vlerp(idle.lu, luRaised, lift));
    ll = vnorm(vlerp(idle.ll, llRaised, lift));
    nodDeg = 15 * Math.sin(Math.PI * clamp01(gt / 0.6));
    if (gt >= NPC_CFG.GREET_SEC) $.state.npc_greet = null; else { greet.t = gt; $.state.npc_greet = greet; }
  } else if (greet && !social) {
    $.state.npc_greet = null;
  }

  // --- phase machine for the right arm ---
  if (phase === "prep") {
    const greetBusy = social && $.state.npc_greet;
    if (t >= NPC_CFG.PREP_SEC && !greetBusy && head && !$.state.npc_glide) {
      // social: if the participant never looked, nod once before raising the hand
      if (social && !$.state.npc_greeted) { $.state.npc_greeted = true; $.state.npc_greet = { t: 0 }; }
      else { $.state.npc_phase = "ready"; $.state.npc_t = 0; }
    }
  } else if (phase === "ready") {
    // raise the hand from the idle pose to the ready position (fast; the stimulus starts afterwards)
    const Hidle = fingertipFromDirs(rest.sR, rest.L1, rest.L2, idle.ru, idle.rl);
    const u = easeInOut(t / NPC_CFG.READY_SEC);
    const sol = armForFingertip(rest, vlerp(Hidle, readyFingertip(rest), u));
    ru = sol.upperDir; rl = sol.lowerDir;
    if (t >= NPC_CFG.READY_SEC && head) beginApproach(head, rest, ip);
  } else if (phase === "approach") {
    const L = $.state.npc_L, dir = $.state.npc_dir, H0 = $.state.npc_H0;
    const s = Math.min(NPC_CFG.REACH_SPEED * t, L);
    const Ft = vadd(H0, vscale(dir, s));
    const sol = armForFingertip(rest, Ft);
    ru = sol.upperDir; rl = sol.lowerDir;
    const Fw = toWorld(fingertipFromDirs(rest.sR, rest.L1, rest.L2, ru, rl), ip);
    let d = -1;
    if (head) {
      d = vlen(vsub(Fw, facePointWorld(head)));
      sampleTrace(dt, t, head, Fw, d);
    }
    const reachedEnd = s >= L;
    const earlyContact = d >= 0 && d <= NPC_CFG.STOP_MARGIN;
    if (reachedEnd || earlyContact) {
      $.state.npc_contactTs = Date.now();
      $.state.npc_contactDist = d;
      $.state.npc_Fc = Ft;
      $.state.npc_phase = "hold";
      $.state.npc_t = 0;
      $.log("[NPC] contact: d=" + f3(d) + " early=" + earlyContact);
    }
  } else if (phase === "hold") {
    const Fc = $.state.npc_Fc || $.state.npc_T;
    const sol = armForFingertip(rest, Fc);
    ru = sol.upperDir; rl = sol.lowerDir;
    if (head) {
      const Fw = toWorld(fingertipFromDirs(rest.sR, rest.L1, rest.L2, ru, rl), ip);
      sampleTrace(dt, (NPC_CFG.REACH_SPEED > 0 ? ($.state.npc_L / NPC_CFG.REACH_SPEED) : 0) + t, head, Fw, vlen(vsub(Fw, facePointWorld(head))));
    }
    if (social) nodDeg = Math.max(nodDeg, 10 * Math.sin(Math.PI * clamp01(t / 1.0)));
    if (t >= NPC_CFG.HOLD_SEC) {
      $.state.npc_phase = "retract";
      $.state.npc_t = 0;
      $.state.npc_retractLen = vlen(vsub(Fc, $.state.npc_H0));
    }
  } else if (phase === "retract") {
    const Fc = $.state.npc_Fc || $.state.npc_T, H0 = $.state.npc_H0;
    const total = Math.max(0.01, $.state.npc_retractLen || vlen(vsub(Fc, H0)));
    const u = clamp01(NPC_CFG.RETRACT_SPEED * t / total);
    const Ft = vlerp(Fc, H0, easeInOut(u));
    const sol = armForFingertip(rest, Ft);
    // blend into the idle pose near the end so the arm settles naturally
    ru = vnorm(vlerp(sol.upperDir, idle.ru, u * u)); rl = vnorm(vlerp(sol.lowerDir, idle.rl, u * u));
    if (u >= 1) finishTrial();
  }

  // nod composes with gaze
  if (nodDeg !== 0) {
    const qNod = qaxis(R, nodDeg);
    Q[HumanoidBone.Head] = qmul(Q[HumanoidBone.Head] || IDENT, qNod);
  }

  Q[HumanoidBone.RightUpperArm] = qfromTo(rest.axisRU, ru);
  Q[HumanoidBone.RightLowerArm] = qfromTo(rest.axisRL, rl);
  Q[HumanoidBone.RightHand] = Q[HumanoidBone.RightLowerArm];
  Q[HumanoidBone.LeftUpperArm] = qfromTo(rest.axisLU, lu);
  Q[HumanoidBone.LeftLowerArm] = qfromTo(rest.axisLL, ll);
  Q[HumanoidBone.LeftHand] = Q[HumanoidBone.LeftLowerArm];

  applyPose(Q);
}

// 10 Hz head trace plus the in-world retreat estimate.
function sampleTrace(dt, t, head, Fw, d) {
  sampleTimer += dt;
  if (sampleTimer < NPC_CFG.SAMPLE_INTERVAL) return;
  sampleTimer = 0;
  const h = head.pos, r = head.rot;
  const total = ($.state.npc_trace || []).length + traceBuf.length;
  if (total < NPC_CFG.MAX_SAMPLES) {
    traceBuf.push([t.toFixed(1), f3(h.x), f3(h.y), f3(h.z), f3(r.x), f3(r.y), f3(r.z), f3(r.w), f3(d)].join(","));
  }
  if (traceBuf.length >= 10) {
    $.state.npc_trace = ($.state.npc_trace || []).concat(traceBuf);
    traceBuf = [];
  }
  // retreat / oscillation estimate (world frame)
  if (!$.state.npc_base) {
    baseSamples.push(vcopy(h));
    if (t >= 1.0) {
      let sum = v3(0, 0, 0);
      for (const b of baseSamples) sum = vadd(sum, b);
      $.state.npc_base = vscale(sum, 1 / Math.max(1, baseSamples.length));
    }
    return;
  }
  const axis = $.state.npc_axisW || v3(0, 0, 1);
  const delta = vsub(h, $.state.npc_base);
  const away = -vdot(delta, axis);
  const lateral = vdot(delta, vcross(axis, UP));
  if (away > ($.state.npc_away || 0)) $.state.npc_away = away;
  if (lateral < ($.state.npc_latMin || 0)) $.state.npc_latMin = lateral;
  if (lateral > ($.state.npc_latMax || 0)) $.state.npc_latMax = lateral;
  if ($.state.npc_onsetDist < 0 && away > NPC_CFG.RETREAT_THRESHOLD) $.state.npc_onsetDist = d;
}
