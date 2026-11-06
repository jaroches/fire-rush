// Per-frame body curves for skill moves.
//
// Drop-in: call installBodyCurves(json) or replace this module's default table.
// The game samples these curves; it does not ease a handful of keyposes.
//
// JSON shape (version 1):
// {
//   version: 1,
//   units: { time: "seconds", angles: "radians", positions: "metres" },
//   frame: "Right exit. +x right, +y up, -z forward (toward the run). A left exit mirrors x and yaw and swaps L/R.",
//   moves: {
//     chop: {
//       duration: 0.45,          // source timeline length
//       blend: 1,                // optional 0..1 accent weight; omit to use the move's overMocap when a clip is playing
//       contacts: [              // source-time ball contacts. role "hit" is the beat the game warps onto the authored touch.
//         { t: 0.30, foot: "l", surf: "inside", role: "hit" }
//       ],
//       curves: {
//         comY: [[t, metres], ...],          // 0 = standing, negative = drop
//         pelvisYaw: [[t, rad], ...],        // + yaw = turn left
//         shoulderYaw: [[t, rad], ...],      // independent of the pelvis
//         trunkPitch: [[t, rad], ...],       // + = lean forward
//         kneeL: [[t, rad], ...],            // flex, 0 = straight
//         kneeR: [[t, rad], ...],
//         armL: [[t, rad], ...],             // + = arm out
//         armR: [[t, rad], ...],
//         headPitch: [[t, rad], ...],        // + = look down
//         headYaw: [[t, rad], ...],          // + = look left
//         footL: [[t, x, y, z], ...],        // reference only — the touch solver still owns the ball
//         footR: [[t, x, y, z], ...],
//         ball: [[t, x, y, z], ...]          // reference only — not written into the ball physics
//       }
//     }
//   }
// }
// Unknown curve names are sampled and returned; they are not applied until the body layer reads them.
// The ball and the touching foot stay on the existing contact solver. These foot/ball tracks are there
// so a dense capture can land without a second schema change.

const DT = 1 / 30;

function expand(keys) {
  if (!keys || !keys.length) return [];
  const end = keys[keys.length - 1][0];
  const out = [];
  const dim = keys[0].length;
  for (let t = 0; t < end - 1e-6; t += DT) out.push(sampleAt(keys, t, dim));
  out.push(keys[keys.length - 1].slice());
  return out;
}
function sampleAt(keys, t, dim) {
  if (t <= keys[0][0]) return keys[0].slice();
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i], u = (t - a[0]) / (b[0] - a[0] || 1);
      const s = [t];
      for (let k = 1; k < dim; k++) s[k] = a[k] + (b[k] - a[k]) * u;
      return s;
    }
  }
  return keys[keys.length - 1].slice();
}

// Coarse stand-in, expanded to a 30 Hz curve so the runtime path is per-frame.
// Replace a move (or the whole table) with the dense capture; do not add more keyposes here.
function move(duration, contacts, tracks) {
  const curves = {};
  for (const name in tracks) curves[name] = expand(tracks[name]);
  return { duration, contacts, curves };
}

