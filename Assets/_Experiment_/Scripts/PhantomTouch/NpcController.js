// ===== Study 4 NPC controller =====
// Runs on the NPC item (a LUIDA avatar wrapper built from a VRM, with AvatarSyncClone.js
// replaced by this script). Expects the generated NPC_BoneMap.js header to be prepended
// by LuidaScriptCombiner (BONE_MAP, BONE_PARENT, AVATAR_* constants).
//
// Messages (sent by the NpcDirector state-listening item):
//   "npc_setup"           { social, fwd, origin, floorY } -> remember the social-cue condition and the marker
//                                                  (standing spot, facing direction, floor height); clear the
//                                                  height matching of the previous block; NPC stays hidden
//   "npc_hide"            {}                    -> hide the body (avatar-switch phase)
//   "npc_show"            { social? }           -> match heights (platform under a shorter participant / riser under a
//                                                  shorter NPC), stand at conversation distance in front of the marker
//                                                  and show the body
//   "npc_greeting_begin"  { social? }           -> greeting period (social condition only): head gaze with body
//                                                  turn, surprised face when touched; answers the cues below
//   "npc_greet_cue"       { cue }               -> the participant has followed an instruction of the guided greeting
//                                                  (GreetingGuide item; cue = "hello" (sent before the first instruction:
//                                                  the NPC greets first) | "wave" | "lookAway" | "lookBack" | "move" |
//                                                  "lookAgain" | "center"): social condition only, react as GREET_REACTIONS says
//   "npc_greeting_end"    {}                    -> stop the greeting reactions, write greeting counters
//   "npc_trial_start"     { block, rep, avatar, social, fwd, reset } -> (reset: put the participant back on the
//                                                  marker, on their platform) -> (reappear at the conversation spot if
//                                                  hidden) -> turn to the participant and step closer -> prep -> raise hand
//                                                  -> approach (2 cm/s) -> stroke the face vertically (2 cm/s) -> hold
//                                                  -> retract -> step back to the conversation spot -> hide -> npc_done
//   "npc_abort"           {}                    -> step back and hide (no npc_done)
// Output:
//   item signal "npc_done" once the NPC has stepped back and hidden (a GlobalLogic on this item relays it to
//   the global signal "npc_done")
//   per-trial measurements merged into $.groupState.collectedData (this item is an ItemGroupMember)
//
// All pose math is done in the item-local frame of the NPC root, in the "normalized skeleton"
// convention used by Cluster (T-pose = identity). The same world->local retargeting formula as
// AvatarSyncClone.js is used to drive the bone sub-nodes.

const NPC_CFG = {
  REACH_SPEED: 0.02,       // m/s (thesis 6.2.3)
  PREP_SEC: 2.0,           // wait (and step closer) before the hand is raised
  READY_SEC: 1.2,          // raise the hand to the ready position (fast, not part of the stimulus)
  READY_FRAC: 0.35,        // ready palm point: this fraction of the way from the right shoulder to the face
                           // (the approach then extends the arm along the shoulder->face line)
  STROKE_AMP: 0.06,        // stroke: the fingers slide down the face by this much (m) at REACH_SPEED, then ...
  STROKE_BACK: 0.03,       //   ... return to the top along an arc that swings this far back from the face ...
  STROKE_CYCLES: 3,        //   ... this many times in total (0 disables the stroke)
  STROKE_RETURN_SPEED: 0.04, // speed along the return arc (m/s)
  STROKE_RAMP_SEC: 0.4,    // every leg of the stroke starts from rest and ends at rest: it accelerates for this long,
                           //   keeps the leg's speed, then decelerates for this long (a leg too short to reach the
                           //   speed accelerates half-way and decelerates); 0 = constant speed
  HOLD_SEC: 1.0,           // rest where the last stroke ended
  RETRACT_SPEED: 0.10,     // m/s
  STOP_MARGIN: 0.02,       // stop this far before the face surface
  // Touch target in the participant's head frame: a little above the eyes (close to the first-person camera, which
  // Cluster places at about the eyes), on the side the NPC's right hand comes from.
  ABOVE_EYES: 0.02,        //   height: the eye bones' midpoint plus this ...
  FACE_UP: 0.083,          //   ... or, for avatars without eye bones, head bone + this (the eye bones sit 6.2-6.4 cm
                           //   above the head bone on the project's VRoid models, so the same height there)
  USE_EYE_BONES: false,    //   query the eye bones at all? Cluster returns null for missing bones, but the editor
                           //   emulator (CSEmulator) throws a .NET exception that aborts the whole handler, so the
                           //   director turns this on only outside LUIDA's test mode (npc_setup { eyes })
  FACE_SIDE: 0.04,         //   toward the participant's left (0 = midline of the face)
  FACE_FWD: 0.09,          //   forward of the head bone (face surface)
  CONTACT_LEN: 0.12,       // wrist -> contact point along the fingers (finger pads) (m)
  PALM_OFF: 0.015,         // palm-side offset of the contact point along the palm normal (m)
  HAND_PITCH_DEG: 45,      // reaching hand: fingers this far above horizontal; palm turned toward the face
  SAMPLE_INTERVAL: 0.1,    // 10 Hz trace
  STAND_FACTOR: 0.93,      // usable fraction of (upper arm + forearm + finger) when choosing the reach spot
  MIN_STAND_DIST: 0.40,    // minimum horizontal root-to-head distance at the reach spot (m)
  IDLE_EXTRA_DIST: 0.45,   // conversation distance = reach distance + this (m)
  MAX_SAMPLES: 400,        // trace cap (10 Hz -> 40 s)
  GLIDE_SEC: 1.0,          // step closer / step back duration
  REAPPEAR_SEC: 0.5,       // 2nd trial of a block: shown at the conversation spot this long before stepping in
  RESET_SETTLE_SEC: 1.0,   // touch start: wait this long after putting the participant back on the marker
  HEIGHT_MATCH_MIN: 0.05,  // match heights only when the head-bone heights differ by at least this (m):
                           //   participant shorter -> platform under the participant (HeightPlatform item);
                           //   NPC shorter -> the NPC stands on its Riser sub-node
  HEIGHT_MEASURE_SEC: 3.0, // keep trying to read the participant's bones this long after npc_show
  // Guided greeting: the participant follows the GreetingGuide item's instructions one by one; each time it reports
  // one as done ("npc_greet_cue"), the NPC answers like this (social condition only; nothing otherwise). nod / wave:
  // the gesture, joy: smile while it lasts, turn: the whole body turns to face the participant. An answer with a wave
  // lasts WAVE_SEC, a nod alone NOD_SEC, a turn about 1 s (BODY_TURN_RATE). The guide waits for the answer to end
  // before its next instruction and before the touch, in both conditions: its GG_HELLO / GG_STEPS 'react' times
  // must not be shorter (tests/greeting-guide.test.mjs checks this).
  GREET_REACTIONS: {
    hello: { nod: true, wave: true, joy: true },       // before the first instruction: the NPC greets first
    wave: { nod: true, wave: true, joy: true },        // the participant waved: wave back, nodding and smiling
    lookBack: { nod: true, joy: true },                // looked away, then at the NPC again: nod and smile
    move: { turn: true },                              // stepped aside: turn to them (head and eyes follow anyway)
    lookAgain: { wave: true, joy: true },              // ... and looked at the NPC again: wave and smile
    center: { turn: true },                            // back on the marker, facing forward: turn to them again
  },
  PREP_REACTION: { nod: true, wave: true, joy: true }, // touch phase, before the hand is raised: greet once
  HEAD_MAX_DEG: 50,        // gaze: the head alone turns up to this angle ...
  EYE_EXTRA_DEG: 12,       // ... and the eyes a bit further
  BODY_TURN_START_DEG: 35, // greeting: if the participant is farther than this from the NPC's facing,
  BODY_TURN_STOP_DEG: 4,   //   the whole body turns toward them (lerp) until within this angle;
  BODY_TURN_RATE: 2.5,     //   exponential rate (1/s). The head's local rotation unwinds as the body turns.
  LOOK_AT_DEG: 30,         // participant "looks at" the NPC when head forward is within this angle
  LOOK_AWAY_DEG: 45,       // ... and stops when it exceeds this angle (hysteresis)
  HAND_RAISE_OFFSET: 0.10, // a hand counts as raised when above (head height - this)
  NOD_SEC: 0.8,            // nod-only reaction duration
  NOD_DEG: 15,
  WAVE_SEC: 1.6,           // reaction duration when it includes a wave
  TOUCH_COOLDOWN_SEC: 1.5, // surprised face when touched: minimum interval
  TOUCH_HAND_MARGIN: 0.06, // participant hand bone (wrist) -> fingers allowance (m)
  RETREAT_THRESHOLD: 0.02, // m, for the in-world retreat-onset estimate
  MODEL_NODE: "Model",     // sub-node holding the VRM model (toggled for visibility)
  JOY_KEY: "npc_joy",      // item Bool state -> Set Animator Value gimmick on the face mesh -> Animator Bool "joy"
  SURPRISED_KEY: "npc_surprised", // item signal -> gimmick -> Animator Trigger "surprised" (1 s clip)
                           // (Joy: Fcl_EYE_Joy=100, Fcl_MTH_Joy=50; Surprised: Fcl_EYE_Surprised=50, Fcl_MTH_Surprised=50)
  RISER_NODE: "Riser",     // 1 m cube under the NPC's feet (top at the feet); shown while the NPC is lifted
  PLATFORM_ITEM: "HeightPlatform", // world item reference: the platform under the participant's standing spot
};

