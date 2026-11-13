// v23 penalty. Jog, roll-over and the chase-camera formula stay in main.js.
// Mixamo clips are retargeted onto the UAL empties (same swing retarget as the roll-over).
const PEN_GAP = [60, 75];
const GOAL_Z = -11;
const GOAL_HW = 3.35;
const GOAL_HH = 2.25;
const SPOT_AHEAD = 16;
const CONTACT = 0.87;
const FLIGHT_T = 0.68;
const DIVE_DELAY = 0.1; // ~3 frames at 30fps
const DIVE_RATE = 2.45; // root motion lands as the ball arrives

export function createPenalty(api) {
  const THREE = api.THREE;
  const soon = /[?&]penalty=1(?:&|$)/.test(location.search);
  const stad = buildStadium(THREE);
  stad.visible = false;
  api.scene.add(stad);
  const net = stad.userData.net;
  const netBase = net.geometry.attributes.position.array.slice();
  const burst = makeBurst(THREE);
  burst.visible = false;
  api.scene.add(burst);
  const flashes = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set((i % 2 ? 1 : -1) * (6.4 + (i % 3) * 0.4), 1.6 + (i % 4) * 0.85, -3 - (i % 5) * 1.2);
    stad.add(m); flashes.push(m);
  }
  const ribbon = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0x7ecbff, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; api.scene.add(m); ribbon.push({ m, p: new THREE.Vector3() });
  }
  const buf = new THREE.Vector2();
  let keeper = null;
  const pen = {
    phase: 'off', next: soon ? 2.2 : 68, saved: 0, countT: 0, chev: 0, aimX: 0, lift: 0,
    kickT: 0, shot: false, dove: false, guess: 'DiveL', judged: false, result: '', hold: 0,
    pts: 0, approachU: 0, allow: false, frozen: null
  };
  window.__penalty = pen;

  const ui = (id) => document.getElementById(id);
  function showUI(on) { const n = ui('penUI'); if (n) n.classList.toggle('hidden', !on); document.body.classList.toggle('pen-live', !!on); }
  function num(text) { const n = ui('penNum'); if (n) n.textContent = text || ''; }
  function hint(on) { const n = ui('penHint'); if (n) n.classList.toggle('hidden', !on); }
  function meter(on) { const n = ui('penMeter'); if (n) n.style.display = on ? '' : 'none'; }

  function playClip(runner, name, rate, once) {
    if (!runner || !runner.actions || !runner.actions[name]) return false;
    const a = runner.actions[name];
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = !!once;
    a.timeScale = rate; a.enabled = true; a.setEffectiveWeight(1);
    if (runner.current && runner.current !== a) runner.current.setEffectiveWeight(0);
    a.play();
    runner.current = a; runner.currentName = name;
    runner._inert = 0;
    return true;
  }

  function begin() {
    const S = api.S, P = api.P, BS = api.BS;
    pen.phase = 'approach'; pen.saved = S.speed; pen.shot = false; pen.dove = false; pen.judged = false;
    pen.result = ''; pen.kickT = 0; pen.hold = 0; pen.approachU = 0; pen.allow = false; pen.frozen = null;
    BS.penHold = false; BS.gather = null; BS.air = false;
    stad.visible = true; stad.position.set(0, 0, -SPOT_AHEAD); resetNet();
    if (keeper) { keeper.group.position.set(0, 0, GOAL_Z + 0.45); keeper.group.rotation.set(0, 0, 0); playClip(keeper, 'KeeperIdle', 1, false); }
    api.cancelSkill();
    for (let i = api.obstacles.length - 1; i >= 0; i--) {
      if (api.obstacles[i].position.z < 8) { api.release(api.obstacles[i]); api.obstacles.splice(i, 1); }
    }
    S.nextSpawn = 1e9; P.buffer = null;
  }

  function chooseGuess() {
    const f = window.__penaltyDive;
    if (f === 'save' || (f && f.kind)) return (f && f.kind) || 'Catch';
    if (f && typeof f.x === 'number') return f.x < -0.3 ? 'DiveR' : f.x > 0.3 ? 'DiveL' : (f.y ? 'Catch' : 'Scoop');
    const r = Math.random();
    return r < 0.38 ? 'DiveL' : r < 0.76 ? 'DiveR' : r < 0.9 ? 'Catch' : 'Scoop';
  }

  function resetNet() {
    const pos = net.geometry.attributes.position;
    pos.array.set(netBase); pos.needsUpdate = true; net.userData.rip = null;
  }
  function rippleAt(x, y) { net.userData.rip = { x, y, t: 0 }; }
  function animNet(dt) {
    const rip = net.userData.rip; if (!rip) return;
    rip.t += dt;
    const pos = net.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = netBase[i * 3], y = netBase[i * 3 + 1];
      const d = Math.hypot(x - rip.x, y - rip.y);
      const w = Math.sin(d * 5 - rip.t * 14) * Math.exp(-d * 1.2) * Math.exp(-rip.t * 2) * 0.35;
      pos.setZ(i, -Math.max(0, w));
    }
    pos.needsUpdate = true;
  }

  function shoot(dx, dy, dt) {
    if (!pen.allow) return false;
    const sp = Math.hypot(dx, dy) / Math.max(0.05, dt);
    if (-dy < 18) return false;
    const ax = Math.abs(dx) > Math.abs(dy) * 0.45 ? Math.max(-1, Math.min(1, dx / 150)) : pen.chev;
    const lift = Math.max(0, Math.min(1, (sp - 220) / 1500));
    pen.aimX = ax; pen.lift = lift; pen.phase = 'runup'; pen.kickT = 0; pen.shot = false; pen.allow = false;
    showUI(false); num(''); hint(false);
    const hero = api.getHero();
    playClip(hero, 'PenaltyKick', 1, true);
    api.BS.penHold = true; api.BS.air = false; api.BS.gather = { t0: api.S.t + 40, t: api.S.t + 40, done: false, flight: true, side: null };
    return true;
  }

  function launch() {
    const BS = api.BS, P = api.P;
    const tx = pen.aimX * 2.35;
    let ty = 0.55 + pen.lift * 1.15;
    if (pen.lift > 0.82 && Math.abs(pen.aimX) < 0.28) ty = GOAL_HH + 0.7;
    const t = FLIGHT_T;
    BS.wx = (tx - BS.p.x) / t;
    BS.vz = (GOAL_Z - BS.p.z) / t;
    BS.vy = (ty - BS.p.y) / t + 0.5 * 9.81 * t * 0.42;
    BS.w = 18 * (pen.aimX >= 0 ? 1 : -1);
    BS.air = true; BS.phys = true; BS.penHold = false; BS.bounces = 0;
    pen.shot = true; pen.dove = false;
    pen.guess = chooseGuess();
  }

  function guessCovers(x) {
    if (pen.guess === 'DiveL') return x > 0.15 && x < 2.6;
    if (pen.guess === 'DiveR') return x < -0.15 && x > -2.6;
    return Math.abs(x) < 1.45;
  }
  // The dive's root motion covers about half the goal. If this guess can reach the shot,
  // ease the keeper so a glove is on the ball when it arrives.
  function steerGloves() {
    if (!keeper || !keeper.bones || !guessCovers(pen.aimX * 2.35)) return;
    const wantX = pen.aimX * 2.35, wantY = 0.55 + pen.lift * 0.9;
    const v = api.scratch.v;
    let best = null, bd = 99;
    for (const n of ['hand_l', 'hand_r']) {
      const b = keeper.bones[n]; if (!b) continue;
      b.getWorldPosition(v);
      const d = Math.hypot(v.x - wantX, v.y - wantY);
      if (d < bd) { bd = d; best = { x: v.x, y: v.y }; }
    }
    if (!best) return;
    const u = Math.min(1, (pen.kickT - CONTACT - DIVE_DELAY) / 0.42);
    keeper.group.position.x += (wantX - best.x) * 0.45 * u;
    keeper.group.position.y += (wantY - best.y) * 0.28 * u;
  }
  function handsNear(bx, by) {
    if (!keeper || !keeper.bones) return 9;
    let best = 9;
    const v = api.scratch.v;
    for (const n of ['hand_l', 'hand_r']) {
      const b = keeper.bones[n]; if (!b) continue;
      b.getWorldPosition(v);
      best = Math.min(best, Math.hypot(v.x - bx, v.y - by));
    }
    return best;
  }

  function judge(bx, by) {
    const inX = Math.abs(bx) < GOAL_HW - 0.06;
    const inY = by > 0.08 && by < GOAL_HH - 0.05;
    const near = handsNear(bx, by);
    const saved = inX && inY && near < 0.72;
    pen.judged = true;
    pen.result = !inX || !inY ? 'miss' : saved ? 'save' : 'goal';
    const mult = Math.max(1, 1 + pen.saved / 30);
    pen.pts = pen.result === 'goal' ? Math.round(500 * mult) : pen.result === 'save' ? Math.round(50 * mult) : 0;
    if (pen.pts) api.S.score += pen.pts;
    const BS = api.BS;
    if (pen.result === 'goal') {
      pen.frozen = { x: bx, y: by, z: GOAL_Z - 0.15 };
      BS.penHold = true; BS.air = false; BS.wx = BS.vz = BS.vy = 0;
      rippleAt(Math.max(-GOAL_HW + 0.2, Math.min(GOAL_HW - 0.2, bx)), Math.max(0.3, Math.min(GOAL_HH - 0.2, by)));
    } else if (pen.result === 'save') {
      BS.vz = Math.abs(BS.vz) * 0.25; BS.vy = Math.max(1.5, BS.vy * 0.3); BS.wx *= 0.3;
      if (keeper && keeper.actions && keeper.actions.Catch && (pen.guess === 'Catch' || pen.guess === 'Scoop')) playClip(keeper, pen.guess, 1.4, true);
    }
    pen.phase = 'result'; pen.hold = 0;
    const word = ui('penWord'), res = ui('penResult'), bon = ui('penBonus');
    if (word) word.textContent = pen.result === 'goal' ? 'GOAL!' : pen.result === 'save' ? 'SAVED!' : 'MISS';
    if (word) word.className = pen.result;
    if (res) { res.classList.remove('hidden'); res.classList.remove('go'); void res.offsetWidth; res.classList.add('go'); }
    if (bon) bon.querySelector('b').textContent = '0';
    const stars = ui('penStars'); if (stars) stars.className = '';
    showUI(true); num(''); hint(false); meter(false);
  }

  function finish() {
    const S = api.S;
    S.speed = pen.saved; S.nextSpawn = 20;
    pen.phase = 'off'; pen.frozen = null; api.BS.penHold = false; api.BS.air = false; api.BS.gather = null; api.BS.reach = true;
    stad.visible = false; burst.visible = false; showUI(false);
    for (const q of ribbon) q.m.visible = false;
    pen.next = S.t + PEN_GAP[0] + Math.random() * (PEN_GAP[1] - PEN_GAP[0]);
    const hero = api.getHero();
    if (hero && hero.currentName !== 'Jog_Fwd_Loop') api.syncJog(0.12);
    if (keeper) { keeper.group.position.set(0, 0, GOAL_Z + 0.45); playClip(keeper, 'KeeperIdle', 1, false); }
  }

  function update(dt) {
    const S = api.S, P = api.P, BS = api.BS, hero = api.getHero();
    if (pen.phase === 'off') return;
    if (!P.grounded) {
      P.vy -= api.GRAV * dt; P.y += P.vy * dt;
      if (P.y <= 0) { P.y = 0; P.vy = 0; P.grounded = true; }
    }
    if (pen.phase === 'approach') {
      const left = -stad.position.z;
      pen.approachU = Math.min(1, pen.approachU + dt / 0.6);
      if (left < 6) S.speed = Math.max(0, pen.saved * Math.max(0, left / 6));
      else S.speed = Math.min(S.speed, pen.saved);
      P.x += (0 - P.x) * Math.min(1, dt * 3); P.lane = 1; P.fromX = P.toX = 0; P.laneT = 1;
      const dz = S.speed * dt; stad.position.z += dz; api.scroll(dz); S.dist += dz;
      if (left < 1.2 && hero && hero.currentName === 'Jog_Fwd_Loop') playClip(hero, 'Idle_Loop', 1, false);
      if (stad.position.z >= -0.04) {
        stad.position.z = 0; S.speed = 0;
        BS.p.set(0, api.BR, -0.46); BS.wx = BS.vz = BS.vy = 0; BS.air = false; BS.penHold = true;
        pen.phase = 'countdown'; pen.countT = 0; pen.allow = false;
        if (hero) playClip(hero, 'Idle_Loop', 1, false);
        playClip(keeper, 'KeeperIdle', 1, false);
        showUI(true); meter(true); hint(false); num('3');
        const res = ui('penResult'); if (res) res.classList.add('hidden');
      }
    } else if (pen.phase === 'countdown') {
      S.speed = 0; pen.countT += dt;
      pen.chev = Math.sin(pen.countT * 2.15);
      const n = pen.countT < 1.4 ? '3' : pen.countT < 2.8 ? '2' : pen.countT < 4.2 ? '1' : '';
      num(n);
      pen.allow = pen.countT >= 2.8;
      hint(pen.countT >= 3.6);
      const ch = ui('penChev'); if (ch) ch.style.left = (50 + pen.chev * 42) + '%';
      if (pen.countT > 8) shoot(0, -80, 0.4);
    } else if (pen.phase === 'runup' || pen.phase === 'contact' || pen.phase === 'flight' || pen.phase === 'netcam') {
      S.speed = 0; pen.kickT += dt;
      if (!pen.shot && pen.kickT >= CONTACT) launch();
      if (pen.shot && !pen.dove && pen.kickT >= CONTACT + DIVE_DELAY) {
        pen.dove = true;
        const rate = pen.guess === 'Catch' || pen.guess === 'Scoop' ? 2.1 : DIVE_RATE;
        playClip(keeper, pen.guess, rate, true);
      }
      if (pen.dove && !pen.judged) steerGloves();
      if (pen.shot && !pen.judged) {
        const bx = P.x + BS.p.x, by = BS.p.y, bz = BS.p.z;
        if (bz <= GOAL_Z || (!BS.air && bz > GOAL_Z + 0.4)) judge(bx, by);
      }
      if (pen.phase === 'runup' && pen.kickT >= CONTACT) pen.phase = 'contact';
      else if (pen.phase === 'contact' && pen.kickT >= CONTACT + 0.28) pen.phase = 'flight';
      else if (pen.phase === 'flight' && pen.kickT >= CONTACT + 0.62) pen.phase = 'netcam';
    } else if (pen.phase === 'result') {
      S.speed = 0; pen.hold += dt; animNet(dt);
      if (pen.frozen) { BS.p.set(pen.frozen.x, Math.max(api.BR, pen.frozen.y), pen.frozen.z); BS.penHold = true; BS.air = false; }
      const bon = ui('penBonus');
      if (bon) bon.querySelector('b').textContent = String(Math.round(pen.pts * Math.min(1, pen.hold / 0.7)));
      const stars = ui('penStars');
      if (stars && pen.result === 'goal') stars.className = pen.hold > 0.7 ? 's3' : pen.hold > 0.45 ? 's2' : pen.hold > 0.22 ? 's1' : '';
      for (let i = 0; i < flashes.length; i++) flashes[i].material.opacity = (Math.sin(pen.hold * 18 + i) > 0.55) ? 0.9 : 0;
      if (pen.hold > 2.15) { pen.phase = 'exit'; pen.hold = 0; showUI(false); S.speed = pen.saved; }
    } else if (pen.phase === 'exit') {
      pen.hold += dt;
      S.speed = pen.saved;
      const dz = S.speed * dt; stad.position.z += dz; api.scroll(dz); S.dist += dz;
      BS.penHold = false; BS.gather = null;
      if (hero && hero.currentName !== 'Jog_Fwd_Loop') playClip(hero, 'Jog_Fwd_Loop', api.jogCadence(), false);
      if (stad.position.z > 36) finish();
    }
    if (hero) {
      hero.group.position.set(P.x, P.y, 0);
      if (hero.currentName === 'Jog_Fwd_Loop' && hero.current) hero.current.timeScale = api.jogCadence();
    }
    if (keeper) keeper.update(dt);
    burst.visible = pen.phase === 'countdown';
    const hs = document.getElementById('hScore'), hd = document.getElementById('hDist');
    if (hs && S.state === 'play') hs.textContent = Math.floor(S.score);
    if (hd && S.state === 'play') hd.textContent = Math.floor(S.dist) + ' m';
  }

  function pose() {
    const BS = api.BS, hero = api.getHero();
    if ((pen.phase === 'runup') && hero && hero.bones && hero.bones.foot_r && !pen.shot) {
      hero.bones.foot_r.getWorldPosition(api.scratch.v);
      hero.group.worldToLocal(api.scratch.v);
      BS.p.set(api.scratch.v.x, Math.max(api.BR, api.scratch.v.y), api.scratch.v.z);
      BS.penHold = true;
      const ball = api.getBall();
      if (ball) ball.position.copy(BS.p);
    }
    if (pen.frozen) {
      BS.p.set(pen.frozen.x - api.P.x, Math.max(api.BR, pen.frozen.y), pen.frozen.z);
      const ball = api.getBall();
      if (ball) ball.position.copy(BS.p);
    }
    const ball = api.getBall();
    if (pen.shot && !pen.frozen && ball) {
      ball.getWorldPosition(api.scratch.v2);
      for (let i = ribbon.length - 1; i > 0; i--) ribbon[i].p.copy(ribbon[i - 1].p);
      ribbon[0].p.copy(api.scratch.v2);
      for (let i = 0; i < ribbon.length; i++) {
        const q = ribbon[i]; q.m.visible = i > 0; q.m.position.copy(q.p);
        q.m.material.opacity = 0.55 * (1 - i / ribbon.length);
      }
    } else if (!pen.shot) for (const q of ribbon) q.m.visible = false;
  }

  function cut(camera, camLook, pos, look, fov) {
    camera.position.set(pos[0], pos[1], pos[2]);
    camLook.set(look[0], look[1], look[2]);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.4) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function applyCam() {
    if (pen.phase === 'off' || pen.phase === 'exit' || pen.phase === 'countdown' || window.__camLow) return;
    const camera = api.camera, camLook = api.camLook, P = api.P;
    if (pen.phase === 'approach') {
      const u = pen.approachU;
      camera.position.y += 0.45 * u;
      camera.position.z += 0.35 * u;
      camLook.y -= 0.35 * u;
      camLook.z = -8;
      camera.lookAt(camLook);
      return;
    }
    const B = api.BS, bx = B.p.x, by = Math.max(0.25, B.p.y), bz = B.p.z;
    if (pen.phase === 'runup') cut(camera, camLook, [0.15, 1.85, 4.6], [0, 0.9, -2.2], 54);
    else if (pen.phase === 'contact') cut(camera, camLook, [bx + 1.35, by + 0.35, bz + 1.45], [bx, by + 0.05, bz - 0.35], 40);
    else if (pen.phase === 'flight') cut(camera, camLook, [bx + 2.8, by + 0.9, bz + 0.4], [bx, by, bz - 3.2], 46);
    else if (pen.phase === 'netcam' || pen.phase === 'result') cut(camera, camLook, [0.25, 1.7, -13.9], [bx * 0.25, 1.15, -8.5], 50);
  }

  function render(renderer, scene) {
    if (pen.phase !== 'countdown') return false;
    const camera = api.camera;
    renderer.getDrawingBufferSize(buf);
    const w = buf.x, h = buf.y, mid = (h / 2) | 0;
    renderer.setScissorTest(true);
    renderer.setViewport(0, mid, w, h - mid);
    renderer.setScissor(0, mid, w, h - mid);
    burst.visible = false;
    camera.position.set(0, 1.25, GOAL_Z + 5.4);
    camera.lookAt(0, 1.05, GOAL_Z);
    camera.fov = 30; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    renderer.setViewport(0, 0, w, mid);
    renderer.setScissor(0, 0, w, mid);
    burst.visible = true;
    camera.position.set(1.7, 0.92, 2.15);
    camera.lookAt(0, 0.5, -0.15);
    camera.fov = 40; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    return true;
  }

  return {
    update, pose, applyCam, shoot, render,
    active: () => pen.phase !== 'off',
    consume() {
      if (pen.phase === 'off') {
        if (api.S.state !== 'play' || api.S.t < pen.next) return false;
        begin();
      }
      return true;
    },
    blocksInput: () => pen.phase !== 'off',
    aiming: () => pen.allow,
    swipe: (x0, y0, x1, y1, t0, t1) => shoot(x1 - x0, y1 - y0, Math.max(0.05, (t1 - t0) / 1000)),
    reset() {
      pen.phase = 'off'; pen.frozen = null; api.BS.penHold = false;
      stad.visible = false; burst.visible = false; showUI(false);
      pen.next = api.S.t + (soon ? 2.2 : PEN_GAP[0] + Math.random() * (PEN_GAP[1] - PEN_GAP[0]));
    },
    attachKeeper(runner) {
      keeper = runner;
      if (!keeper) return;
      if (keeper.model) keeper.model.rotation.y = 0;
      stad.add(keeper.group);
      keeper.group.position.set(0, 0, GOAL_Z + 0.45);
      playClip(keeper, 'KeeperIdle', 1, false);
    },
    force: () => { if (pen.phase === 'off') pen.next = api.S.t; }
  };
}

function makeBurst(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, '#8fd0ff'); grd.addColorStop(0.5, '#1a6fe0'); grd.addColorStop(1, '#08357a');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 14;
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 150, 128 + Math.sin(a) * 150); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: t, depthWrite: false }));
  m.position.set(0, 1.15, -1.35);
  return m;
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