const DEFAULTS = {
  version: 1,
  units: { time: 'seconds', angles: 'radians', positions: 'metres' },
  frame: 'Right exit. +x right, +y up, -z forward. Left exit mirrors x/yaw and swaps L/R.',
  moves: {
    chop: move(0.45, [{ t: 0.30, foot: 'l', surf: 'inside', role: 'hit' }], {
      comY: [[0, 0], [0.1, -0.015], [0.2, -0.04], [0.28, -0.055], [0.32, -0.05], [0.4, -0.015], [0.45, 0.01]],
      pelvisYaw: [[0, 0], [0.18, 0.04], [0.3, -0.06], [0.38, -0.32], [0.45, -0.06]],
      shoulderYaw: [[0, 0], [0.08, 0.14], [0.18, 0.32], [0.3, 0.18], [0.4, -0.06], [0.45, 0]],
      trunkPitch: [[0, 0.04], [0.2, 0.1], [0.32, 0.06], [0.45, 0.02]],
      kneeL: [[0, 0.2], [0.16, 0.55], [0.28, 0.95], [0.36, 0.4], [0.45, 0.2]],
      kneeR: [[0, 0.15], [0.12, 0.35], [0.28, 0.72], [0.36, 0.4], [0.45, 0.18]],
      armL: [[0, 0.05], [0.12, 0.28], [0.28, 0.38], [0.4, 0.16], [0.45, 0.05]],
      armR: [[0, 0.02], [0.2, 0.08], [0.32, 0.14], [0.4, 0.36], [0.45, 0.1]],
      headPitch: [[0, 0.05], [0.2, 0.12], [0.32, 0.06], [0.45, 0]],
      headYaw: [[0, 0.04], [0.16, 0.12], [0.32, -0.08], [0.42, -0.28], [0.45, -0.1]],
      footR: [[0, 0.12, 0.1, 0], [0.28, 0.13, 0.1, -0.02], [0.45, 0.2, 0.1, -0.2]],
      ball: [[0, 0.02, 0.14, -0.4], [0.28, 0.06, 0.14, -0.2], [0.36, 0.28, 0.14, -0.35]]
    }),
    scissor: move(0.6, [{ t: 0.42, foot: 'r', surf: 'outside', role: 'hit' }], {
      comY: [[0, 0], [0.2, -0.015], [0.35, -0.03], [0.44, -0.025], [0.6, 0]],
      pelvisYaw: [[0, 0], [0.25, 0.05], [0.42, 0.02], [0.52, -0.16], [0.6, -0.04]],
      shoulderYaw: [[0, 0], [0.12, 0.16], [0.28, 0.3], [0.42, 0.14], [0.55, -0.08], [0.6, 0]],
      trunkPitch: [[0, 0.04], [0.3, 0.06], [0.5, 0.03], [0.6, 0]],
      kneeL: [[0, 0.12], [0.2, 0.35], [0.32, 0.2], [0.5, 0.15], [0.6, 0.12]],
      kneeR: [[0, 0.1], [0.3, 0.16], [0.42, 0.28], [0.55, 0.16], [0.6, 0.12]],
      armL: [[0, 0.04], [0.2, 0.22], [0.4, 0.18], [0.6, 0.04]],
      armR: [[0, 0.02], [0.25, 0.1], [0.45, 0.28], [0.6, 0.06]],
      headPitch: [[0, 0.02], [0.3, 0.05], [0.6, 0]],
      headYaw: [[0, 0.06], [0.28, 0.16], [0.48, -0.18], [0.6, -0.06]]
    }),
    roulette: move(0.8, [{ t: 0.2, foot: 'r', surf: 'sole' }, { t: 0.42, foot: 'l', surf: 'sole', role: 'hit' }], {
      comY: [[0, 0], [0.12, -0.03], [0.28, -0.07], [0.42, -0.08], [0.6, -0.04], [0.8, 0]],
      pelvisYaw: [[0, 0], [0.3, 0.08], [0.5, -0.06], [0.8, 0]],
      shoulderYaw: [[0, 0], [0.1, 0.14], [0.28, 0.1], [0.5, -0.08], [0.8, 0]],
      trunkPitch: [[0, 0.06], [0.3, 0.14], [0.55, 0.08], [0.8, 0.02]],
      kneeL: [[0, 0.2], [0.2, 0.4], [0.4, 0.85], [0.6, 0.35], [0.8, 0.18]],
      kneeR: [[0, 0.25], [0.16, 0.7], [0.32, 0.45], [0.55, 0.3], [0.8, 0.18]],
      armL: [[0, 0.1], [0.2, 0.22], [0.5, 0.16], [0.8, 0.04]],
      armR: [[0, 0.1], [0.2, 0.2], [0.5, 0.14], [0.8, 0.04]],
      headPitch: [[0, 0.08], [0.3, 0.16], [0.55, 0.06], [0.8, 0]],
      headYaw: [[0, 0], [0.35, 0.1], [0.6, -0.2], [0.8, -0.06]]
    }),
    elastico: move(0.5, [{ t: 0.16, foot: 'l', surf: 'outside' }, { t: 0.34, foot: 'l', surf: 'inside', role: 'hit' }], {
      comY: [[0, 0], [0.1, -0.02], [0.18, -0.035], [0.3, -0.05], [0.38, -0.03], [0.5, 0.01]],
      pelvisYaw: [[0, 0], [0.14, 0.1], [0.28, 0.02], [0.38, -0.3], [0.5, -0.05]],
      shoulderYaw: [[0, 0], [0.08, 0.18], [0.18, 0.34], [0.32, 0.1], [0.44, -0.12], [0.5, 0]],
      trunkPitch: [[0, 0.04], [0.2, 0.08], [0.4, 0.04], [0.5, 0]],
      kneeL: [[0, 0.15], [0.14, 0.4], [0.3, 0.85], [0.42, 0.35], [0.5, 0.18]],
      kneeR: [[0, 0.12], [0.14, 0.28], [0.32, 0.62], [0.46, 0.25], [0.5, 0.15]],
      armL: [[0, 0.04], [0.16, 0.3], [0.36, 0.2], [0.5, 0.05]],
      armR: [[0, 0.02], [0.16, 0.08], [0.34, 0.16], [0.44, 0.34], [0.5, 0.08]],
      headPitch: [[0, 0.04], [0.2, 0.1], [0.4, 0.04], [0.5, 0]],
      headYaw: [[0, 0.08], [0.16, 0.18], [0.34, -0.06], [0.46, -0.26], [0.5, -0.08]]
    }),
    croqueta: move(0.45, [{ t: 0.1, foot: 'l', surf: 'inside' }, { t: 0.28, foot: 'r', surf: 'inside', role: 'hit' }], {
      comY: [[0, 0], [0.08, -0.02], [0.18, -0.04], [0.3, -0.035], [0.45, 0]],
      pelvisYaw: [[0, 0], [0.12, 0.06], [0.28, -0.04], [0.4, -0.14], [0.45, -0.04]],
      shoulderYaw: [[0, 0], [0.08, 0.14], [0.18, 0.22], [0.32, 0.04], [0.45, -0.04]],
      trunkPitch: [[0, 0.02], [0.2, 0.05], [0.45, 0]],
      kneeL: [[0, 0.12], [0.1, 0.4], [0.22, 0.25], [0.4, 0.16], [0.45, 0.12]],
      kneeR: [[0, 0.12], [0.16, 0.2], [0.28, 0.45], [0.4, 0.2], [0.45, 0.14]],
      armL: [[0, 0.04], [0.12, 0.22], [0.3, 0.12], [0.45, 0.04]],
      armR: [[0, 0.02], [0.16, 0.08], [0.3, 0.24], [0.45, 0.06]],
      headPitch: [[0, 0.02], [0.2, 0.06], [0.45, 0]],
      headYaw: [[0, 0.04], [0.16, 0.1], [0.32, -0.16], [0.45, -0.06]]
    }),
    heel: move(0.4, [{ t: 0.08, foot: 'r', surf: 'heel' }, { t: 0.2, foot: 'l', surf: 'heel', role: 'hit' }], {
      comY: [[0, 0], [0.06, -0.03], [0.14, -0.055], [0.22, -0.04], [0.34, -0.01], [0.4, 0.01]],
      pelvisYaw: [[0, 0], [0.16, 0.04], [0.28, -0.08], [0.4, -0.02]],
      shoulderYaw: [[0, 0], [0.1, 0.1], [0.22, 0.06], [0.34, -0.06], [0.4, 0]],
      trunkPitch: [[0, 0.08], [0.12, 0.18], [0.24, 0.1], [0.4, 0.02]],
      kneeL: [[0, 0.2], [0.1, 0.45], [0.2, 0.85], [0.32, 0.3], [0.4, 0.16]],
      kneeR: [[0, 0.25], [0.08, 0.6], [0.18, 0.4], [0.32, 0.22], [0.4, 0.16]],
      armL: [[0, 0.06], [0.12, 0.2], [0.28, 0.28], [0.4, 0.06]],
      armR: [[0, 0.04], [0.1, 0.22], [0.26, 0.14], [0.4, 0.05]],
      headPitch: [[0, 0.1], [0.12, 0.22], [0.24, 0.08], [0.4, 0]],
      headYaw: [[0, 0], [0.16, 0.04], [0.3, -0.16], [0.4, -0.06]]
    }),
    rainbow: move(1.05, [{ t: 0.2, foot: 'r', surf: 'sole' }, { t: 0.4, foot: 'r', surf: 'inside' }, { t: 0.6, foot: 'l', surf: 'heel', role: 'hit' }], {
      comY: [[0, 0], [0.2, -0.03], [0.4, -0.06], [0.55, -0.07], [0.66, 0.02], [0.85, 0.03], [1.05, 0]],
      pelvisYaw: [[0, 0], [0.4, 0.04], [0.7, -0.06], [1.05, 0]],
      shoulderYaw: [[0, 0], [0.25, 0.1], [0.55, 0.16], [0.75, 0.04], [1.05, 0]],
      trunkPitch: [[0, 0.06], [0.4, 0.16], [0.6, 0.08], [0.8, -0.04], [1.05, 0]],
      kneeL: [[0, 0.2], [0.35, 0.4], [0.55, 0.9], [0.75, 0.35], [1.05, 0.16]],
      kneeR: [[0, 0.2], [0.2, 0.55], [0.45, 0.4], [0.7, 0.25], [1.05, 0.16]],
      armL: [[0, 0.08], [0.4, 0.28], [0.7, 0.34], [1.05, 0.06]],
      armR: [[0, 0.08], [0.4, 0.26], [0.7, 0.32], [1.05, 0.06]],
      headPitch: [[0, 0.1], [0.4, 0.2], [0.58, 0.12], [0.75, -0.16], [1.05, 0]],
      headYaw: [[0, 0], [0.5, 0.06], [0.75, -0.12], [1.05, -0.04]],
      ball: [[0, 0.02, 0.14, -0.4], [0.4, -0.06, 0.25, 0.1], [0.6, -0.06, 0.5, 0.05], [0.85, 0.1, 0.9, -0.4]]
    }),
    rollover: move(0.32, [{ t: 0.16, foot: 'l', surf: 'sole', role: 'hit' }], {
      comY: [[0, 0], [0.08, -0.02], [0.16, -0.035], [0.26, -0.02], [0.32, 0]],
      pelvisYaw: [[0, 0], [0.12, 0.04], [0.24, -0.06], [0.32, 0]],
      shoulderYaw: [[0, 0], [0.08, 0.16], [0.18, 0.1], [0.28, -0.04], [0.32, 0]],
      trunkPitch: [[0, 0.04], [0.16, 0.08], [0.32, 0.02]],
      kneeL: [[0, 0.15], [0.1, 0.35], [0.2, 0.25], [0.32, 0.15]],
      kneeR: [[0, 0.18], [0.1, 0.4], [0.2, 0.28], [0.32, 0.16]],
      armL: [[0, 0.04], [0.12, 0.2], [0.24, 0.1], [0.32, 0.04]],
      armR: [[0, 0.02], [0.14, 0.08], [0.26, 0.18], [0.32, 0.04]],
      headPitch: [[0, 0.02], [0.16, 0.06], [0.32, 0]],
      headYaw: [[0, 0.04], [0.2, -0.1], [0.32, -0.04]]
    })
  }
};