const IDENT = new Quaternion(0, 0, 0, 1);
const UP = new Vector3(0, 1, 0);
// Right-hand finger bones in NPC_BoneMap.js: kept straight, i.e. given the hand's rotation every frame (applyPose
// gives a bone without a rotation the identity in the item frame, not its parent's).
const R_FINGER_BONES = [
  HumanoidBone.RightThumbProximal, HumanoidBone.RightThumbIntermediate, HumanoidBone.RightThumbDistal,
  HumanoidBone.RightIndexProximal, HumanoidBone.RightIndexIntermediate, HumanoidBone.RightIndexDistal,
  HumanoidBone.RightMiddleProximal, HumanoidBone.RightMiddleIntermediate, HumanoidBone.RightMiddleDistal,
  HumanoidBone.RightRingProximal, HumanoidBone.RightRingIntermediate, HumanoidBone.RightRingDistal,
  HumanoidBone.RightLittleProximal, HumanoidBone.RightLittleIntermediate, HumanoidBone.RightLittleDistal,
];

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
function hdist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }

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
function perpTo(v, axis) { const a = vnorm(axis); return vsub(v, vscale(a, vdot(v, a))); }
// Rotation that maps restAxis -> axis AND turns restRef (perpendicular to restAxis) as close as
// possible to ref (projected perpendicular to axis). This fixes the twist around the bone axis
// (e.g. which way the palm faces), which a minimal from-to rotation leaves undetermined.
function basisRot(restAxis, restRef, axis, ref) {
  const q1 = qfromTo(restAxis, axis);
  const a = vnorm(axis);
  const p1 = perpTo(qrot(q1, restRef), a);
  const p2 = perpTo(ref, a);
  if (vlen(p1) < 1e-4 || vlen(p2) < 1e-4) return q1;
  const u1 = vnorm(p1), u2 = vnorm(p2);
  const ang = Math.acos(Math.max(-1, Math.min(1, vdot(u1, u2)))) * 180 / Math.PI;
  const sign = vdot(vcross(u1, u2), a) < 0 ? -1 : 1;
  return qmul(qaxis(a, sign * ang), q1);
}
function slerpArm(a, b, t) { return { u: qslerp(a.u, b.u, t), l: qslerp(a.l, b.l, t), h: qslerp(a.h, b.h, t) }; }
function easeInOut(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function f3(x) { return (Math.round(x * 1000) / 1000).toString(); }
// Script clock (seconds), advanced in tick(); used for cooldowns. Data timestamps use Date.now().
function nowSec() { return $.state.npc_clock || 0; }

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
  applyRiser();
  $.state.npc_visibilityApplied = !!$.state.npc_visible;
}
function setVisible(v) {
  $.state.npc_visible = !!v;
  applyVisibility();
}
// Facial expressions: Cluster Script cannot write blend-shape weights, so the face mesh carries an Animator
// (clips NpcFaceNeutral / Joy / Surprised) driven by two CCK Set Animator Value gimmicks that listen to this
// item's state: Bool JOY_KEY -> Animator "joy", signal SURPRISED_KEY -> Animator trigger "surprised".
// Joy face on/off (held for the duration of a reaction).
function setJoy(on) {
  on = !!on;
  if (!!$.state.npc_joy === on) return;
  $.state.npc_joy = on;
  if (on) $.state.npc_smiles = ($.state.npc_smiles || 0) + 1;
  try { $.setStateCompat("this", NPC_CFG.JOY_KEY, on); } catch (e) { $.log("[NPC] setJoy: " + e); }
}
// Surprised face for 1 s (the clip length), then back to the previous face.
function surprise() {
  const t = nowSec();
  if (t - ($.state.npc_lastSurprise || 0) < NPC_CFG.TOUCH_COOLDOWN_SEC) return;
  $.state.npc_lastSurprise = t;
  $.state.npc_gTouch = ($.state.npc_gTouch || 0) + 1;
  try { $.sendSignalCompat("this", NPC_CFG.SURPRISED_KEY); } catch (e) { $.log("[NPC] surprise: " + e); }
}
function clearReaction() {
  $.state.npc_react = null;
  setJoy(false);
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
  $.state.npc_joy = false;
  try { $.setStateCompat("this", NPC_CFG.JOY_KEY, false); } catch (e) { /* no gimmick yet */ }
  cacheBones();
  $.log("[NPC] started, bones=" + boneNodes.length);
});

$.onReceive((messageType, arg, sender) => {
  try {
    if (arg && arg.fwd) $.state.npc_fwd = arg.fwd;   // facing direction of the participant's marker
    if (arg && arg.origin) $.state.npc_origin = arg.origin;   // the marker (participant standing spot, floor)
    if (arg && typeof arg.floorY === "number") $.state.npc_floorY = arg.floorY;
    if (arg && arg.eyes !== undefined) $.state.npc_useEyes = !!arg.eyes;   // may the eye bones be queried?
    if (messageType === "npc_setup") {
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      $.state.npc_phase = "idle";
      $.state.npc_t = 0;
      resetHeights();            // the participant's avatar (and so their height) changes in this block
      $.log("[NPC] setup social=" + $.state.npc_social);
    } else if (messageType === "npc_hide") {
      $.state.npc_mode = "none";
      $.state.npc_phase = "idle";
      $.state.npc_pendingStart = false;   // e.g. a session reset right after a trial start: stay hidden
      clearReaction();
      resetHeights();
      setVisible(false);
    } else if (messageType === "npc_show") {
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      $.state.npc_phase = "idle";
      $.state.npc_t = 0;
      beginHeightMatch();        // the participant wears this block's avatar now; retried in tick() if unreadable
      moveToStand(NPC_CFG.IDLE_EXTRA_DIST, false);
      setVisible(true);
      $.log("[NPC] shown social=" + $.state.npc_social);
    } else if (messageType === "npc_greeting_begin") {
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      if (!$.state.npc_visible) { moveToStand(NPC_CFG.IDLE_EXTRA_DIST, false); setVisible(true); }
      beginGreeting();
    } else if (messageType === "npc_greet_cue") {
      greetCue(arg ? arg.cue : "");
    } else if (messageType === "npc_greeting_end") {
      endGreeting();
    } else if (messageType === "npc_trial_start") {
      $.state.npc_trial = arg || {};
      if (arg && arg.social !== undefined) $.state.npc_social = !!arg.social;
      if ($.state.npc_mode === "greeting") endGreeting();
      // put the participant back on the marker (facing along it, on their platform), then wait a moment
      const reset = !!(arg && arg.reset) && resetParticipant(true);
      let delay = reset ? NPC_CFG.RESET_SETTLE_SEC : 0;
      if (!$.state.npc_visible) {
        // hidden since the previous trial: reappear at the conversation spot, then step in a moment later
        moveToStand(NPC_CFG.IDLE_EXTRA_DIST, false);
        setVisible(true);
        delay = Math.max(delay, NPC_CFG.REAPPEAR_SEC);
      }
      if (delay > 0) { $.state.npc_startDelay = delay; $.state.npc_pendingStart = true; }
      else startTrial();
    } else if (messageType === "npc_abort") {
      leave(false);
    }
  } catch (e) {
    $.log("[NPC] onReceive error: " + e);
  }
});

