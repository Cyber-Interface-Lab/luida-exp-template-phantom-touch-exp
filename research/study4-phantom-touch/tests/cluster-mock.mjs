// Minimal Cluster Script mock for running LUIDA item scripts in Node (no Unity, no Cluster).
// Only the parts of the API that the session reset / new-participant prompt touch are implemented.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const LUIDA_SCRIPTS = path.join(ROOT, "Assets/ClusterMetaverseLab/LuidaExpTemplate/Runtime/Scripts");
export const ITEM_SCRIPTS = path.join(ROOT, "Assets/_Experiment_/Scripts/StateManagement/PhantomTouch");
export const VARIABLES_JS = path.join(ROOT, "Assets/_Experiment_/Settings/ExperimentVariables/PhantomTouch.js");

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  normalize() { const l = this.length(); if (l > 0) this.multiplyScalar(1 / l); return this; }
  applyQuaternion() { return this; }   // the tests use identity rotations
}
export class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  setFromEulerAngles() { return this; }
  setFromAxisAngle() { return this; }
  multiply() { return this; }
  invert() { return this; }
}
export const HumanoidBone = { Head: 10 };

export function makeHandle(id, log) {
  return {
    id,
    sent: [],
    send(type, arg) { this.sent.push({ type, arg }); if (log) log.push(id + " <- " + type); },
    exists() { return true; },
    setPosition() {}, setRotation() {},
  };
}

let joinCounter = 0;
// idfc: stable per account; id: unique per join (Cluster: PlayerHandle.id changes every time the same user joins).
export function makePlayer(idfc, id) {
  return { idfc, id: id || ("join" + (++joinCounter) + "_" + idfc), userId: "u_" + idfc, here: true, sent: [], positions: [],
    exists() { return this.here; },
    send(type, arg) { this.sent.push({ type, arg }); },
    setPosition(p) { this.positions.push(p); },
    getPosition() { return new Vector3(); },
    getRotation() { return new Quaternion(); },
    getHumanoidBonePosition() { return null; } };
}

// world: { global: {}, players: [] } shared by the items of one test.
// subNodes: list of sub-node names the item has (null = every name exists, as before).
export function loadItem(files, { world, groupState = {}, globals = {}, refs = {}, name = "item", subNodes = null } = {}) {
  const cb = {};
  const item = {
    name, cb, state: {}, groupState, itemState: {}, signals: [], logs: [], subNodes: {}, playerScripts: [],
    refs, pos: null, rot: null,
  };
  const $ = {
    get state() { return item.stateProxy || item.state; },
    get groupState() { return item.groupState; },
    onStart: (f) => { cb.start = f; },
    onUpdate: (f) => { cb.update = f; },
    onReceive: (f, opt) => { cb.receive = f; cb.receiveOpt = opt; },
    onExternalCallEnd: (f) => { cb.external = f; },
    onInteract: (f) => { cb.interact = f; },
    log: (m) => { item.logs.push(String(m)); },
    setStateCompat: (target, key, value) => {
      if (target !== "this") throw new Error("mock: only 'this' is writable, got " + target);
      item.itemState[key] = value;
    },
    getStateCompat: (target, key) => {
      if (target === "global") return world.global[key];
      return item.itemState[key];
    },
    sendSignalCompat: (target, key) => { item.signals.push(key); if (world.onSignal) world.onSignal(item, key); },
    subNode: (n) => {
      if (subNodes && !subNodes.includes(n)) return null;
      return (item.subNodes[n] ||= { name: n, enabled: null, pos: null, rot: null, text: null,
        setEnabled(v) { this.enabled = v; }, setPosition(p) { this.pos = p; }, setRotation(r) { this.rot = r; }, setText(t) { this.text = t; },
        getPosition() { return new Vector3(); }, getGlobalPosition() { return new Vector3(); }, getGlobalRotation() { return new Quaternion(); } });
    },
    worldItemReference: (id) => (id in item.refs ? item.refs[id] : null),
    getPlayersNear: () => world.players.filter((p) => p.here),
    getPosition: () => new Vector3(),
    getRotation: () => new Quaternion(),
    setPlayerScript: (p) => { item.playerScripts.push(p); },
    callExternal: (ep, req, meta) => { (world.external ||= []).push({ req: JSON.parse(req), meta }); },
    requestOwner: () => {},
    setVisiblePlayers: () => {},
    setPosition: (p) => { item.pos = p; }, setRotation: (r) => { item.rot = r; },
  };
  const ctx = vm.createContext({
    $, Vector3, Quaternion, HumanoidBone, Date, Math, JSON, console,
    ExternalEndpointId: class { constructor(id) { this.id = id; } },
    isTestMode: true, expID: "", token: "", callExternalEndpointID: "", pNum: 1,
    ...globals,
  });
  const src = files.map((f) => fs.readFileSync(f, "utf8")).join("\n;\n");
  vm.runInContext(src, ctx, { filename: files[files.length - 1] });
  item.ctx = ctx;
  item.$ = $;
  // Cluster passes the sender handle; tests pass a mock handle.
  item.receive = (type, arg, sender) => cb.receive(type, arg, sender);
  item.update = (dt) => cb.update(dt);
  return item;
}

// Makes the next assignment of `key` on obj throw once (simulates a failure in the middle of a reset).
export function throwOnceOnSet(obj, key) {
  let armed = true;
  return new Proxy(obj, {
    set(t, k, v) {
      if (armed && k === key) { armed = false; throw new Error("injected failure at " + String(k)); }
      t[k] = v; return true;
    },
  });
}
