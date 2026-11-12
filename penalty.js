// Stadium penalty break. The street jog, the roll-over and the chase camera stay as they are.
// This module only runs while a penalty is active, then hands the run back at the saved speed.
const PEN_GAP = [60, 75];
const GOAL_Z = -11;
const GOAL_HW = 3.35;
const GOAL_HH = 2.25;
const SPOT_AHEAD = 34; // metres of tunnel + pitch before the spot reaches the hero

export function createPenalty(api) {
  const THREE = api.THREE;
  const soon = /[?&]penalty=1(?:&|$)/.test(location.search);
  const el = () => document.getElementById('pen');
  const stad = buildStadium(THREE);
  stad.visible = false;
  api.scene.add(stad);

  const net = stad.userData.net;
  const netBase = net.geometry.attributes.position.array.slice();
  const kickA = new THREE.Vector3(), kickB = new THREE.Vector3(), kickH = new THREE.Vector3();
  const kickQ = new THREE.Quaternion();
  let keeper = null;

  const pen = {
    phase: 'off',
    next: soon ? 2.4 : PEN_GAP[0] + Math.random() * (PEN_GAP[1] - PEN_GAP[0]),
    saved: 0,
    count: 3,
    countT: 0,
    cam: 0,
    kickT: -1,
    shot: false,
    judged: false,
    result: '',
    hold: 0,
    dive: { x: 0, y: 0 },
    diveT: 0,
    pts: 0
  };
  window.__penalty = pen;

  function show(text, cls) {
    const n = el(); if (!n) return;
    n.textContent = text || '';
    n.className = cls || '';
    n.classList.toggle('hidden', !text);
  }

  function mult() { return Math.max(1, 1 + pen.saved / 30); }

  function begin() {
    const S = api.S, P = api.P;
    pen.phase = 'approach';
    pen.saved = S.speed;
    pen.shot = false; pen.judged = false; pen.result = ''; pen.kickT = -1; pen.hold = 0; pen.diveT = 0;
    pen.cam = 0;
    stad.visible = true;
    stad.position.set(0, 0, -SPOT_AHEAD);
    resetNet();
    if (keeper) { keeper.group.position.set(0, 0, GOAL_Z + 0.55); keeper.group.rotation.z = 0; keeper.play('Idle_Loop', 0.1, 1); }
    api.cancelSkill();
    api.BS.gather = null; api.BS.air = false; api.BS.reach = false;
    for (let i = api.obstacles.length - 1; i >= 0; i--) {
      if (api.obstacles[i].position.z < 8) { api.release(api.obstacles[i]); api.obstacles.splice(i, 1); }
    }
    S.nextSpawn = 1e9;
    P.buffer = null;
  }

  function chooseDive() {
    const f = window.__penaltyDive;
    if (f && typeof f.x === 'number') return { x: Math.max(-1, Math.min(1, Math.round(f.x))), y: f.y ? 1 : 0 };
    const r = Math.random();
    // Sides are more likely than a stand-still. High or low is a coin toss, slightly low.
    return { x: r < 0.42 ? -1 : r < 0.84 ? 1 : 0, y: Math.random() < 0.62 ? 0 : 1 };
  }

  function resetNet() {
    const pos = net.geometry.attributes.position;
    pos.array.set(netBase);
    pos.needsUpdate = true;
    net.userData.rip = null;
  }

  function rippleAt(x, y) {
    net.userData.rip = { x, y, t: 0 };
  }

  function animNet(dt) {
    const rip = net.userData.rip; if (!rip) return;
    rip.t += dt;
    const pos = net.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = netBase[i * 3], y = netBase[i * 3 + 1];
      const d = Math.hypot(x - rip.x, y - rip.y);
      const w = Math.sin(d * 5.5 - rip.t * 16) * Math.exp(-d * 1.15) * Math.exp(-rip.t * 1.8) * 0.55;
      pos.setZ(i, -Math.max(0, w));
    }
    pos.needsUpdate = true;
  }

  // dx/dy are CSS pixels (y grows downward). dt is seconds. Speed is the power.
  function shoot(dx, dy, dt) {
    if (pen.phase !== 'aim') return false;
    const sp = Math.hypot(dx, dy) / Math.max(0.045, dt);
    const power = Math.max(0.32, Math.min(1, (sp - 180) / 1100));
    const ax = Math.max(-1, Math.min(1, dx / 150));
    const ay = Math.max(0, Math.min(1, -dy / 160));
    const BS = api.BS;
    const p = { x: BS.p.x, y: BS.p.y, z: BS.p.z };
    let tx = ax * 2.55;
    let ty = 0.35 + ay * 1.65;
    ty = api.BR + (ty - api.BR) * (0.55 + power * 0.5);
    // A full upward swipe clears the bar. A full sideways swipe misses wide. Pace still comes from speed.
    if (ay > 0.92 && Math.abs(ax) < 0.35) ty = GOAL_HH + 0.75;
    if (Math.abs(ax) > 0.92) tx = Math.sign(ax) * (GOAL_HW + 0.6);
    const flight = 0.78 - power * 0.32;
    let vx = (tx - p.x) / flight;
    let vz = (GOAL_Z - p.z) / flight;
    let vy = (ty - p.y) / flight + 0.5 * 9.81 * flight * 0.9;
    if (power > 0.5) {
      const hit = flyTo(p, vx, vy, vz);
      if (hit) {
        vx += (tx - hit.x) * 0.7;
        vy += (ty - hit.y) * 0.85;
      }
    }
    pen.aim = { power: +power.toFixed(2), ax: +ax.toFixed(2), ay: +ay.toFixed(2), tx: +tx.toFixed(2), ty: +ty.toFixed(2) };
    BS.wx = vx; BS.vz = vz; BS.vy = vy; BS.w = -6 * ax; BS.air = true; BS.phys = true; BS.bounces = 0;
    BS.reach = false;
    BS.gather = { t0: api.S.t + 30, t: api.S.t + 30, done: false, flight: true, side: null };
    pen.phase = 'kick'; pen.kickT = 0; pen.shot = true; pen.judged = false; pen.diveT = 0;
    show('SHOOT', 'swipe');
    return true;
  }

  function flyTo(p, wx, vy, vz) {
    const st = { x: p.x, y: p.y, z: p.z, wx, vz, vy, w: 0, air: true };
    let prev = st.z;
    for (let i = 0; i < 240 * 2; i++) {
      api.airStep(st, 1 / 240, 0);
      if (prev > GOAL_Z && st.z <= GOAL_Z) return { x: st.x, y: st.y, z: st.z };
      prev = st.z;
      if (!st.air && st.z > GOAL_Z + 0.4) return { x: st.x, y: st.y, z: st.z, short: true };
    }
    return null;
  }

  function judge(bx, by) {
    const inX = Math.abs(bx) < GOAL_HW - 0.05;
    const inY = by > 0.05 && by < GOAL_HH - 0.04;
    const kx = keeper ? keeper.group.position.x : pen.dive.x * 1.85;
    const ky = 0.9 + (keeper ? keeper.group.position.y : 0);
    const saved = inX && inY && Math.abs(bx - kx) < 1.05 && Math.abs(by - ky) < 0.9;
    pen.judged = true;
    pen.result = saved ? 'save' : inX && inY ? 'goal' : 'miss';
    const m = mult();
    pen.pts = pen.result === 'goal' ? Math.round(500 * m) : pen.result === 'save' ? Math.round(50 * m) : 0;
    if (pen.pts) api.S.score += pen.pts;
    show('');
    if (pen.result === 'goal') {
      rippleAt(Math.max(-GOAL_HW, Math.min(GOAL_HW, bx)), Math.max(0.2, Math.min(GOAL_HH, by)));
      api.popup('GOAL!', '+' + pen.pts, true);
      const BS = api.BS; BS.vz *= 0.15; BS.vy = Math.min(BS.vy, 1.2);
    } else if (pen.result === 'save') {
      api.popup('SAVED', pen.pts ? '+' + pen.pts : '', false);
      const BS = api.BS; BS.vz = Math.abs(BS.vz) * 0.35; BS.vy = Math.max(BS.vy, 2.2); BS.wx *= 0.4;
    } else {
      api.popup('MISS', '', false);
    }
    pen.phase = 'result'; pen.hold = 0;
  }

  function finish() {
    const S = api.S;
    S.speed = pen.saved;
    S.nextSpawn = 20;
    pen.phase = 'off';
    pen.cam = 0;
    pen.next = S.t + PEN_GAP[0] + Math.random() * (PEN_GAP[1] - PEN_GAP[0]);
    stad.visible = false;
    show('');
    api.BS.gather = null;
    api.BS.air = false;
    api.BS.reach = true;
    const hero = api.getHero();
    if (hero && hero.currentName !== 'Jog_Fwd_Loop') api.syncJog(0.16);
    if (keeper) { keeper.group.position.x = 0; keeper.group.position.y = 0; keeper.group.rotation.z = 0; }
  }

  function update(dt) {
    const S = api.S, P = api.P, BS = api.BS;
    if (pen.phase === 'off') return;
    const hero = api.getHero();
    if (!P.grounded) {
      P.vy -= api.GRAV * dt; P.y += P.vy * dt;
      if (P.y <= 0) { P.y = 0; P.vy = 0; P.grounded = true; P.sinceGround = 0; }
    }
    if (P.slideT > 0) P.slideT = Math.max(0, P.slideT - dt);

    if (pen.phase === 'approach') {
      const left = -stad.position.z;
      if (left < 8) S.speed = Math.max(0, pen.saved * Math.max(0, left / 8));
      else S.speed = Math.min(S.speed, pen.saved);
      P.x += (0 - P.x) * Math.min(1, dt * 2.4);
      P.lane = 1; P.fromX = 0; P.toX = 0; P.laneT = 1;
      const dz = S.speed * dt;
      stad.position.z += dz;
      api.scroll(dz);
      S.dist += dz; S.score += dz * (1 + pen.saved / 30);
      if (left < 1.6 && hero && hero.currentName === 'Jog_Fwd_Loop') hero.play('Idle_Loop', 0.16, 1);
      if (stad.position.z >= -0.05 || (left < 0.35 && S.speed < 0.8)) {
        stad.position.z = 0; S.speed = 0;
        BS.p.set(0, api.BR, -0.46); BS.wx = BS.vz = BS.vy = 0; BS.air = false; BS.phys = true; BS.gather = null; BS.reach = false;
        pen.phase = 'countdown'; pen.count = 3; pen.countT = 0; pen.cam = 0;
        if (hero) hero.play('Idle_Loop', 0.1, 1);
        show('3', '');
      }
    } else if (pen.phase === 'countdown') {
      S.speed = 0;
      pen.countT += dt; pen.cam = Math.min(1, pen.cam + dt / 0.55);
      const n = 3 - Math.floor(pen.countT);
      if (n >= 1) { pen.count = n; show(String(n), ''); }
      if (pen.countT >= 3) {
        pen.phase = 'aim'; pen.hold = 0; pen.dive = chooseDive(); pen.diveT = 0;
        show('SWIPE', 'swipe');
      }
    } else if (pen.phase === 'aim') {
      S.speed = 0; pen.cam = 1; pen.hold += dt;
      if (pen.hold > 5) shoot(30, 40, 0.4);
    } else if (pen.phase === 'kick' || pen.phase === 'flight') {
      S.speed = 0; pen.cam = 1; pen.kickT += dt; pen.diveT += dt;
      if (keeper && pen.diveT > 0.06) {
        const u = Math.max(0, Math.min(1, (pen.diveT - 0.06) / 0.38));
        const e = u * u * (3 - 2 * u);
        keeper.group.position.x = pen.dive.x * 1.9 * e;
        keeper.group.position.y = (pen.dive.y ? 0.62 : 0.02) * e;
        keeper.group.rotation.z = -pen.dive.x * 0.95 * e;
      }
      if (!pen.judged) {
        const bz = BS.p.z, bx = P.x + BS.p.x, by = BS.p.y;
        if (bz <= GOAL_Z) judge(bx, by);
        else if (!BS.air && bz > GOAL_Z + 0.5) judge(bx, by);
      }
      if (pen.kickT > 0.42 && pen.phase === 'kick') pen.phase = 'flight';
    } else if (pen.phase === 'result') {
      S.speed = 0; pen.cam = 1; pen.hold += dt;
      animNet(dt);
      if (pen.hold > 1.15) { pen.phase = 'exit'; pen.hold = 0; show(''); }
    } else if (pen.phase === 'exit') {
      pen.hold += dt;
      const u = Math.min(1, pen.hold / 1.05);
      S.speed = pen.saved * u * u * (3 - 2 * u);
      pen.cam = Math.max(0, 1 - pen.hold / 0.85);
      const dz = S.speed * dt;
      stad.position.z += dz;
      api.scroll(dz);
      S.dist += dz; S.score += dz * (1 + pen.saved / 30);
      animNet(dt);
      BS.gather = null;
      if (hero && hero.currentName !== 'Jog_Fwd_Loop' && pen.hold > 0.15) api.syncJog(0.18);
      if (stad.position.z > 38) finish();
    }

    if (hero) {
      hero.group.position.set(P.x, P.y, 0);
      if (hero.currentName === 'Jog_Fwd_Loop' && hero.current) hero.current.timeScale = api.jogCadence();
    }
    if (keeper) keeper.update(dt);
    if (S.state === 'play') {
      const hs = document.getElementById('hScore'), hd = document.getElementById('hDist');
      if (hs) hs.textContent = Math.floor(S.score);
      if (hd) hd.textContent = Math.floor(S.dist) + ' m';
    }
  }

  function pose() {
    if (pen.kickT < 0 || pen.kickT > 0.42) return;
    const hero = api.getHero();
    if (!hero || !hero.bones || !hero.bones.foot_r || !hero.bones.thigh_r) return;
    const s = Math.sin(Math.min(1, pen.kickT / 0.24) * Math.PI);
    hero.group.updateMatrixWorld(true);
    const hip = hero.bones.thigh_r.getWorldPosition(kickA);
    // In front of the planting leg, toward the goal (-z), then through the ball.
    kickB.set(hip.x + 0.06, 0.16 + (1 - s) * 0.22, hip.z - 0.22 - s * 0.78);
    hero.bones.foot_r.getWorldQuaternion(kickQ);
    kickH.set(hip.x, hip.y + 0.15, hip.z - 1);
    api.ikLeg('r', kickB, kickQ, kickH);
  }

  function applyCam(dt) {
    if (pen.cam <= 0.001 || window.__camLow) return;
    const w = pen.cam, P = api.P, camera = api.camera, camLook = api.camLook;
    const penPos = api.scratch.v.set(P.x * 0.2, 1.55, 3.25);
    camera.position.lerp(penPos, w);
    const look = api.scratch.v2.set(P.x * 0.05, 1.05, GOAL_Z + 1.5);
    camLook.lerp(look, w);
    camera.lookAt(camLook);
    const base = api.baseFov();
    const fov = base + (56 - base) * w;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  return {
    update, pose, applyCam, shoot,
    active: () => pen.phase !== 'off',
    // Called after S.t advances. Returns true when the street sim should not also run.
    consume() {
      if (pen.phase === 'off') {
        if (api.S.state !== 'play' || api.S.t < pen.next) return false;
        begin();
      }
      return true;
    },
    blocksInput: () => pen.phase !== 'off',
    aiming: () => pen.phase === 'aim',
    swipe: (x0, y0, x1, y1, t0, t1) => shoot(x1 - x0, y1 - y0, Math.max(0.045, (t1 - t0) / 1000)),
    reset: () => { pen.phase = 'off'; pen.cam = 0; pen.kickT = -1; stad.visible = false; show(''); pen.next = api.S.t + (soon ? 2.4 : PEN_GAP[0] + Math.random() * (PEN_GAP[1] - PEN_GAP[0])); },
    attachKeeper: (runner) => {
      keeper = runner;
      if (!keeper) return;
      keeper.model.rotation.y = 0;
      stad.add(keeper.group);
      keeper.group.position.set(0, 0, GOAL_Z + 0.55);
      keeper.play('Idle_Loop', 0, 1);
    },
    force: () => { if (pen.phase === 'off') { pen.next = api.S.t; } }
  };
}