// ---------------------------------------------------------------- participant
function participant() {
  try {
    const ps = $.groupState ? $.groupState.participants : null;
    // An enrolled participant who left is not replaced by a bystander (for example the next person, who is
    // being asked by LUIDA whether they are a new participant): the trial stalls until the director's timeout
    // or the session reset. The nearby-player fallback is only for a world without enrolled participants.
    if (ps && ps.length > 0) return (ps[0] && ps[0].exists()) ? ps[0] : null;
  } catch (e) { /* not a group member */ }
  const near = $.getPlayersNear($.getPosition(), 50);
  return near && near.length > 0 ? near[0] : null;
}

function headOf(p) {
  const pos = p.getHumanoidBonePosition(HumanoidBone.Head);
  const rot = p.getHumanoidBoneRotation(HumanoidBone.Head);
  if (!pos || !rot) return null;
  // eye height in the head frame (null when the eye bones are not queried, missing or implausible)
  let eyeUp = null;
  const useEyes = ($.state.npc_useEyes === undefined || $.state.npc_useEyes === null) ? NPC_CFG.USE_EYE_BONES : $.state.npc_useEyes;
  if (useEyes) {
    const le = p.getHumanoidBonePosition(HumanoidBone.LeftEye), re = p.getHumanoidBonePosition(HumanoidBone.RightEye);
    const eye = (le && re) ? vscale(vadd(le, re), 0.5) : (le || re);
    if (eye) { const local = qrot(qinv(rot), vsub(eye, pos)); if (local.y > 0.02 && local.y < 0.2) eyeUp = local.y; }
  }
  return { pos: pos, rot: rot, fwd: qrot(rot, v3(0, 0, 1)), eyeUp: eyeUp };
}
// Height of the touch target above the head bone (head frame): just above the eyes when the avatar has eye bones.
function faceUp(head) {
  return (head.eyeUp !== null && head.eyeUp !== undefined) ? head.eyeUp + NPC_CFG.ABOVE_EYES : NPC_CFG.FACE_UP;
}
// Touch target: a little above the participant's eyes, FACE_SIDE toward their left (head local -x), FACE_FWD forward.
function facePointWorld(head) {
  return vadd(head.pos, qrot(head.rot, v3(-NPC_CFG.FACE_SIDE, faceUp(head), NPC_CFG.FACE_FWD)));
}

// Standing pose in front of the participant's marker. extraDist = 0 -> reach spot (the palm reaches the
// face point with a slightly bent arm); extraDist > 0 -> that much farther (conversation distance).
// Heights: the participant stands on the floor plus their platform, the NPC on the floor plus its riser.
function standPose(extraDist) {
  const p = participant(); if (!p) return null;
  const head = headOf(p); if (!head) return null;
  const rest = restGeom(); if (!rest) return null;
  const root = p.getPosition() || v3(head.pos.x, head.pos.y - 1.5, head.pos.z);
  const reach = (rest.L1 + rest.L2) * NPC_CFG.STAND_FACTOR;
  const platformH = $.state.npc_platformH || 0, lift = $.state.npc_lift || 0;
  const floorY = (typeof $.state.npc_floorY === "number") ? $.state.npc_floorY : root.y - platformH;
  const feetY = floorY + lift;
  const pHeadH = head.pos.y - root.y;      // the participant's own height, wherever they stand now
  const dy = (floorY + platformH + pHeadH + faceUp(head)) - (feetY + rest.sR.y);
  const lateral = Math.abs(vdot(rest.sR, rest.right));
  // Bisection on x = forward distance from the right shoulder to the face point, so that the
  // wrist needed at the stop position (palm STOP_MARGIN before the face) is `reach` from the shoulder.
  function wristDist(x) {
    const face = vadd(vadd(vscale(rest.right, -lateral), vscale(UP, dy)), vscale(rest.fwd, x));
    const d = vnorm(face);
    const F = vsub(face, vscale(d, NPC_CFG.STOP_MARGIN));
    return vlen(vsub(F, palmOffset(reachHandFrame(d))));
  }
  let lo = 0.05, hi = 1.5;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (wristDist(mid) < reach) lo = mid; else hi = mid; }
  const shoulderFwd = vdot(rest.sR, rest.fwd);
  const horiz = Math.max(NPC_CFG.MIN_STAND_DIST, lo + shoulderFwd + NPC_CFG.FACE_FWD) + (extraDist || 0);
  // in front of the marker along its facing direction (falls back to the participant's head and facing)
  const o = $.state.npc_origin;
  const bx = o ? o.x : head.pos.x, bz = o ? o.z : head.pos.z;
  const pfwd = $.state.npc_fwd ? vhoriz($.state.npc_fwd) : vhoriz(head.fwd);
  const pos = v3(bx + pfwd.x * horiz, feetY, bz + pfwd.z * horiz);
  const faceDir = vhoriz(vsub(v3(bx, 0, bz), v3(pos.x, 0, pos.z)));
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