import { FC27_BODY } from './fc27-body.js';
let table = FC27_BODY;
let generation = 1;
const warpCache = new Map();

function curveEnd(curve) {
  return curve && curve.length ? curve[curve.length - 1][0] : 0;
}

export function installBodyCurves(data) {
  if (!data || data.version !== 1 || !data.moves) throw new Error('body curves: expected { version: 1, moves }');
  for (const id in data.moves) {
    const m = data.moves[id];
    if (!m || !m.curves || !m.contacts) throw new Error('body curves: move ' + id + ' needs curves and contacts');
    for (const c of m.contacts) if (typeof c.t !== 'number') throw new Error('body curves: contact.t missing on ' + id);
  }
  table = data;
  generation++;
  warpCache.clear();
  return generation;
}

function anchorsFor(src, gameContacts, gameDuration) {
  const key = generation + ':' + (src.duration || 0) + ':' + gameContacts.map(c => c.t.toFixed(3) + (c.role || '')).join(',') + ':' + gameDuration.toFixed(3);
  const hit = warpCache.get(key);
  if (hit) return hit;
  const srcC = (src.contacts || []).slice().sort((a, b) => a.t - b.t);
  const game = gameContacts.slice().sort((a, b) => a.t - b.t);
  let srcDur = src.duration || 0;
  for (const name in src.curves) srcDur = Math.max(srcDur, curveEnd(src.curves[name]));
  const srcHit = srcC.find(c => c.role === 'hit') || srcC[srcC.length - 1];
  const gameHit = game.find(c => c.role === 'hit') || game[game.length - 1];
  const A = [[0, 0]];
  if (srcHit && gameHit) {
    const before = (list, t) => list.filter(c => c.t < t - 1e-3);
    const after = (list, t) => list.filter(c => c.t > t + 1e-3);
    const sb = before(srcC, srcHit.t), sa = after(srcC, srcHit.t);
    const gb = before(game, gameHit.t), ga = after(game, gameHit.t);
    if (sb.length && sb.length === gb.length) for (let i = 0; i < sb.length; i++) A.push([gb[i].t, sb[i].t]);
    A.push([gameHit.t, srcHit.t]);
    if (sa.length && sa.length === ga.length) for (let i = 0; i < sa.length; i++) A.push([ga[i].t, sa[i].t]);
  }
  A.push([Math.max(gameDuration, gameHit ? gameHit.t : 0), srcDur]);
  A.sort((a, b) => a[0] - b[0]);
  const out = [A[0]];
  for (let i = 1; i < A.length; i++) {
    const prev = out[out.length - 1];
    if (A[i][0] > prev[0] + 1e-4 && A[i][1] >= prev[1] - 1e-4) out.push(A[i]);
  }
  warpCache.set(key, out);
  return out;
}