function buildStadium(THREE) {
  const g = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x1f8a3a, roughness: 0.95 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.6 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x0b1f4d, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.75 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xd5dbe3, roughness: 0.9 });

  const check = checkerTex(THREE);
  const tunnel = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 18), new THREE.MeshStandardMaterial({ map: check, roughness: 0.85 }));
  tunnel.rotation.x = -Math.PI / 2; tunnel.position.set(0, 0.04, 16); g.add(tunnel);
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 16), new THREE.MeshStandardMaterial({ map: check, roughness: 0.85 }));
  exit.rotation.x = -Math.PI / 2; exit.position.set(0, 0.04, -20); g.add(exit);

  for (const side of [-1, 1]) {
    for (const [zc, len] of [[16, 18], [-20, 16]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.6, len), cloth);
      wall.position.set(side * 4.5, 2.3, zc); g.add(wall);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, len), side < 0 ? red : navy);
      stripe.position.set(side * 4.5, 3.5, zc); g.add(stripe);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.28, 18), navy);
  roof.position.set(0, 4.7, 16); g.add(roof);

  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(22, 28), green);
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.045, -2); pitch.receiveShadow = true; g.add(pitch);
  const line = (w, h, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paint);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); g.add(m);
  };
  line(0.1, 24, -4.2, -1); line(0.1, 24, 4.2, -1);
  line(8.4, 0.1, 0, GOAL_Z + 0.15);
  line(5.4, 0.08, 0, -5.2); line(0.08, 6, -2.7, -8); line(0.08, 6, 2.7, -8);
  const spot = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 20), paint);
  spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.05, 0); g.add(spot);

  for (const side of [-1, 1]) {
    for (let row = 0; row < 7; row++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 22), row % 2 ? red : navy);
      seat.position.set(side * (7.4 + row * 0.15), 0.8 + row * 0.55, -2); g.add(seat);
    }
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 22), paint);
    fascia.position.set(side * 6.5, 0.7, -2); g.add(fascia);
  }
  const word = wordTex(THREE);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.3), new THREE.MeshBasicMaterial({ map: word, transparent: true }));
  banner.position.set(0, 5.4, -8.5); g.add(banner);

  const post = (x, h, y, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paint);
    m.position.set(x, y, z); g.add(m); return m;
  };
  post(-GOAL_HW, GOAL_HH, GOAL_HH / 2, GOAL_Z, 0.14, 0.14);
  post(GOAL_HW, GOAL_HH, GOAL_HH / 2, GOAL_Z, 0.14, 0.14);
  post(0, 0.14, GOAL_HH, GOAL_Z, GOAL_HW * 2, 0.14);

  const netGeo = new THREE.PlaneGeometry(GOAL_HW * 2, GOAL_HH, 22, 12);
  const netMap = netTex(THREE);
  const net = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ map: netMap, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
  net.position.set(0, GOAL_HH / 2, GOAL_Z - 0.35);
  g.add(net);
  g.userData.net = net;
  return g;
}

function checkerTex(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#e7ebf0' : '#9aa3ad';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 6);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function netTex(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, 128); g.stroke();
    g.beginPath(); g.moveTo(0, i * 16); g.lineTo(128, i * 16); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 4);
  return t;
}
function wordTex(THREE) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1f4d'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, 512, 8); g.fillRect(0, 88, 512, 8);
  g.fillStyle = '#fff'; g.font = '900 54px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('FIRE', 256, 50);
  const t = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