// ---------------------------------------------------------------- height matching
// Head-bone heights are compared once the participant wears this block's avatar (npc_show). A participant
// shorter by HEIGHT_MATCH_MIN or more gets a platform under the marker (HeightPlatform item, message
// "platform_set" { h }); an NPC shorter by that much stands on its Riser sub-node. Cleared at the next setup.
function resetHeights() {
  $.state.npc_platformH = 0;
  $.state.npc_lift = 0;
  $.state.npc_heightPending = false;
  sendPlatform(0);
  applyRiser();
}
function sendPlatform(h) {
  try { const it = $.worldItemReference(NPC_CFG.PLATFORM_ITEM); if (it) it.send("platform_set", { h: h }); }
  catch (e) { $.log("[NPC] platform_set failed: " + e); }
}
function applyRiser() {
  const r = $.subNode(NPC_CFG.RISER_NODE);
  if (!r) return;
  try { r.setEnabled(!!$.state.npc_visible && ($.state.npc_lift || 0) > 0); } catch (e) { $.log("[NPC] riser: " + e); }
}
// Head-bone height above the feet, or null while the avatar's bones are not readable.
function participantHeight(p) {
  const head = p.getHumanoidBonePosition(HumanoidBone.Head);
  const root = p.getPosition();
  if (!head || !root) return null;
  const h = head.y - root.y;
  return h > 0.5 ? h : null;
}
function beginHeightMatch() {
  $.state.npc_heightPending = true;
  $.state.npc_heightDeadline = nowSec() + NPC_CFG.HEIGHT_MEASURE_SEC;
  tryHeightMatch();
}
function tryHeightMatch() {
  if (!$.state.npc_heightPending) return;
  const rest = restGeom();
  const p = participant();
  const pHeadH = (rest && p) ? participantHeight(p) : null;
  if (pHeadH === null) {
    if (nowSec() < ($.state.npc_heightDeadline || 0)) return;
    $.state.npc_heightPending = false;
    $.log("[NPC] height match skipped: participant bones not readable");
    return;
  }
  $.state.npc_heightPending = false;
  const diff = rest.head.y - pHeadH;          // > 0: the participant is shorter
  const platformH = diff >= NPC_CFG.HEIGHT_MATCH_MIN ? diff : 0;
  const lift = -diff >= NPC_CFG.HEIGHT_MATCH_MIN ? -diff : 0;
  $.state.npc_platformH = platformH;
  $.state.npc_lift = lift;
  sendPlatform(platformH);
  applyRiser();
  if (platformH > 0) resetParticipant(false);   // lift the participant onto the platform (keeps their facing)
  if ($.state.npc_visible) moveToStand(NPC_CFG.IDLE_EXTRA_DIST, true);
  pushData({ participantHeadH: pHeadH, npcHeadH: rest.head.y, heightPlatform: platformH, npcLift: lift });
  $.log("[NPC] height match: participant head " + f3(pHeadH) + " m, NPC head " + f3(rest.head.y) +
        " m -> platform " + f3(platformH) + ", riser " + f3(lift));
}
// Put the participant on the marker (on their platform); withRotation also turns them to face along it.
function resetParticipant(withRotation) {
  const p = participant();
  const o = $.state.npc_origin;
  if (!p || !o) return false;
  try {
    p.setPosition(v3(o.x, o.y + ($.state.npc_platformH || 0), o.z));
    if (withRotation && $.state.npc_fwd) p.setRotation(qaxis(UP, Math.atan2($.state.npc_fwd.x, $.state.npc_fwd.z) * 180 / Math.PI));
    return true;
  } catch (e) { $.log("[NPC] resetParticipant failed: " + e); return false; }
}