function warpTime(anc, gameT) {
  if (gameT <= anc[0][0]) return anc[0][1];
  for (let i = 1; i < anc.length; i++) {
    if (gameT <= anc[i][0]) {
      const u = (gameT - anc[i - 1][0]) / (anc[i][0] - anc[i - 1][0] || 1);
      return anc[i - 1][1] + (anc[i][1] - anc[i - 1][1]) * u;
    }
  }
  return anc[anc.length - 1][1];
}

function readCurve(curve, t) {
  if (!curve || !curve.length) return null;
  if (t <= curve[0][0]) return curve[0];
  let lo = 0, hi = curve.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (curve[mid][0] <= t) lo = mid; else hi = mid; }
  const a = curve[lo], b = curve[hi], u = (t - a[0]) / (b[0] - a[0] || 1);
  const s = new Array(a.length);
  s[0] = t;
  for (let k = 1; k < a.length; k++) s[k] = a[k] + ((b[k] || 0) - a[k]) * u;
  return s;
}

const YAW = new Set(['pelvisYaw', 'shoulderYaw', 'headYaw']);
const SWAP = [['kneeL', 'kneeR'], ['armL', 'armR'], ['footL', 'footR']];

// d > 0 is the authored right exit. Returns every curve, time-warped onto gameContacts.
// Foot and ball channels are sampled for reference; the ball solver does not read them.
export function sampleMoveCurves(moveId, gameT, gameDuration, gameContacts, d) {
  const src = table.moves && (table.moves[moveId] || table.moves._default);
  const out = { _id: moveId, _src: 0, _applyLegs: !!(src && src.applyLegs) };
  if (!src || !src.curves) return out;
  const anc = anchorsFor(src, gameContacts || [], gameDuration || gameT || 0);
  const st = warpTime(anc, gameT);
  out._src = st;
  const sign = d < 0 ? -1 : 1;
  for (const name in src.curves) {
    const row = readCurve(src.curves[name], st);
    if (!row) continue;
    if (row.length <= 2) out[name] = row[1] * (YAW.has(name) ? sign : 1);
    else out[name] = { x: row[1] * sign, y: row[2], z: row[3] };
  }
  if (sign < 0) {
    for (const [a, b] of SWAP) { const tmp = out[a]; out[a] = out[b]; out[b] = tmp; }
  }
  return out;
}

export function bodyCurveTable() { return table; }