// ---------------------------------------------------------------- greeting period
function beginGreeting() {
  $.state.npc_mode = "greeting";
  $.state.npc_greetStartTs = Date.now();
  $.state.npc_gGaze = 0; $.state.npc_gHand = 0; $.state.npc_gWaves = 0; $.state.npc_gNods = 0;
  $.state.npc_gReact = 0; $.state.npc_smiles = 0; $.state.npc_gTouch = 0; $.state.npc_gCues = 0;
  $.state.npc_gazeAligned = false;
  $.state.npc_handUp = false;
  $.state.npc_touching = false;
  $.state.npc_bodyTurning = false;
  $.state.npc_turnCueAt = null;
  clearReaction();
  $.log("[NPC] greeting begin social=" + $.state.npc_social);
}
function endGreeting() {
  if ($.state.npc_mode !== "greeting") return;
  $.state.npc_mode = "none";
  $.state.npc_bodyTurning = false;
  pushData({
    greetSec: (Date.now() - ($.state.npc_greetStartTs || Date.now())) / 1000,
    greetGazeEvents: $.state.npc_gGaze || 0,
    greetHandRaises: $.state.npc_gHand || 0,
    greetCues: $.state.npc_gCues || 0,
    greetNpcReactions: $.state.npc_gReact || 0,
    greetNpcNods: $.state.npc_gNods || 0,
    greetNpcWaves: $.state.npc_gWaves || 0,
    greetNpcSmiles: $.state.npc_smiles || 0,
    greetTouches: $.state.npc_gTouch || 0,
  });
  $.log("[NPC] greeting end: gaze=" + ($.state.npc_gGaze || 0) + " hands=" + ($.state.npc_gHand || 0) +
        " cues=" + ($.state.npc_gCues || 0) + " reactions=" + ($.state.npc_gReact || 0) + " touches=" + ($.state.npc_gTouch || 0));
}
// The participant has followed an instruction of the guided greeting: answer it (social condition only).
function greetCue(cue) {
  if ($.state.npc_mode !== "greeting") return;
  $.state.npc_gCues = ($.state.npc_gCues || 0) + 1;
  const r = $.state.npc_social ? NPC_CFG.GREET_REACTIONS[cue] : null;
  $.log("[NPC] greet cue " + cue + (r ? " -> " + JSON.stringify(r) : " (no reaction)"));
  if (!r) return;
  if (r.turn) { $.state.npc_bodyTurning = true; $.state.npc_turnCueAt = nowSec(); $.state.npc_turnCue = cue; }
  if (r.nod || r.wave) startReaction(r, cue);
}
// Start a reaction r = { nod, wave, joy }: nod and / or left-hand wave, smiling while it lasts when joy is set (the
// face returns to neutral when the reaction ends). Replaces a reaction that is still running. name: for the log.
function startReaction(r, name) {
  $.state.npc_react = { t: 0, nod: !!r.nod, wave: !!r.wave, dur: r.wave ? NPC_CFG.WAVE_SEC : NPC_CFG.NOD_SEC, name: name || "" };
  $.state.npc_gReact = ($.state.npc_gReact || 0) + 1;
  if (r.nod) $.state.npc_gNods = ($.state.npc_gNods || 0) + 1;
  if (r.wave) $.state.npc_gWaves = ($.state.npc_gWaves || 0) + 1;
  setJoy(!!r.joy);
}
// Rotate the whole body toward the participant when they are too far to the side, or when a greeting cue asked for
// it (npc_bodyTurning), until it faces them (greeting only).
function turnBodyToward(head, rest, ip, dt) {
  const faceDir = vhoriz(vsub(head.pos, ip.pos));
  const curFwd = vhoriz(qrot(ip.rot, rest.fwd));
  const cosA = Math.max(-1, Math.min(1, vdot(curFwd, faceDir)));
  const ang = Math.acos(cosA) * 180 / Math.PI;
  if (!$.state.npc_bodyTurning && ang > NPC_CFG.BODY_TURN_START_DEG) $.state.npc_bodyTurning = true;
  if (!$.state.npc_bodyTurning) return ip;
  if (ang < NPC_CFG.BODY_TURN_STOP_DEG) {
    $.state.npc_bodyTurning = false;
    if ($.state.npc_turnCueAt !== null && $.state.npc_turnCueAt !== undefined) {
      $.log("[NPC] reaction " + ($.state.npc_turnCue || "?") + " (turn) ended after " + f3(nowSec() - $.state.npc_turnCueAt) + " s");
      $.state.npc_turnCueAt = null;
    }
    return ip;
  }
  const yaw = cosA < -0.999 ? qaxis(UP, 180) : qfromTo(curFwd, faceDir);
  const target = qmul(yaw, ip.rot);
  const rot = qslerp(ip.rot, target, 1 - Math.exp(-NPC_CFG.BODY_TURN_RATE * dt));
  $.setRotation(rot);
  return { pos: ip.pos, rot: rot };
}
// Participant hand(s) touching the NPC's head / torso / arms (edge-triggered).
function detectTouch(p, rest, ip) {
  const hands = [p.getHumanoidBonePosition(HumanoidBone.LeftHand), p.getHumanoidBonePosition(HumanoidBone.RightHand)];
  const parts = [
    { bone: HumanoidBone.Head, up: 0.07, r: 0.13 },
    { bone: HumanoidBone.Chest, up: 0.0, r: 0.17 },
    { bone: HumanoidBone.Hips, up: 0.0, r: 0.16 },
    { bone: HumanoidBone.LeftUpperArm, up: 0.0, r: 0.07 },
    { bone: HumanoidBone.RightUpperArm, up: 0.0, r: 0.07 },
    { bone: HumanoidBone.LeftLowerArm, up: 0.0, r: 0.06 },
    { bone: HumanoidBone.RightLowerArm, up: 0.0, r: 0.06 },
  ];
  let touching = false;
  for (const part of parts) {
    const info = nodeByBone[part.bone];
    if (!info) continue;
    const gp = info.node.getGlobalPosition();
    if (!gp) continue;
    const c = vadd(gp, vscale(UP, part.up));
    for (const h of hands) {
      if (h && vlen(vsub(h, c)) < part.r + NPC_CFG.TOUCH_HAND_MARGIN) { touching = true; break; }
    }
    if (touching) break;
  }
  const edge = touching && !$.state.npc_touching;
  $.state.npc_touching = touching;
  return edge;
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
  clearReaction();
  $.state.npc_bodyTurning = false;
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
let baseRootSamples = [];

// Ready palm point on the shoulder->face line (local). T = face target (local).
function readyContact(rest, T) {
  return vadd(rest.sR, vscale(vsub(T, rest.sR), NPC_CFG.READY_FRAC));
}

function beginApproach(head, rest, ip) {
  const T = toLocal(facePointWorld(head), ip);
  const H0 = readyContact(rest, T);  // local palm point; the hand is already here after the READY phase
  const full = vlen(vsub(T, H0));
  const L = Math.max(0.02, full - NPC_CFG.STOP_MARGIN);
  $.state.npc_H0 = H0;
  $.state.npc_T = T;
  $.state.npc_L = L;
  $.state.npc_dir = vnorm(vsub(T, H0));
  const frame = reachHandFrame($.state.npc_dir);
  $.state.npc_frame = frame;    // hand orientation is kept fixed during the approach
  const Wend = vsub(vsub(T, vscale($.state.npc_dir, NPC_CFG.STOP_MARGIN)), palmOffset(frame));
  $.state.npc_reachable = vlen(vsub(Wend, rest.sR)) <= (rest.L1 + rest.L2);
  $.state.npc_phase = "approach";
  $.state.npc_t = 0;
  $.state.npc_reachStartTs = Date.now();
  $.state.npc_headPos0 = vcopy(head.pos);
  $.state.npc_headRot0 = head.rot.x + "," + head.rot.y + "," + head.rot.z + "," + head.rot.w;
  $.state.npc_contactTs = 0;
  $.state.npc_contactDist = -1;
  $.state.npc_contactT = 0;
  $.state.npc_strokeEndTs = 0;
  $.state.npc_base = null;
  $.state.npc_away = 0; $.state.npc_latMin = 0; $.state.npc_latMax = 0;
  $.state.npc_onsetDist = -1;
  // the participant's avatar position: moved by the stick (NpcDirector's slow touch rate), not by leaning
  const p = participant();
  const root = p ? p.getPosition() : null;
  const o = $.state.npc_origin;
  $.state.npc_rootStart = root ? f3(root.x) + "," + f3(root.y) + "," + f3(root.z) : "";
  $.state.npc_rootShiftPre = (root && o) ? hdist(root, o) : -1;   // moved off the marker before the reach began
  $.state.npc_rootBase = null; $.state.npc_rootAway = 0;
  baseRootSamples = [];
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
  const pEnd = participant();
  const rootEnd = pEnd ? pEnd.getPosition() : null;
  const o = $.state.npc_origin;
  const data = {
    social: $.state.npc_social ? "with" : "without",
    npcBlock: tr.block !== undefined ? String(tr.block) : "",
    npcRep: tr.rep !== undefined ? String(tr.rep) : "",
    npcAvatar: tr.avatar !== undefined ? String(tr.avatar) : "",
    trialStartTs: $.state.npc_trialStartTs || 0,
    reachStartTs: $.state.npc_reachStartTs || 0,
    contactTs: $.state.npc_contactTs || 0,
    strokeEndTs: $.state.npc_strokeEndTs || 0,
    strokeAmp: NPC_CFG.STROKE_AMP,
    strokeBack: NPC_CFG.STROKE_BACK,
    strokeCycles: NPC_CFG.STROKE_CYCLES,
    strokeReturnSpeed: NPC_CFG.STROKE_RETURN_SPEED,
    strokeRampSec: NPC_CFG.STROKE_RAMP_SEC,
    heightPlatform: $.state.npc_platformH || 0,
    npcLift: $.state.npc_lift || 0,
    retractEndTs: Date.now(),
    pathLen: $.state.npc_L || 0,
    reachDur: ($.state.npc_contactTs && $.state.npc_reachStartTs) ? ($.state.npc_contactTs - $.state.npc_reachStartTs) / 1000 : 0,
    contactDist: $.state.npc_contactDist,
    reachable: !!$.state.npc_reachable,
    headPos0: $.state.npc_headPos0 ? (f3($.state.npc_headPos0.x) + "," + f3($.state.npc_headPos0.y) + "," + f3($.state.npc_headPos0.z)) : "",
    headRot0: $.state.npc_headRot0 || "",
    handStart: $.state.npc_H0w || "",   // fingertip world position at approach start
    faceTarget: $.state.npc_Tw || "",   // face target world position (fixed at approach start)
    traceFormat: "t,hx,hy,hz,hqx,hqy,hqz,hqw,d,rx,ry,rz",   // r = avatar position (moved by the stick)
    retreatOnsetDist: $.state.npc_onsetDist,
    retreatDist: $.state.npc_away || 0,
    oscAmp: ($.state.npc_latMax || 0) - ($.state.npc_latMin || 0),
    rootStart: $.state.npc_rootStart || "",              // avatar position at approach start
    rootShiftPre: (typeof $.state.npc_rootShiftPre === "number") ? $.state.npc_rootShiftPre : -1,  // off the marker then (m)
    rootRetreat: $.state.npc_rootAway || 0,              // like retreatDist, for the avatar position
    rootShiftEnd: (rootEnd && o) ? hdist(rootEnd, o) : -1, // off the marker at the end of the retract (m)
    lookedAtNpc: !!$.state.npc_lookedAt,
    lookTs: $.state.npc_lookTs || 0,
    greeted: !!$.state.npc_greeted,
    trace: traces.join(";"),
  };
  pushData(data);
  $.state.npc_trace = [];
  $.log("[NPC] trial done: samples=" + traces.length + " contactDist=" + f3(data.contactDist) + " retreat=" + f3(data.retreatDist) +
        " rootRetreat=" + f3(data.rootRetreat) + " rootShiftPre=" + f3(data.rootShiftPre) + " rootShiftEnd=" + f3(data.rootShiftEnd));
  leave(true);
}

// Touch end, once the NPC has gone: put every participant back on the marker (on their platform, keeping their
// facing), however little they moved. The stick moves them slowly during the touch (NpcDirector), so they can back
// away from the hand, and it is off again in the report that follows.
function returnParticipant() {
  const p = participant(), o = $.state.npc_origin;
  if (!p || !o) { pushData({ returnedToMarker: false }); return; }
  const root = p.getPosition();
  const back = resetParticipant(false);
  pushData({ returnedToMarker: back });
  $.log("[NPC] participant " + (back ? "put back on the marker" : "could not be put back on the marker") +
        (root ? " (was " + f3(hdist(root, o)) + " m away)" : ""));
}

// Step back to the conversation spot, then disappear (tick); with signalDone, "npc_done" is sent once hidden.
function leave(signalDone) {
  $.state.npc_pendingStart = false;
  $.state.npc_phase = "leave";
  $.state.npc_t = 0;
  $.state.npc_leaveSignal = !!signalDone;
  clearReaction();
  if (!$.state.npc_visible || !moveToStand(NPC_CFG.IDLE_EXTRA_DIST, true)) $.state.npc_glide = null;
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
// Arm description (item-local directions): upper = shoulder->elbow, lower = elbow->wrist,
// hand = wrist->fingers, palm = palm normal. Rest (T-pose, VRM convention): arms horizontal,
// palms facing down, elbows flexing forward.
const PALM_DOWN = new Vector3(0, -1, 0);

function armRots(rest, side, arm) {
  const restU = side === "R" ? rest.axisRU : rest.axisLU;
  const restL = side === "R" ? rest.axisRL : rest.axisLL;
  return {
    u: basisRot(restU, rest.fwd, arm.upper, arm.lower),   // elbow bends toward the forearm
    l: basisRot(restL, PALM_DOWN, arm.lower, arm.palm),   // forearm twist follows the palm
    h: basisRot(restL, PALM_DOWN, arm.hand, arm.palm),    // hand: fingers + palm direction
  };
}
// Relaxed arm hanging at the side, palm facing the thigh (toward the body midline).
function idleArm(rest, side) {
  const R = vscale(rest.right, side === "R" ? 1 : -1), F = rest.fwd;
  const lower = vnorm(vadd(vadd(vscale(UP, -0.92), vscale(F, 0.30)), vscale(R, 0.12)));
  return {
    upper: vnorm(vadd(vadd(vscale(UP, -1.0), vscale(R, 0.22)), vscale(F, 0.05))),
    lower: lower,
    hand: lower,
    palm: vscale(R, -1),
  };
}
// Left arm raised for waving: forearm up (oscillating sideways), palm facing the participant.
function waveArm(rest, gt) {
  const Lf = vscale(rest.right, -1), F = rest.fwd;
  const upper = vnorm(vadd(vadd(vscale(UP, -0.4), vscale(Lf, 0.75)), vscale(F, 0.2)));
  let lower = vnorm(vadd(vadd(vscale(UP, 0.85), vscale(F, 0.25)), vscale(Lf, 0.2)));
  lower = qrot(qaxis(F, 25 * Math.sin(2 * Math.PI * 2.5 * gt)), lower);
  return { upper: upper, lower: lower, hand: lower, palm: F };
}
// Reaching hand: fingers HAND_PITCH_DEG above horizontal, in the vertical plane of the approach direction d;
// palm facing along d (toward the face). When the fingers point almost along d, the palm faces forward-down.
function reachHandFrame(d) {
  const dn = vnorm(d);
  const horiz = vhoriz(dn);
  const pitch = NPC_CFG.HAND_PITCH_DEG * Math.PI / 180;
  const h = vnorm(vadd(vscale(horiz, Math.cos(pitch)), vscale(UP, Math.sin(pitch))));
  let n = perpTo(dn, h);
  if (vlen(n) < 0.2) n = perpTo(vsub(horiz, UP), h);
  return { h: h, n: vnorm(n) };
}
// Wrist -> contact point (finger pads).
function palmOffset(frame) {
  return vadd(vscale(frame.h, NPC_CFG.CONTACT_LEN), vscale(frame.n, NPC_CFG.PALM_OFF));
}
// Right arm placing the palm contact point at F (local) with the given hand frame.
function reachArm(rest, F, frame) {
  const W = vsub(F, palmOffset(frame));
  const hint = vnorm(vadd(vscale(UP, -0.8), vscale(rest.right, 0.6)));
  const sol = solveArm(rest.sR, W, rest.L1, rest.L2, hint);
  return { upper: sol.upperDir, lower: sol.lowerDir, hand: frame.h, palm: frame.n, frame: frame };
}
// Time to travel a leg of length L from rest to rest: accelerate for r seconds to the speed v, decelerate for r.
function legDuration(L, v, r) {
  v = Math.max(1e-3, v);
  if (!(r > 0)) return L / v;
  return L >= v * r ? L / v + r : 2 * Math.sqrt(L * r / v);
}
// Distance covered t seconds into such a leg.
function legDistance(L, v, r, t) {
  v = Math.max(1e-3, v);
  const T = legDuration(L, v, r);
  if (t <= 0) return 0;
  if (t >= T) return L;
  if (!(r > 0)) return v * t;
  const a = v / r, ta = Math.min(r, T / 2);
  if (t < ta) return 0.5 * a * t * t;
  if (t > T - ta) { const u = T - t; return L - 0.5 * a * u * u; }
  return 0.5 * a * ta * ta + a * ta * (t - ta);
}
// Stroke after contact (local coordinates). Each cycle: slide down the face by STROKE_AMP at REACH_SPEED (a straight
// leg, in contact), then return to the top along one smooth arc at STROKE_RETURN_SPEED: half an ellipse that leaves
// the face at the bottom, swings out to STROKE_BACK from it (back along the approach direction dir) half-way up, and
// comes back onto the face at the top. The last cycle ends at the bottom of its down-stroke. Each leg starts and ends at
// rest (legDuration / legDistance along its length). Returns the legs with their start times, and the total time.
const STROKE_ARC_STEPS = 24;       // samples of the return arc for its length (arc-length parametrisation)
function strokeArcPoint(leg, th) {  // th: 0 (bottom, leg.a) -> PI (top, leg.b)
  return vadd(vadd(leg.c, vscale(leg.hv, -Math.cos(th))), vscale(leg.out, Math.sin(th)));
}
function strokePath(Fc, dir) {
  const A = NPC_CFG.STROKE_AMP, B = NPC_CFG.STROKE_BACK, N = NPC_CFG.STROKE_CYCLES;
  const vs = NPC_CFG.REACH_SPEED, vr = NPC_CFG.STROKE_RETURN_SPEED;
  const ramp = NPC_CFG.STROKE_RAMP_SEC;
  const legs = [];
  if (!(A > 0) || !(N > 0) || !(vs > 0)) return { start: Fc, legs: legs, total: 0 };
  const down = vscale(UP, -A), out = vscale(vnorm(dir), -Math.max(0, B));
  let p = Fc, t = 0;
  function add(leg) { leg.t0 = t; t += legDuration(leg.L, leg.v, ramp); legs.push(leg); p = leg.b; }
  for (let k = 0; k < N; k++) {
    const bottom = vadd(p, down);
    add({ a: p, b: bottom, v: vs, L: A });       // stroke down, in contact
    if (k < N - 1 && vr > 0) {
      // back up to where this stroke started, along the arc
      const top = vsub(p, down);
      const leg = { a: p, b: top, v: vr, arc: true, c: vlerp(p, top, 0.5), hv: vscale(vsub(top, p), 0.5), out: out, cum: [0] };
      let q = p, len = 0;
      for (let i = 1; i <= STROKE_ARC_STEPS; i++) {
        const r = strokeArcPoint(leg, Math.PI * i / STROKE_ARC_STEPS);
        len += vlen(vsub(r, q)); q = r; leg.cum.push(len);
      }
      leg.L = len;
      add(leg);
    }
  }
  return { start: Fc, legs: legs, total: t };
}
// Position on the stroke path t seconds after contact.
function strokePoint(path, t) {
  const legs = path.legs;
  if (t <= 0 || legs.length === 0) return path.start;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const T = legDuration(leg.L, leg.v, NPC_CFG.STROKE_RAMP_SEC);
    if (t > leg.t0 + T) continue;
    const dist = legDistance(leg.L, leg.v, NPC_CFG.STROKE_RAMP_SEC, t - leg.t0);
    if (!leg.arc) return vlerp(leg.a, leg.b, leg.L > 1e-6 ? dist / leg.L : 1);
    // arc: the sample interval that contains this distance, then the angle within it
    let j = 1;
    while (j < STROKE_ARC_STEPS && leg.cum[j] < dist) j++;
    const span = leg.cum[j] - leg.cum[j - 1];
    const f = span > 1e-9 ? (dist - leg.cum[j - 1]) / span : 0;
    return strokeArcPoint(leg, Math.PI * (j - 1 + f) / STROKE_ARC_STEPS);
  }
  return legs[legs.length - 1].b;
}
// Wrist and palm contact point of a solved right arm (accounts for IK clamping when out of reach).
function wristOf(rest, arm) {
  return vadd(vadd(rest.sR, vscale(arm.upper, rest.L1)), vscale(arm.lower, rest.L2));
}
function contactOf(rest, arm) {
  return vadd(wristOf(rest, arm), palmOffset(arm.frame));
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
  $.state.npc_clock = ($.state.npc_clock || 0) + dt;
  if (boneNodes.length === 0) cacheBones();
  const rest = restGeom();
  if (!rest) return;                       // keep the model visible until the rest pose is measured

  // Visibility: hidden until shown (also re-applied after a script reload).
  if ($.state.npc_visibilityApplied !== !!$.state.npc_visible) applyVisibility();

  if ($.state.npc_heightPending) tryHeightMatch();

  if ($.state.npc_pendingStart) {
    $.state.npc_startDelay = ($.state.npc_startDelay || 0) - dt;
    if ($.state.npc_startDelay > 0) return;
    startTrial();
    return;
  }

  // Glide to the target standing pose (position/rotation are networked, so keep it short).
  const g = $.state.npc_glide;
  if (g) {
    const t = clamp01((g.t || 0) + dt / NPC_CFG.GLIDE_SEC);
    const e = easeInOut(t);
    $.setPosition(vlerp(g.fromPos, g.toPos, e));
    $.setRotation(qslerp(g.fromRot, g.toRot, e));
    if (t >= 1) $.state.npc_glide = null; else { g.t = t; $.state.npc_glide = g; }
  }

  // Back at the conversation spot after a trial: disappear (out of the way of the report panel and the
  // questionnaires), then let the director move on.
  if ($.state.npc_phase === "leave" && !$.state.npc_glide) {
    $.state.npc_phase = "idle";
    $.state.npc_t = 0;
    setVisible(false);
    returnParticipant();
    if ($.state.npc_leaveSignal) $.sendSignalCompat("this", "npc_done");
    $.state.npc_leaveSignal = false;
    $.log("[NPC] back at the conversation spot; hidden");
    return;
  }

  if (!$.state.npc_visible) return;        // nothing to animate while hidden

  const p = participant();
  const head = p ? headOf(p) : null;
  const root = p ? p.getPosition() : null;   // avatar position, for the trace
  let ip = itemPose();
  const social = !!$.state.npc_social;
  const phase = $.state.npc_phase || "idle";
  const greeting = $.state.npc_mode === "greeting";
  if (greeting && social && head && !$.state.npc_glide) ip = turnBodyToward(head, restGeom(), ip, dt);
  let t = ($.state.npc_t || 0) + dt;
  $.state.npc_t = t;

  const Q = {};
  const R = rest.right, F = rest.fwd;

  // --- torso / idle motion (social only) ---
  if (social) {
    const breathe = Math.sin(2 * Math.PI * 0.25 * (Date.now() / 1000)) * 1.0;
    Q[HumanoidBone.Chest] = qaxis(R, breathe);
    if (phase === "approach" || phase === "stroke" || phase === "hold") Q[HumanoidBone.Spine] = qaxis(R, 5);
  }

  // --- gaze (social only): head (and eyes) only; large angles are taken up by the body turn above,
  //     which also unwinds the head's local rotation as the body comes around ---
  if (social && head) {
    const dir = vnorm(vsub(toLocal(head.pos, ip), rest.head));
    const qFull = qfromTo(F, dir);
    const qHead = qclamp(qFull, NPC_CFG.HEAD_MAX_DEG);
    const qEye = qmul(qHead, qclamp(qmul(qinv(qHead), qFull), NPC_CFG.EYE_EXTRA_DEG));
    Q[HumanoidBone.Head] = qHead;
    Q[HumanoidBone.LeftEye] = qEye;
    Q[HumanoidBone.RightEye] = qEye;
  }

  // --- participant signals: greeting period (counted), trial prep (logging + one greeting) ---
  if (head && (greeting || phase === "prep" || phase === "approach")) {
    const sig = detectParticipantSignals(p, head, rest, ip);
    if (greeting) {
      // counted only: the NPC's reactions follow the guided greeting's cues (greetCue)
      if (sig.gazeEdge) $.state.npc_gGaze = ($.state.npc_gGaze || 0) + 1;
      if (sig.handEdge) $.state.npc_gHand = ($.state.npc_gHand || 0) + 1;
      if (social && p && detectTouch(p, rest, ip)) surprise();
    } else if (sig.aligned && !$.state.npc_lookedAt) {
      $.state.npc_lookedAt = true;
      $.state.npc_lookTs = Date.now();
      if (social && phase === "prep" && !$.state.npc_react) { startReaction(NPC_CFG.PREP_REACTION, "prep"); $.state.npc_greeted = true; }
    }
  }

  // --- arms (bone rotations incl. twist, so the palms face the right way) ---
  const idleR = armRots(rest, "R", idleArm(rest, "R"));
  const idleL = armRots(rest, "L", idleArm(rest, "L"));
  let armR = idleR, armL = idleL;

  // reaction gesture (nod and/or left-hand wave with the palm toward the participant), social only
  let nodDeg = 0;
  const react = $.state.npc_react;
  if (social && react) {
    const rt = (react.t || 0) + dt;
    if (react.wave) {
      const lift = Math.sin(Math.PI * clamp01(rt / react.dur));     // 0 -> 1 -> 0
      armL = slerpArm(idleL, armRots(rest, "L", waveArm(rest, rt)), lift);
    }
    if (react.nod) {
      const nodSec = react.wave ? 0.6 : NPC_CFG.NOD_SEC;
      nodDeg = NPC_CFG.NOD_DEG * Math.sin(Math.PI * clamp01(rt / nodSec));
    }
    if (rt >= react.dur) {
      clearReaction();
      $.log("[NPC] reaction " + (react.name || "?") + " ended after " + f3(rt) + " s");
    } else { react.t = rt; $.state.npc_react = react; }
  } else if (react && !social) {
    clearReaction();
  }

  // --- phase machine for the right arm ---
  if (phase === "prep") {
    const greetBusy = social && $.state.npc_react;
    if (t >= NPC_CFG.PREP_SEC && !greetBusy && head && !$.state.npc_glide) {
      // social: if the participant never looked, greet once before raising the hand
      if (social && !$.state.npc_greeted) { $.state.npc_greeted = true; startReaction(NPC_CFG.PREP_REACTION, "prep"); }
      else { $.state.npc_phase = "ready"; $.state.npc_t = 0; }
    }
  } else if (phase === "ready") {
    // raise the hand from the idle pose to the ready position, palm already turned toward the
    // participant's face (fast; the stimulus starts afterwards)
    const T = head ? toLocal(facePointWorld(head), ip) : vadd(rest.sR, vadd(vscale(rest.fwd, 0.4), vscale(UP, 0.2)));
    const H0 = readyContact(rest, T);
    const readyArm = armRots(rest, "R", reachArm(rest, H0, reachHandFrame(vsub(T, H0))));
    armR = slerpArm(idleR, readyArm, easeInOut(t / NPC_CFG.READY_SEC));
    if (t >= NPC_CFG.READY_SEC && head) beginApproach(head, rest, ip);
  } else if (phase === "approach") {
    const L = $.state.npc_L, dir = $.state.npc_dir, H0 = $.state.npc_H0;
    const frame = $.state.npc_frame || reachHandFrame(dir);
    const s = Math.min(NPC_CFG.REACH_SPEED * t, L);
    const Ft = vadd(H0, vscale(dir, s));
    const arm = reachArm(rest, Ft, frame);
    armR = armRots(rest, "R", arm);
    const Fw = toWorld(contactOf(rest, arm), ip);
    let d = -1;
    if (head) {
      d = vlen(vsub(Fw, facePointWorld(head)));
      sampleTrace(dt, t, head, Fw, d, root);
    }
    const reachedEnd = s >= L;
    const earlyContact = d >= 0 && d <= NPC_CFG.STOP_MARGIN;
    if (reachedEnd || earlyContact) {
      $.state.npc_contactTs = Date.now();
      $.state.npc_contactDist = d;
      $.state.npc_contactT = t;
      $.state.npc_Fc = Ft;
      $.state.npc_strokeSec = strokePath(Ft, dir).total;
      $.state.npc_Fhold = Ft;
      $.state.npc_phase = "stroke";
      $.state.npc_t = 0;
      // how far the rendered wrist is from the IK wrist (bone map / rest pose mismatch shows up here)
      const wn = nodeByBone[HumanoidBone.RightHand];
      const wAct = wn ? wn.node.getGlobalPosition() : null;
      const wErr = wAct ? vlen(vsub(wAct, toWorld(wristOf(rest, arm), ip))) : -1;
      $.log("[NPC] contact: d=" + f3(d) + " early=" + earlyContact + " wristErr=" + f3(wErr) + ", stroking for " +
            f3($.state.npc_strokeSec) + " s");
    }
  } else if (phase === "stroke") {
    // gently stroke the face along strokePath(): down in contact, back up along an arc off the face (same hand
    // orientation as the approach)
    const Fc = $.state.npc_Fc || $.state.npc_T;
    const dur = $.state.npc_strokeSec || 0;
    const Fs = strokePoint(strokePath(Fc, $.state.npc_dir), Math.min(t, dur));
    const arm = reachArm(rest, Fs, $.state.npc_frame || reachHandFrame($.state.npc_dir));
    armR = armRots(rest, "R", arm);
    if (head) {
      const Fw = toWorld(contactOf(rest, arm), ip);
      sampleTrace(dt, ($.state.npc_contactT || 0) + t, head, Fw, vlen(vsub(Fw, facePointWorld(head))), root);
    }
    if (social) nodDeg = Math.max(nodDeg, 10 * Math.sin(Math.PI * clamp01(t / 1.0)));
    if (t >= dur) {
      $.state.npc_strokeEndTs = Date.now();
      $.state.npc_Fhold = Fs;              // rest where the last stroke ended
      $.state.npc_phase = "hold";
      $.state.npc_t = 0;
    }
  } else if (phase === "hold") {
    const Fc = $.state.npc_Fhold || $.state.npc_Fc || $.state.npc_T;
    const arm = reachArm(rest, Fc, $.state.npc_frame || reachHandFrame($.state.npc_dir));
    armR = armRots(rest, "R", arm);
    const sinceContact = ($.state.npc_strokeSec || 0) + t;
    if (head) {
      const Fw = toWorld(contactOf(rest, arm), ip);
      sampleTrace(dt, ($.state.npc_contactT || 0) + sinceContact, head, Fw, vlen(vsub(Fw, facePointWorld(head))), root);
    }
    if (social) nodDeg = Math.max(nodDeg, 10 * Math.sin(Math.PI * clamp01(sinceContact / 1.0)));
    if (t >= NPC_CFG.HOLD_SEC) {
      $.state.npc_phase = "retract";
      $.state.npc_t = 0;
      // duration from the distance back toward the ready point at RETRACT_SPEED (+0.8 s to settle)
      $.state.npc_retractSec = vlen(vsub(Fc, $.state.npc_H0)) / NPC_CFG.RETRACT_SPEED + 0.8;
    }
  } else if (phase === "retract") {
    // blend the joint rotations from the hold pose back to the relaxed arm
    const Fc = $.state.npc_Fhold || $.state.npc_Fc || $.state.npc_T;
    const holdArm = armRots(rest, "R", reachArm(rest, Fc, $.state.npc_frame || reachHandFrame($.state.npc_dir)));
    const u = clamp01(t / Math.max(0.5, $.state.npc_retractSec || 2.0));
    armR = slerpArm(holdArm, idleR, easeInOut(u));
    if (u >= 1) finishTrial();
  }

  // nod composes with gaze
  if (nodDeg !== 0) {
    const qNod = qaxis(R, nodDeg);
    Q[HumanoidBone.Head] = qmul(Q[HumanoidBone.Head] || IDENT, qNod);
  }

  Q[HumanoidBone.RightUpperArm] = armR.u;
  Q[HumanoidBone.RightLowerArm] = armR.l;
  Q[HumanoidBone.RightHand] = armR.h;
  for (const b of R_FINGER_BONES) if (nodeByBone[b]) Q[b] = armR.h;
  Q[HumanoidBone.LeftUpperArm] = armL.u;
  Q[HumanoidBone.LeftLowerArm] = armL.l;
  Q[HumanoidBone.LeftHand] = armL.h;

  applyPose(Q);
}

// 10 Hz head (and avatar position) trace plus the in-world retreat estimate. root: the avatar position (or null).
function sampleTrace(dt, t, head, Fw, d, root) {
  sampleTimer += dt;
  if (sampleTimer < NPC_CFG.SAMPLE_INTERVAL) return;
  sampleTimer = 0;
  const h = head.pos, r = head.rot;
  const total = ($.state.npc_trace || []).length + traceBuf.length;
  if (total < NPC_CFG.MAX_SAMPLES) {
    traceBuf.push([t.toFixed(1), f3(h.x), f3(h.y), f3(h.z), f3(r.x), f3(r.y), f3(r.z), f3(r.w), f3(d),
                   root ? f3(root.x) : "", root ? f3(root.y) : "", root ? f3(root.z) : ""].join(","));
  }
  if (traceBuf.length >= 10) {
    $.state.npc_trace = ($.state.npc_trace || []).concat(traceBuf);
    traceBuf = [];
  }
  // retreat / oscillation estimate (world frame)
  if (!$.state.npc_base) {
    baseSamples.push(vcopy(h));
    if (root) baseRootSamples.push(vcopy(root));
    if (t >= 1.0) {
      let sum = v3(0, 0, 0);
      for (const b of baseSamples) sum = vadd(sum, b);
      $.state.npc_base = vscale(sum, 1 / Math.max(1, baseSamples.length));
      if (baseRootSamples.length > 0) {   // same baseline window for the avatar position
        let rs = v3(0, 0, 0);
        for (const b of baseRootSamples) rs = vadd(rs, b);
        $.state.npc_rootBase = vscale(rs, 1 / baseRootSamples.length);
      }
    }
    return;
  }
  // axis: horizontal approach direction (hand -> face), so moving away from the hand is positive along it
  const axis = $.state.npc_axisW || v3(0, 0, 1);
  if (root && $.state.npc_rootBase) {
    const rootAway = vdot(vsub(root, $.state.npc_rootBase), axis);
    if (rootAway > ($.state.npc_rootAway || 0)) $.state.npc_rootAway = rootAway;
  }
  const delta = vsub(h, $.state.npc_base);
  const away = vdot(delta, axis);
  const lateral = vdot(delta, vcross(axis, UP));
  if (away > ($.state.npc_away || 0)) $.state.npc_away = away;
  if (lateral < ($.state.npc_latMin || 0)) $.state.npc_latMin = lateral;
  if (lateral > ($.state.npc_latMax || 0)) $.state.npc_latMax = lateral;
  if ($.state.npc_onsetDist < 0 && away > NPC_CFG.RETREAT_THRESHOLD) $.state.npc_onsetDist = d;
}
