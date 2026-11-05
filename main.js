import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ---------- constants ----------
const LANES = [-2.2, 0, 2.2];
const LANE_TIME = 0.13;
const JUMP_H = 1.45, JUMP_T = 0.66;
const GRAV = 8 * JUMP_H / (JUMP_T * JUMP_T), JUMP_V = 4 * JUMP_H / JUMP_T;
const SLIDE_T = 0.62, BUFFER_T = 0.22, COYOTE_T = 0.1;
const START_SPEED = 13, MAX_SPEED = 30, ACCEL = 0.22;
const CHUNK = 40, NCHUNK = 6;
const COLORS = { red: 0xc8102e, navy: 0x0b1f4d, white: 0xffffff, sky: 0x8fc6ff };
const isMobile = matchMedia('(pointer:coarse)').matches;

// ---------- emblem (original flame, not the club crest) ----------
function drawEmblem(cv) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h);
  g.save(); g.translate(w / 2, h / 2);
  // shield
  g.beginPath(); g.moveTo(0, -70); g.quadraticCurveTo(62, -66, 62, -50); g.lineTo(62, 10);
  g.quadraticCurveTo(58, 52, 0, 74); g.quadraticCurveTo(-58, 52, -62, 10); g.lineTo(-62, -50); g.quadraticCurveTo(-62, -66, 0, -70); g.closePath();
  g.fillStyle = '#0b1f4d'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
  // flame
  const flame = (s, col) => { g.beginPath(); g.moveTo(0, 50 * s); g.bezierCurveTo(-42 * s, 40 * s, -40 * s, -5 * s, -14 * s, -30 * s);
    g.bezierCurveTo(-16 * s, -10 * s, -6 * s, -6 * s, -4 * s, -12 * s); g.bezierCurveTo(-8 * s, -34 * s, 4 * s, -52 * s, 10 * s, -58 * s);
    g.bezierCurveTo(10 * s, -36 * s, 28 * s, -26 * s, 30 * s, -6 * s); g.bezierCurveTo(36 * s, -14 * s, 34 * s, -22 * s, 32 * s, -28 * s);
    g.bezierCurveTo(52 * s, -4 * s, 44 * s, 42 * s, 0, 50 * s); g.closePath(); g.fillStyle = col; g.fill(); };
  g.translate(0, 6); flame(1, '#c8102e'); flame(0.62, '#ff6a3d'); g.translate(0, 10); flame(0.32, '#ffd27a');
  g.restore();
}
document.querySelectorAll('.emblem').forEach(drawEmblem);

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xf6b38a);
scene.fog = new THREE.Fog(FOG, 45, 150);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

// sky dome (sunset gradient)
{
  const geo = new THREE.SphereGeometry(300, 32, 16);
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f6fb5) }, mid: { value: new THREE.Color(0xffb37a) }, bot: { value: new THREE.Color(0xff8a5c) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top,mid,bot; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.08? mix(mid,top,smoothstep(0.08,0.55,h)) : mix(bot,mid,smoothstep(-0.1,0.08,h)); gl_FragColor=vec4(c,1.); }' });
  const sky = new THREE.Mesh(geo, mat); sky.renderOrder = -1; scene.add(sky); scene.userData.sky = sky;
  // sun disc
  const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false }));
  sun.position.set(-40, 30, -280); scene.add(sun);
}

const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a5a3c, 1.25); scene.add(hemi);
const sunL = new THREE.DirectionalLight(0xffe2bf, 2.6);
sunL.position.set(-6, 14, -6); sunL.castShadow = true;
sunL.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(sunL.shadow.camera, { left: -12, right: 12, top: 18, bottom: -12, near: 1, far: 50 });
sunL.shadow.bias = -0.0006; sunL.shadow.normalBias = 0.03;
scene.add(sunL, sunL.target);
const rim = new THREE.DirectionalLight(0xff9a66, 1.6); rim.position.set(4, 5, -10); scene.add(rim);
const fill = new THREE.DirectionalLight(0xbfd6ff, 0.6); fill.position.set(3, 4, 8); scene.add(fill);
const faceL = new THREE.PointLight(0xfff0e0, 0, 8, 1.2); scene.add(faceL);

// ---------- textures ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const turfTex = canvasTex(256, 512, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#3f9a3a' : '#48a843'; g.fillRect(0, i * h / 8, w, h / 8); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${20 + Math.random() * 40},${90 + Math.random() * 60},30,.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
}, [1, CHUNK / 10]);
const walkTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b9b2a8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { const v = 150 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 12},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = 'rgba(80,70,60,.45)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
}, [2, CHUNK / 4]);
const ballTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#fafafa'; g.fillRect(0, 0, w, h);
  const pent = (x, y, r) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9); } g.closePath(); g.fill(); };
  g.fillStyle = '#16213a';
  for (let i = 0; i < 5; i++) { pent(i * w / 5 + 51, h * 0.32, 26); pent(i * w / 5 + 102 - 51 + 51, h * 0.7, 26); }
  pent(w / 2, 6, 40); pent(w / 2, h - 6, 40);
  g.fillStyle = '#c8102e'; g.fillRect(0, h * 0.5 - 3, w, 6);
});
function windowTex(base, lit) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 8; y += 22) for (let x = 10; x < w - 10; x += 28) {
      const on = Math.random() < lit; g.fillStyle = on ? (Math.random() < .5 ? '#ffe7a8' : '#ffd17a') : 'rgba(20,30,55,.75)'; g.fillRect(x, y, 16, 14);
    }
  });
}
const bTex = [windowTex('#9c4a3a', .35), windowTex('#c9a27a', .3), windowTex('#5b6f8f', .4), windowTex('#7b5a4a', .3), windowTex('#d9c7a8', .25)];
bTex.forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });

function numberTex(num, color) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.font = '900 190px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(11,31,77,1)'; g.strokeText(num, w / 2, h / 2 + 8);
    g.fillStyle = color; g.fillText(num, w / 2, h / 2 + 8);
  });
  t.colorSpace = THREE.NoColorSpace; return t;
}

// ---------- kit shader injection ----------
// Body regions are decided in bind-pose space (pre-skinning position) + an "arm" skin-weight attribute.
function kitMaterial(orig, kit) {
  const m = orig.clone();
  m.normalScale = new THREE.Vector2(0.55, 0.55);
  m.roughness = 0.62;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uShirt: { value: new THREE.Color(kit.shirt) }, uTrim: { value: new THREE.Color(kit.trim) }, uShorts: { value: new THREE.Color(kit.shorts) },
      uSock: { value: new THREE.Color(kit.sock) }, uBoot: { value: new THREE.Color(kit.boot) }, uStud: { value: new THREE.Color(kit.stud) },
      uNum: { value: kit.numTex },
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aArm; varying float vArm; varying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArm = aArm; vBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uShirt,uTrim,uShorts,uSock,uBoot,uStud; uniform sampler2D uNum; varying float vArm; varying vec3 vBind;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 p = vBind; float ax = abs(p.x); vec4 kc = vec4(0.);
        if (vArm > 0.5) {
          if (ax < 0.43) { kc = vec4(uShirt,1.); if (ax > 0.355) kc = vec4(uTrim,1.); else if (ax > 0.31 && ax < 0.335) kc = vec4(uTrim,1.); }
        } else if (p.y > 0.98 && p.y < 1.53) {
          kc = vec4(uShirt,1.);
          float neck = 1.47 + 0.02*smoothstep(0.0,0.1,ax);
          if (p.y > neck) kc = vec4(uTrim,1.);
                    if (p.z < -0.02 && p.y > 1.1 && p.y < 1.42 && ax < 0.16) {
            vec2 uvn = vec2(p.x/0.32 + 0.5, (p.y-1.1)/0.32);
            vec4 n = texture2D(uNum, vec2(1.0-uvn.x, uvn.y));
            kc.rgb = mix(kc.rgb, n.rgb, n.a);
          }
          if (p.z > 0.05 && p.y > 1.33 && p.y < 1.43 && p.x > 0.06 && p.x < 0.14) kc.rgb = mix(kc.rgb, uTrim, 0.9);
        } else if (p.y > 0.6 && p.y <= 0.98) {
          kc = vec4(uShorts,1.);
          if (p.y < 0.64) kc = vec4(uTrim,1.);
        } else if (p.y > 0.15 && p.y <= 0.52) {
          kc = vec4(uSock,1.);
          if (p.y > 0.42 && p.y < 0.47) kc = vec4(uTrim,1.);
          if (p.y > 0.47) kc = vec4(uTrim,1.);
        } else if (p.y <= 0.15) {
          kc = vec4(uBoot,1.);
          if (p.y < 0.025) kc = vec4(uStud,1.);
          else if (p.y > 0.07 && p.y < 0.09) kc = vec4(uShirt,1.);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, kc.rgb, kc.a);
      }`);
  };
  m.customProgramCacheKey = () => 'kit';
  return m;
}
function addArmAttribute(mesh) {
  const g = mesh.geometry, bones = mesh.skeleton.bones;
  const armIdx = new Set(); bones.forEach((b, i) => { if (/upperarm|lowerarm|hand|index|middle|pinky|ring|thumb/.test(b.name)) armIdx.add(i); });
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count, a = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 4; k++) if (armIdx.has(si.getComponent(i, k))) s += sw.getComponent(i, k); a[i] = s; }
  g.setAttribute('aArm', new THREE.BufferAttribute(a, 1));
}

// ---------- loading ----------
const manager = new THREE.LoadingManager();
const barFill = document.getElementById('barFill'), loadMsg = document.getElementById('loadMsg');
manager.onProgress = (u, l, t) => { barFill.style.width = (l / t * 100) + '%'; };
const loader = new GLTFLoader(manager);
const loadGLB = (u) => new Promise((res, rej) => loader.load(u, res, (e) => { if (e.total) barFill.style.width = Math.min(95, e.loaded / e.total * 100) + '%'; }, rej));

let heroTemplate = null, clips = {}, modelOK = false, loadError = '';
const HERO_KIT = { shirt: COLORS.red, trim: COLORS.white, shorts: COLORS.navy, sock: COLORS.red, boot: 0x15161c, stud: 0xf4f4f4, numTex: numberTex('10', '#ffffff') };
const RIVAL_KIT = { shirt: 0x7fc4ff, trim: 0x0b1f4d, shorts: 0xffffff, sock: 0x0b1f4d, boot: 0xf2f2f2, stud: 0x0b1f4d, numTex: numberTex('4', '#0b1f4d') };

async function loadAssets() {
  try {
    const [hero, anims, hair, roll, chopC, stepC, roulC, elaC, croC, heelC, rbC] = await Promise.all([loadGLB('assets/hero.glb'), loadGLB('assets/anims.glb'), loadGLB('assets/hair.glb'), loadGLB('assets/rollover.glb?v=11').catch(e => { console.warn('mocap roll-over clip missing', e); return null; }), loadGLB('assets/chop.glb?v=11').catch(() => null), loadGLB('assets/stepover.glb?v=12').catch(() => null), loadGLB('assets/roulette.glb?v=13').catch(() => null), loadGLB('assets/elastico.glb?v=14').catch(() => null), loadGLB('assets/croqueta.glb?v=15').catch(() => null), loadGLB('assets/heel.glb?v=16').catch(() => null), loadGLB('assets/rainbow.glb?v=17').catch(() => null)]);
    if (roll) anims.animations.push(...roll.animations); if (chopC) anims.animations.push(...chopC.animations); if (stepC) anims.animations.push(...stepC.animations); if (roulC) anims.animations.push(...roulC.animations); if (elaC) anims.animations.push(...elaC.animations); if (croC) anims.animations.push(...croC.animations); if (heelC) anims.animations.push(...heelC.animations); if (rbC) anims.animations.push(...rbC.animations);
    const root = hero.scene;
    root.updateMatrixWorld(true);
    let head = null; root.traverse(o => { if (o.isBone && o.name === 'Head') head = o; });
    // attach hair (authored at bind pose) to head bone
    const hairMesh = hair.scene.getObjectByProperty('isMesh', true);
    if (head && hairMesh) {
      hair.scene.updateMatrixWorld(true);
      const m = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(hairMesh.matrixWorld);
      hairMesh.removeFromParent(); hairMesh.matrixAutoUpdate = true; m.decompose(hairMesh.position, hairMesh.quaternion, hairMesh.scale);
      head.add(hairMesh);
      hairMesh.material.color.set(0x2a1a12);
    }
    root.traverse(o => {
      if (o.isMesh && o.material && o.material.name === 'MI_Hair_1') { o.material = o.material.clone(); o.material.color.set(0x2a1a12); }
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (o.isSkinnedMesh && o.name.indexOf('SuperHero') >= 0 || (o.material && o.material.name === 'MI_Superhero_Male')) { addArmAttribute(o); o.userData.body = true; }
      }
    });
    // keep rotation tracks for all bones, translation only on pelvis/root, no scale (prevents stretching from mannequin bone lengths)
    for (const c of anims.animations) {
      c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || (t.name.endsWith('.position') && /^(pelvis|root)\./.test(t.name)));
      clips[c.name] = c;
    }
    heroTemplate = root; modelOK = true;
  } catch (e) {
    console.warn('Model load failed, using fallback runner', e);
    loadError = 'Character model failed to load (' + (e && e.message ? e.message : e) + '). Playing with a simple fallback runner.';
  }
}

// ---------- character ----------
class Runner {
  constructor(kit, isHero) {
    this.group = new THREE.Group();
    this.isHero = isHero;
    if (modelOK) {
      const model = SkeletonUtils.clone(heroTemplate);
      model.traverse(o => { if (o.isMesh && o.userData.body) { o.material = kitMaterial(o.material, kit); } });
      model.rotation.y = Math.PI; // model faces +Z; we run toward -Z
      this.model = model; this.group.add(model);
      this.bones = {}; this.rest = {}; model.traverse(o => { if (o.isBone) { this.bones[o.name] = o; this.rest[o.name] = o.quaternion.clone(); } });
      this.mixer = new THREE.AnimationMixer(model);
      this.actions = {};
      for (const k in clips) this.actions[k] = this.mixer.clipAction(clips[k]);
      for (const k of ['Jump_Start', 'Jump_Land', 'Roll', 'Death01']) { const a = this.actions[k]; if (a) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } }
      this.current = null;
    } else {
      // fallback: chunky stylized figure from primitives
      const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: .6 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 6, 12), mat(kit.shirt)); body.position.y = 1.15;
      const headM = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), mat(0xd9a07a)); headM.position.y = 1.75;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), mat(kit.shorts)); legs.position.y = 0.45;
      [body, headM, legs].forEach(m => { m.castShadow = true; this.group.add(m); });
      this.model = this.group;
    }
  }
  play(name, fade = 0.12, timeScale = 1) {
    if (!this.mixer || !this.actions[name]) return;
    const a = this.actions[name];
    if (this.current === a) { a.timeScale = timeScale; return; }
    a.reset(); a.timeScale = timeScale; a.enabled = true; a.setEffectiveWeight(1);
    if (this.current) a.crossFadeFrom(this.current, fade, false);
    a.play(); this.current = a; this.currentName = name;
  }
  update(dt) {
    if (this.mixer) {
      this.mixer.update(dt);
      // stylize proportions: bigger head, chunkier boots (applied after animation)
      const b = this.bones;
      if (b.Head) b.Head.scale.setScalar(1.42);
      if (b.neck_01) b.neck_01.scale.setScalar(1.0);
      for (const s of ['foot_l', 'foot_r']) if (b[s]) b[s].scale.setScalar(1.22);
      for (const s of ['hand_l', 'hand_r']) if (b[s]) b[s].scale.setScalar(1.12);
    }
  }
}

// ---------- world ----------
const world = new THREE.Group(); scene.add(world);
const chunkGeo = { turf: new THREE.PlaneGeometry(7.6, CHUNK), walk: new THREE.PlaneGeometry(6, CHUNK), curb: new THREE.BoxGeometry(0.4, 0.25, CHUNK) };
const turfMat = new THREE.MeshStandardMaterial({ map: turfTex, roughness: .95 });
const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: .9 });
const curbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: .6, metalness: .3 });
const steelDark = new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: .7, metalness: .2 });
const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
buildingGeo.translate(0, 0.5, 0);
const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: .9 });

const chunks = [];
function makeChunk(i) {
  const g = new THREE.Group();
  const turf = new THREE.Mesh(chunkGeo.turf, turfMat); turf.rotation.x = -Math.PI / 2; turf.receiveShadow = true; g.add(turf);
  // lane lines
  for (const x of [-1.1, 1.1]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.08, CHUNK), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 })); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.01, 0); g.add(l); }
  for (const s of [-1, 1]) {
    const curb = new THREE.Mesh(chunkGeo.curb, curbMat); curb.position.set(s * 3.95, 0.12, 0); curb.receiveShadow = true; g.add(curb);
    const walk = new THREE.Mesh(chunkGeo.walk, walkMat); walk.rotation.x = -Math.PI / 2; walk.position.set(s * 7.1, 0.2, 0); walk.receiveShadow = true; g.add(walk);
  }
  // buildings
  const bmats = bTex.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: .85 }));
  for (const s of [-1, 1]) {
    let z = -CHUNK / 2;
    while (z < CHUNK / 2) {
      const w = 6 + Math.random() * 6, d = Math.min(CHUNK / 2 - z, 6 + Math.random() * 6), h = 8 + Math.random() * 26;
      const mat = bmats[(Math.random() * bmats.length) | 0].clone(); mat.map = mat.map.clone(); mat.map.repeat.set(Math.max(1, Math.round(d / 4)), Math.max(1, Math.round(h / 8))); mat.map.needsUpdate = true;
      const b = new THREE.Mesh(buildingGeo, mat); b.scale.set(w, h, d - 0.4); b.position.set(s * (10.2 + w / 2), 0, z + d / 2); b.receiveShadow = true; g.add(b);
      const roof = new THREE.Mesh(buildingGeo, roofMat); roof.scale.set(w + 0.4, 0.5, d); roof.position.set(b.position.x, h, b.position.z); g.add(roof);
      z += d;
    }
  }
  // elevated L track on the left side
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, CHUNK), steelMat); deck.position.set(-7.2, 6.2, 0); deck.castShadow = true; g.add(deck);
  for (const x of [-8.2, -6.2]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, CHUNK), steelDark); rail.position.set(x, 6.55, 0); g.add(rail); }
  for (let z = -CHUNK / 2 + 5; z < CHUNK / 2; z += 10) for (const x of [-8.7, -5.7]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.2, 0.35), steelDark); col.position.set(x, 3.1, z); col.castShadow = true; g.add(col);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.3), steelDark); brace.position.set(-7.2, 5.8, z); g.add(brace);
  }
  // street lamps + flags
  for (const s of [-1, 1]) for (let z = -15; z < 20; z += 20) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 8), steelDark); pole.position.set(s * 4.6, 2.25, z + (s > 0 ? 10 : 0)); g.add(pole);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), new THREE.MeshStandardMaterial({ color: Math.random() < .5 ? COLORS.red : COLORS.navy, side: THREE.DoubleSide, roughness: .8 }));
    banner.position.set(s * 4.95, 3.4, pole.position.z); banner.rotation.y = Math.PI / 2; g.add(banner);
  }
  g.position.z = -i * CHUNK;
  world.add(g); chunks.push(g);
}
for (let i = -1; i < NCHUNK - 1; i++) makeChunk(i);

// distant skyline silhouettes
{
  const sk = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x6d5a7a, fog: false, transparent: true, opacity: .85 });
  const mat2 = new THREE.MeshBasicMaterial({ color: 0x8f6f86, fog: false, transparent: true, opacity: .7 });
  for (let i = 0; i < 46; i++) {
    const w = 6 + Math.random() * 12, h = 20 + Math.random() * (i % 9 === 0 ? 90 : 45);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), i % 2 ? mat : mat2); b.position.set(-180 + i * 8 + Math.random() * 4, h / 2 - 5, -240 - (i % 3) * 8); sk.add(b);
    if (i % 9 === 0) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 18), mat); sp.position.set(b.position.x, h + 4, b.position.z); sk.add(sp); }
  }
  scene.add(sk); scene.userData.skyline = sk;
}

// passing L train on the elevated track (Chicago flavor)
const lTrain = new THREE.Group();
{
  const car = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#c9ced6'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b2a44';
    for (let x = 10; x < w - 20; x += 30) g.fillRect(x, 12, 20, 22);
    g.fillStyle = '#c8102e'; g.fillRect(0, 42, w, 6); g.fillStyle = '#0b1f4d'; g.fillRect(0, 50, w, 4);
  });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.9, 14), [new THREE.MeshStandardMaterial({ map: car }), new THREE.MeshStandardMaterial({ map: car }), new THREE.MeshStandardMaterial({ color: 0xaab0b8 }), new THREE.MeshStandardMaterial({ color: 0x777 }), new THREE.MeshStandardMaterial({ color: 0xc9ced6 }), new THREE.MeshStandardMaterial({ color: 0xc9ced6 })]);
    m.material.forEach(mm => mm.roughness = .5);
    m.material[0].map = car; m.position.z = i * 14.6; m.castShadow = true; lTrain.add(m);
  }
  lTrain.position.set(-7.2, 7.95, -200); scene.add(lTrain);
}

// ---------- obstacles & collectibles (pooled) ----------
const obstacles = [], balls = [];
const pools = { barrier: [], bar: [], train: [], rival: [], ball: [] };

function mkBarrier() {
  const g = new THREE.Group();
  const stripe = canvasTex(128, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#c8102e'; c.beginPath(); c.moveTo(i * 20, 0); c.lineTo(i * 20 + 20, 0); c.lineTo(i * 20, h); c.lineTo(i * 20 - 20, h); c.fill(); } });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 0.15), new THREE.MeshStandardMaterial({ map: stripe, roughness: .5 })); board.position.y = 0.62; board.castShadow = true; g.add(board);
  for (const x of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), steelDark); l.position.set(x, 0.31, 0); g.add(l); const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.6), steelDark); f.position.set(x, 0.03, 0); g.add(f); }
  g.userData = { type: 'barrier', h: 0.85, d: 0.4 }; return g;
}
function mkBar() {
  const g = new THREE.Group();
  const banner = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#0b1f4d'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8102e'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10); c.fillStyle = '#fff'; c.font = '900 34px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SLIDE!', w / 2, h / 2 + 2); });
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.18), new THREE.MeshStandardMaterial({ map: banner, roughness: .6 })); b.position.y = 1.55; b.castShadow = true; g.add(b);
  for (const x of [-0.95, 0.95]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.85, 8), steelDark); p.position.set(x, 0.92, 0); g.add(p); }
  g.userData = { type: 'bar', y0: 1.15, d: 0.3 }; return g;
}
function mkTrain() {
  const g = new THREE.Group();
  const side = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#d4d9e0'; c.fillRect(0, 0, w, h); c.fillStyle = '#1b2a44'; for (let x = 12; x < w - 20; x += 40) c.fillRect(x, 22, 28, 40);
    c.fillStyle = '#c8102e'; c.fillRect(0, 76, w, 12); c.fillStyle = '#0b1f4d'; c.fillRect(0, 92, w, 6);
  });
  const front = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#d4d9e0'; c.fillRect(0, 0, w, h); c.fillStyle = '#1b2a44'; c.fillRect(14, 18, 100, 44); c.fillStyle = '#c8102e'; c.fillRect(0, 76, w, 12); c.fillStyle = '#ffe58a'; c.fillRect(16, 96, 18, 12); c.fillRect(94, 96, 18, 12); c.fillStyle = '#c8102e'; c.font = '900 22px Arial'; c.textAlign = 'center'; c.fillText('RED', 64, 52); });
  const sm = new THREE.MeshStandardMaterial({ map: side, roughness: .45, metalness: .2 }), fm = new THREE.MeshStandardMaterial({ map: front, roughness: .45 }), tm = new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: .5 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.7, 12), [sm, sm, tm, tm, fm, fm]); m.position.y = 1.5; m.castShadow = true; g.add(m);
  g.userData = { type: 'train', d: 12 }; return g;
}
function mkBall() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), new THREE.MeshStandardMaterial({ map: ballTex, roughness: .35, emissive: 0x332200, emissiveIntensity: .25 }));
  m.castShadow = true; m.userData = { type: 'ball' }; return m;
}
function get(type) {
  let o = pools[type].pop();
  if (!o) {
    if (type === 'barrier') o = mkBarrier(); else if (type === 'bar') o = mkBar(); else if (type === 'train') o = mkTrain(); else if (type === 'ball') o = mkBall();
    else if (type === 'rival') { const r = new Runner(RIVAL_KIT, false); o = r.group; o.userData = { type: 'rival', d: 0.6, runner: r }; }
  }
  o.visible = true; world.add(o); return o;
}
function release(o) { o.visible = false; world.remove(o); pools[o.userData.type].push(o); }

// ---------- game state ----------
const S = { state: 'loading', speed: START_SPEED, dist: 0, score: 0, ballsN: 0, t: 0, nextSpawn: 30, best: +(localStorage.getItem('fireRushBest') || 0) };
const P = { lane: 1, fromX: 0, toX: 0, laneT: 1, x: 0, y: 0, vy: 0, grounded: true, sinceGround: 0, slideT: 0, buffer: null, bufferT: 0, beaten: 0 };
let hero, footBall = null;

function resetGame() {
  for (const o of obstacles) release(o); obstacles.length = 0;
  for (const b of balls) release(b); balls.length = 0;
  Object.assign(S, { speed: START_SPEED, dist: 0, score: 0, ballsN: 0, t: 0, nextSpawn: 26 });
  Object.assign(P, { lane: 1, fromX: 0, toX: 0, laneT: 1, x: 0, y: 0, vy: 0, grounded: true, sinceGround: 0, slideT: 0, buffer: null, beaten: 0 });
  SK.m = null; SK.prev = null; SK.combo = 0; SK.comboT = -9; SM.g = 1; SM.t = SM.delay = -1;
  hero.group.position.set(0, 0, 0); hero.group.rotation.set(0, 0, 0); BS.p.set(...B0); BS.v.set(0, 0, 0); BS.lastX = 0; BS.wx = 0; BS.vz = 0; BS.phys = false; BS.rel = null; BS.gather = null; BS.gT = 0; BS.air = false; BS.vy = 0; BS.hist = null; _fcp.l = _fcp.r = null;
}

function spawnRow(z) {
  // choose a pattern guaranteeing at least one passable lane
  const r = Math.random(), lanes = [0, 1, 2].sort(() => Math.random() - .5);
  const types = S.dist < 150 ? ['barrier', 'bar', 'rival'] : ['barrier', 'bar', 'rival', 'train', 'train'];
  const n = S.dist < 100 ? 1 : (r < .55 ? 1 : 2);
  const used = [];
  for (let i = 0; i < n; i++) {
    const lane = lanes[i], type = types[(Math.random() * types.length) | 0];
    const o = get(type); o.position.set(LANES[lane], 0, z - (type === 'train' ? 6 : 0)); o.userData.lane = lane; o.userData.beaten = false;
    if (type === 'rival') { const rr = o.userData.runner; rr.model.rotation.y = 0; rr.play(Math.random() < .5 ? 'Idle_Loop' : 'Dance_Loop', 0, 1); rr.mixer.setTime(Math.random()*2); }
    obstacles.push(o); used.push(lane);
  }
  // balls: a trail in a free lane, or arcing over a barrier
  const free = [0, 1, 2].filter(l => !used.includes(l));
  const bl = free.length ? free[(Math.random() * free.length) | 0] : 1;
  for (let k = 0; k < 6; k++) { const b = get('ball'); b.position.set(LANES[bl], 0.7, z + 10 - k * 2.4); b.userData.lane = bl; balls.push(b); }
}

// ---------- input ----------
function act(a) {
  if (S.state === 'title') { if (a === 'tap' || a) startGame(); return; }
  if (S.state === 'over') return;
  if (S.state !== 'play') return;
  P.buffer = a; P.bufferT = BUFFER_T; tryBuffered();
}
function tryBuffered() {
  const a = P.buffer; if (!a) return;
  if (a === 'left' || a === 'right') {
    const nl = Math.max(0, Math.min(2, P.lane + (a === 'left' ? -1 : 1)));
    // rainbow in the air: the swipe waits (buffered) until the ball is back on the grass, unless a rival forces the switch now
    if (nl !== P.lane && BS.air && !threatAhead(P.lane)) return;
    if (nl !== P.lane) { const d = nl > P.lane ? 1 : -1; P.lane = nl; P.fromX = P.x; P.toX = LANES[nl]; P.laneT = 0; if (P.grounded && P.slideT <= 0 && !BS.air) startLaneMove(d); else SK.m = null; }
    P.buffer = null;
  } else if (a === 'up') {
    if (P.grounded || P.sinceGround < COYOTE_T) {
      cancelSkill(); P.vy = JUMP_V; P.grounded = false; P.sinceGround = 1; P.slideT = 0; P.buffer = null;
      hero.play('Jump_Start', 0.06, 1.6);
    }
  } else if (a === 'down') {
    if (!P.grounded) { P.vy = Math.min(P.vy, -JUMP_V * 1.2); } // fast-fall, then slide when landing (stays buffered)
    else { cancelSkill(); P.slideT = SLIDE_T; P.buffer = null; hero.play('Roll', 0.06, 1.35); }
  }
}
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(); let a = null;
  if (k === 'arrowleft' || k === 'a') a = 'left'; else if (k === 'arrowright' || k === 'd') a = 'right';
  else if (k === 'arrowup' || k === 'w' || k === ' ') a = 'up'; else if (k === 'arrowdown' || k === 's') a = 'down';
  else if (k === 'enter') a = 'tap';
  if (a) { e.preventDefault(); if (S.state === 'over' && a === 'tap') startGame(); else act(a); }
});
let tStart = null;
canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; tStart = { x: t.clientX, y: t.clientY, done: false }; }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!tStart || tStart.done) return; const t = e.changedTouches[0]; const dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
  if (Math.hypot(dx, dy) > 28) { tStart.done = true; act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); }
}, { passive: true });
canvas.addEventListener('touchend', () => { if (tStart && !tStart.done && S.state === 'title') startGame(); tStart = null; }, { passive: true });
document.getElementById('startBtn').addEventListener('click', () => startGame());
document.getElementById('againBtn').addEventListener('click', () => startGame());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

// on-screen touch buttons
document.body.classList.toggle('desk', !isMobile);
const showControls = isMobile || ('ontouchstart' in window) || /[?&]buttons=1/.test(location.search);
for (const b of document.querySelectorAll('#controls .tb')) {
  const down = (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); act(b.dataset.a); };
  const up = (e) => { e.preventDefault(); e.stopPropagation(); b.classList.remove('down'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  for (const ev of ['touchstart', 'touchend', 'touchmove']) b.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
let popT = 0;
function popup(txt, sub, bonus) {
  const p = document.getElementById('popup'); p.innerHTML = '<b></b>' + (sub ? '<small></small>' : '');
  p.firstChild.textContent = txt; if (sub) p.lastChild.textContent = sub; p.classList.toggle('bonus', !!bonus);
  p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); clearTimeout(popT); popT = setTimeout(() => p.classList.remove('on'), bonus ? 900 : 620);
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function startGame() {
  if (S.state === 'loading') return;
  resetGame(); S.state = 'play'; show('title', false); show('over', false); show('hud', true); show('controls', showControls);
  hero.play('Jog_Fwd_Loop', 0.2, 1.25);
}
function gameOver() {
  S.state = 'over'; SK.m = null; SK.prev = null; hero.model.rotation.y = Math.PI; hero.play("Death01", 0.08, 1.2); show("controls", false); hero.model.position.set(0, 0, 0); if (footBall) footBall.position.set(...B0);
  if (S.score > S.best) { S.best = Math.floor(S.score); localStorage.setItem('fireRushBest', S.best); }
  $('oScore').textContent = Math.floor(S.score); $('oBalls').textContent = S.ballsN; $('oDist').textContent = Math.floor(S.dist) + 'm';
  $('oBest').textContent = 'Best: ' + S.best; $('tBest').textContent = S.best;
  setTimeout(() => { if (S.state === 'over') { show('over', true); show('hud', false); } }, 900);
}

// ---------- lane-change skill moves ----------
// Rebuilt from frame-by-frame study of EA SPORTS FC 26 behind-the-player footage (see fire-rush-shots/ref/spec.md).
// Every move is authored for an exit to the RIGHT (d=+1) and mirrored for the LEFT.
// Times are in SECONDS. Frames: G = hero group frame (x right, y up, -z forward); B = body frame (G rotated by the move's spin).
//  touches: ball-foot contacts. During [t0,t1] the ball centre follows `ball` keys and the foot is SOLVED from the ball
//           (ankle = ball - surfaceOffset), then the ball is re-pinned to the actual foot bone after IK, so contact is exact.
//  feet:    ankle targets for the rest of the move (B frame), plus foot yaw / pitch / roll; legs are solved with 2-bone IK.
//  bones:   upper-body pose layers [x,y,z] in the character frame (spine -z = lean right; y = twist, + = turn left;
//           upperarm_r +z / upperarm_l -z = arm out).
const SKILL_BONUS = 150, DODGE_WIN = 7.5, COMBO_WIN = 3.2;
// monotone cubic (Fritsch-Carlson) so lateral travel never stalls at a key, unlike the eased per-segment kf
// body lateral progress: the move's lane curve, but never slower than needed to clear a threat that is already close
// (late dodges: the body leaves the old lane by ~0.45 of the lane width before the obstacle arrives, no clipping through it)
function laneProg(sk, tt) {
  const t = tt !== undefined ? Math.min(sk.m.T, tt) : Math.min(1, sk.t) * sk.m.T, lp = laneAt(t, sk.m.lane);
  if (!sk.ev) return lp; const tg = t / (sk.rate || 1), u = Math.min(1, tg / sk.ev);
  return Math.max(lp, 0.55 * u * u * (3 - 2 * u));
}
function laneAt(t, k) {
  const n = k.length; if (t <= k[0][0]) return k[0][1]; if (t >= k[n - 1][0]) return k[n - 1][1];
  const m = []; for (let i = 0; i < n; i++) {
    const dl = i > 0 ? (k[i][1] - k[i - 1][1]) / (k[i][0] - k[i - 1][0]) : null, dr = i < n - 1 ? (k[i + 1][1] - k[i][1]) / (k[i + 1][0] - k[i][0]) : null;
    m[i] = dl === null ? dr : dr === null ? dl : (dl * dr <= 0 ? 0 : 2 / (1 / dl + 1 / dr)); }
  m[0] = 0; m[n - 1] = 0;
  let i = 1; while (t > k[i][0]) i++;
  const h = k[i][0] - k[i - 1][0], u = (t - k[i - 1][0]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k[i - 1][1] + (u3 - 2 * u2 + u) * h * m[i - 1] + (-2 * u3 + 3 * u2) * k[i][1] + (u3 - u2) * h * m[i];
}
function kf(t, keys) {
  if (!keys) return 0; if (typeof keys === 'number') return keys;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) { const [t1, v1] = keys[i]; if (t <= t1) { const [t0, v0] = keys[i - 1]; let u = (t - t0) / (t1 - t0 || 1); u = u * u * (3 - 2 * u); return v0 + (v1 - v0) * u; } }
  return keys[keys.length - 1][1];
}
const BR = 0.135;                 // ball radius (≈ real ball / player ratio, slightly oversized for readability)
const B0 = [0, BR, -0.46];        // dribble spot in G
const A = 0.105;                  // ankle height with the foot flat on the ground
// ball centre relative to the ankle, in the RIGHT foot's frame (x right, y up, z back); x is mirrored for the left foot.
// Measured from the rig: ankle 0.117 above the sole, heel 0.06 behind the ankle, toe tip 0.26 ahead, foot edges -0.046/+0.088.
const SURF = { sole: [0.0, -(0.117 + BR), -0.08], inside: [-(0.05 + BR * 0.92), BR - A, -0.07], outside: [0.09 + BR * 0.92, BR - A, -0.05],
  heel: [0.0, BR - A + 0.01, 0.06 + BR * 0.95], toe: [0.0, BR - A, -(0.25 + BR * 0.85)] };
const MOVES = [
  // ROULETTE: counter-clockwise from above for a right exit (turns LEFT first, back to the camera -> chest to camera -> exit right).
  { id: 'roulette', name: 'ROULETTE!', sub: 'MARADONA', T: 0.85, beatT: 0.42,
    lane: [[0, 0], [0.12, 0.03], [0.42, 0.5], [0.72, 0.95], [0.85, 1]], // lateral progress old lane -> new lane (body), driven by the move timeline
    spin: [[0, 0], [0.12, 0], [0.3, 1.85], [0.42, 3.14], [0.56, 4.55], [0.72, 5.8], [0.85, 6.283]],
    drop: [[0, 0], [0.12, -0.06], [0.3, -0.04], [0.6, -0.04], [0.85, 0]],
    touches: [
      { foot: 'r', surf: 'sole', t0: 0.12, t1: 0.3, frame: 'G', ball: [[0.12, 0.1, -0.36], [0.3, 0.02, -0.14]] },
      { foot: 'l', surf: 'sole', t0: 0.36, t1: 0.48, frame: 'G', ball: [[0.36, 0.02, -0.1], [0.48, 0.24, -0.14]] }],
    feet: { r: { p: [[0, 0.12, A, 0], [0.07, 0.12, 0.14, -0.22], [0.36, 0.1, A, 0.06], [0.6, 0.12, A, 0.05], [0.72, 0.16, 0.13, -0.2], [0.85, 0.12, A, -0.1]], yaw: [[0, 0], [0.12, -0.35], [0.3, -0.2], [0.4, 0]] , pitch: [[0, 0], [0.12, 0.2], [0.3, 0.1], [0.36, 0]] },
            l: { p: [[0, -0.12, A, 0.02], [0.12, -0.08, A, 0.04], [0.3, -0.07, A, 0.05], [0.34, -0.1, 0.14, -0.12], [0.55, -0.16, 0.12, -0.22], [0.66, -0.15, A, -0.2], [0.85, -0.12, A, -0.05]], yaw: [[0.3, 0], [0.36, 0.3], [0.48, 0.2], [0.6, 0]], pitch: [[0.3, 0], [0.36, 0.2], [0.48, 0.1], [0.55, 0]] } },
    bones: {
      upperarm_r: [0, 0, [[0, 0], [0.15, 1.0], [0.65, 1.0], [0.85, 0]]], upperarm_l: [0, 0, [[0, 0], [0.15, -1.0], [0.65, -1.0], [0.85, 0]]],
      lowerarm_r: [[[0, 0], [0.15, 0.6], [0.65, 0.6], [0.85, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.15, 0.6], [0.65, 0.6], [0.85, 0]], 0, 0] } },
  // RONALDO CHOP: left leg swings over, goes BEHIND the planted right leg, inside of the left foot chops the ball right.
  { id: 'chop', name: 'RONALDO CHOP!', sub: 'CR7', T: 0.5, beatT: 0.22,
    lane: [[0, 0], [0.18, 0.04], [0.27, 0.28], [0.45, 0.96], [0.5, 1]], // lateral progress old lane -> new lane (body), driven by the move timeline
    drop: [[0, 0], [0.06, 0.02], [0.2, -0.150], [0.32, -0.120], [0.5, 0]],
    touches: [{ foot: 'l', surf: 'inside', t0: 0.2, t1: 0.27, ball: [[0.2, 0.02, 0.1], [0.27, 0.3, 0.04]], hit: 1 }],
    feet: { r: { p: [[0, 0.12, A, 0], [0.08, 0.13, A, -0.04], [0.32, 0.13, A, -0.04], [0.42, 0.24, 0.17, -0.3], [0.5, 0.26, A, -0.3]], yaw: [[0, 0], [0.15, 0.25], [0.32, 0.2], [0.45, -0.3], [0.5, -0.2]] },
            l: { p: [[0, -0.12, A, 0.02], [0.09, -0.06, 0.27, -0.36], [0.16, 0.0, 0.2, 0.12], [0.36, 0.2, 0.14, -0.02], [0.5, 0.0, A, -0.15]], yaw: [[0, 0], [0.1, 0.1], [0.18, 0.35], [0.3, 0.25], [0.45, 0]], pitch: [[0, 0], [0.09, 0.3], [0.17, 0], [0.5, 0]] } },
    bones: { pelvis: [0, [[0, 0], [0.16, 0.25], [0.3, -0.25], [0.45, -0.3], [0.5, 0]], 0], spine_02: [[[0, 0], [0.2, 0.12], [0.5, 0]], [[0, 0], [0.16, -0.12], [0.32, 0.1], [0.5, 0]], [[0, 0], [0.2, 0.05], [0.36, -0.25], [0.5, 0]]],
      neck_01: [[[0, 0], [0.18, 0.3], [0.32, 0.1], [0.5, 0]], 0, 0],
      upperarm_l: [0, 0, [[0, 0], [0.14, -1.25], [0.34, -1.1], [0.5, 0]]], upperarm_r: [[[0, 0], [0.3, -0.3], [0.5, 0]], 0, [[0, 0], [0.14, 1.25], [0.34, 1.0], [0.5, 0]]],
      lowerarm_r: [[[0, 0], [0.2, 0.4], [0.5, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.2, 0.4], [0.5, 0]], 0, 0] } },
  // ELASTICO (right exit = left foot): outside pushes the ball left, foot wraps, inside snaps it back right.
  { id: 'elastico', name: 'ELASTICO!', sub: 'RONALDINHO', T: 0.5, beatT: 0.34,
    lane: [[0, 0], [0.1, -0.05], [0.26, -0.08], [0.38, 0.35], [0.5, 1]], // lateral progress old lane -> new lane (body), driven by the move timeline
    drop: [[0, 0], [0.12, -0.090], [0.36, -0.105], [0.5, 0]],
    touches: [{ foot: 'l', surf: 'outside', t0: 0.1, t1: 0.22, ball: [[0.1, -0.08, -0.4], [0.22, -0.28, -0.42]] },
              { foot: 'l', surf: 'inside', t0: 0.29, t1: 0.38, ball: [[0.29, -0.31, -0.41], [0.38, 0.06, -0.38]], hit: 1 }],
    feet: { r: { p: [[0, 0.12, A, 0], [0.1, 0.15, A, -0.04], [0.36, 0.15, A, -0.04], [0.43, 0.3, 0.16, -0.25], [0.5, 0.34, A, -0.3]], yaw: [[0, 0], [0.36, 0], [0.45, -0.3], [0.5, -0.2]] },
            l: { p: [[0, -0.12, A, 0.02], [0.06, -0.02, 0.15, -0.3], [0.26, -0.5, 0.17, -0.5], [0.45, 0.12, 0.15, -0.35], [0.5, 0.0, A, -0.25]], yaw: [[0, 0], [0.1, -0.2], [0.22, -0.25], [0.29, 0.25], [0.38, 0.3], [0.5, 0]], pitch: [[0, 0], [0.1, 0.1], [0.38, 0.1], [0.5, 0]] } },
    bones: { pelvis: [0, [[0, 0], [0.18, 0.2], [0.38, -0.3], [0.5, 0]], 0], spine_02: [[[0, 0], [0.15, 0.12], [0.5, 0]], [[0, 0], [0.2, 0.12], [0.4, -0.15], [0.5, 0]], [[0, 0], [0.2, 0.18], [0.4, -0.22], [0.5, 0]]],
      neck_01: [[[0, 0], [0.15, 0.3], [0.38, 0.25], [0.5, 0]], 0, 0],
      upperarm_l: [0, 0, [[0, 0], [0.2, -0.5], [0.4, -1.1], [0.5, 0]]], upperarm_r: [0, 0, [[0, 0], [0.2, 1.1], [0.4, 0.5], [0.5, 0]]],
      lowerarm_r: [[[0, 0], [0.2, 0.5], [0.5, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.2, 0.5], [0.5, 0]], 0, 0] } },
  // STEP-OVER (right exit): LEFT leg circles over the ball inside->outside (fake left), RIGHT outside pushes it right.
  { id: 'scissor', name: 'STEP-OVER!', sub: 'BODY FEINT', T: 0.55, beatT: 0.42,
    lane: [[0, 0], [0.27, -0.06], [0.4, 0.06], [0.5, 0.75], [0.55, 1]], // lateral progress old lane -> new lane (body), driven by the move timeline
    drop: [[0, 0], [0.1, -0.060], [0.27, -0.165], [0.42, -0.105], [0.55, 0]],
    touches: [{ foot: 'r', surf: 'outside', t0: 0.4, t1: 0.47, ball: [[0.4, 0.04, -0.42], [0.47, 0.24, -0.5]], hit: 1 }],
    feet: { l: { p: [[0, -0.12, A, 0.02], [0.08, 0.06, 0.3, -0.26], [0.14, 0.0, 0.36, -0.64], [0.2, -0.24, 0.27, -0.58], [0.27, -0.36, A, -0.3], [0.44, -0.34, A, -0.3], [0.55, -0.12, A, -0.15]], yaw: [[0, 0], [0.08, -0.6], [0.14, 0], [0.22, 0.6], [0.3, 0.4], [0.55, 0]], pitch: [[0, 0], [0.12, 0.2], [0.25, 0], [0.55, 0]] },
            r: { p: [[0, 0.12, A, 0], [0.3, 0.13, A, -0.02], [0.36, 0.12, 0.17, -0.28], [0.55, 0.3, A, -0.42]], yaw: [[0, 0], [0.3, 0], [0.4, 0.2], [0.47, 0.25], [0.55, -0.1]] } },
    bones: { pelvis: [0, [[0, 0], [0.18, 0.22], [0.44, -0.3], [0.55, 0]], 0], spine_02: [[[0, 0], [0.2, 0.1], [0.55, 0]], [[0, 0], [0.18, 0.15], [0.44, -0.12], [0.55, 0]], [[0, 0], [0.2, 0.22], [0.45, -0.2], [0.55, 0]]],
      neck_01: [[[0, 0], [0.12, 0.3], [0.45, 0.2], [0.55, 0]], 0, 0],
      upperarm_l: [0, 0, [[0, 0], [0.2, -0.35], [0.44, -1.1], [0.55, 0]]], upperarm_r: [0, 0, [[0, 0], [0.2, 1.15], [0.44, 0.6], [0.55, 0]]],
      lowerarm_r: [[[0, 0], [0.2, 0.5], [0.55, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.2, 0.5], [0.55, 0]], 0, 0] } },
  // LA CROQUETA (right exit): left inside taps it across, right inside collects and carries it on, body slides right.
  { id: 'croqueta', name: 'LA CROQUETA!', sub: 'INIESTA', T: 0.48, beatT: 0.28,
    lane: [[0, 0], [0.15, 0.22], [0.37, 0.8], [0.48, 1]], // lateral progress old lane -> new lane (body), driven by the move timeline
    px: [[0, 0], [0.3, 0.1], [0.48, 0.12]], drop: [[0, 0], [0.08, -0.150], [0.36, -0.165], [0.48, 0]],
    touches: [{ foot: 'l', surf: 'inside', t0: 0.07, t1: 0.15, ball: [[0.07, -0.14, -0.36], [0.15, 0.0, -0.37]] },
              { foot: 'r', surf: 'inside', t0: 0.27, t1: 0.37, ball: [[0.27, 0.21, -0.38], [0.37, 0.32, -0.5]], hit: 1 }],
    feet: { l: { p: [[0, -0.13, A, 0], [0.04, -0.12, 0.13, -0.22], [0.25, -0.02, A, -0.14], [0.48, -0.02, A, -0.2]], yaw: [[0, 0], [0.07, 0.25], [0.15, 0.2], [0.25, 0]] },
            r: { p: [[0, 0.13, A, 0], [0.14, 0.26, A, -0.06], [0.22, 0.28, 0.14, -0.28], [0.48, 0.3, A, -0.38]], yaw: [[0, 0], [0.22, -0.3], [0.27, -0.45], [0.37, -0.35], [0.48, 0]] } },
    bones: { pelvis: [0, [[0, 0], [0.15, 0.1], [0.37, -0.2], [0.48, 0]], 0], spine_02: [[[0, 0], [0.12, 0.12], [0.48, 0]], 0, [[0, 0], [0.15, 0.05], [0.37, -0.15], [0.48, 0]]],
      neck_01: [[[0, 0], [0.1, 0.35], [0.4, 0.3], [0.48, 0]], 0, 0],
      upperarm_l: [0, 0, [[0, 0], [0.12, -0.9], [0.4, -0.9], [0.48, 0]]], upperarm_r: [0, 0, [[0, 0], [0.12, 0.9], [0.4, 0.9], [0.48, 0]]],
      lowerarm_r: [[[0, 0], [0.15, 0.5], [0.48, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.15, 0.5], [0.48, 0]], 0, 0] } },
  // SIMPLE RAINBOW: right sole rolls the ball back onto the left heel, left heel flicks it up over the right shoulder.
  // RAINBOW FLICK (right exit, spec.md 1.05 s): right sole drags the ball back between the feet, right instep rolls it UP the back of the
  // standing left calf (long, readable), left heel flicks it up and over the head; the flight is physical (solveFlick) into the new lane
  { id: 'rainbow', name: 'RAINBOW FLICK!', sub: 'NEYMAR', T: 1.05, beatT: 0.6, flick: true,
    lane: [[0, 0], [0.55, 0.05], [0.75, 0.35], [0.95, 0.85], [1.05, 1]],
    drop: [[0, 0], [0.25, -0.06], [0.5, -0.1], [0.62, -0.03], [0.78, -0.07], [1.05, 0]],
    touches: [{ foot: 'r', surf: 'sole', t0: 0.04, t1: 0.24, ball: [[0.04, 0.06, -0.34], [0.24, -0.04, 0.12]] },
              { foot: 'r', surf: 'inside', t0: 0.27, t1: 0.53, ball: [[0.27, -0.06, BR, 0.17], [0.4, -0.09, 0.22, 0.2], [0.53, -0.1, 0.36, 0.2]] },
              { foot: 'l', surf: 'heel', t0: 0.55, t1: 0.63, ball: [[0.55, -0.1, 0.38, 0.19], [0.63, -0.07, 0.6, 0.08]], hit: 1 }],
    feet: { r: { p: [[0, 0.12, A, 0], [0.64, 0.14, A, 0.08], [0.8, 0.12, 0.17, -0.22], [0.93, 0.12, A, -0.18], [1.05, 0.12, A, 0]], pitch: [[0, 0], [0.04, 0.25], [0.24, 0.15], [0.27, 0], [0.53, 0], [0.64, 0]], yaw: [[0.25, 0], [0.3, -0.35], [0.53, -0.35], [0.64, 0]] },
            l: { p: [[0, -0.12, A, 0.02], [0.5, -0.12, A, 0.03], [0.76, -0.12, 0.3, 0.12], [0.9, -0.12, A, -0.16], [1.05, -0.12, A, 0]], pitch: [[0.5, 0], [0.56, -0.4], [0.63, -1.0], [0.78, -0.6], [0.92, 0]] } },
    bones: { spine_02: [[[0, 0], [0.3, 0.25], [0.6, 0.3], [0.8, 0.05], [1.05, 0]], 0, 0], neck_01: [[[0, 0], [0.3, 0.35], [0.62, 0.3], [0.8, -0.45], [1.05, 0]], 0, 0],
      upperarm_l: [[[0, 0], [0.4, 0.3], [0.8, 0], [1.05, 0]], 0, [[0, 0], [0.4, -0.9], [0.8, -0.5], [1.05, 0]]], upperarm_r: [[[0, 0], [0.4, 0.3], [0.8, 0], [1.05, 0]], 0, [[0, 0], [0.4, 0.9], [0.8, 0.5], [1.05, 0]]],
      lowerarm_r: [[[0, 0], [0.4, 0.6], [1.05, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.4, 0.6], [1.05, 0]], 0, 0] } },
  // LATERAL HEEL TO HEEL (right exit): right foot steps over, its heel taps the ball back, left heel (behind the right leg) pokes it right.
  { id: 'heel', name: 'HEEL TO HEEL!', sub: 'BACKHEEL', T: 0.5, beatT: 0.22,
    lane: [[0, 0], [0.2, 0.05], [0.27, 0.3], [0.45, 0.96], [0.5, 1]], // lateral progress old lane -> new lane (body), driven by the move timeline
    drop: [[0, 0], [0.1, -0.090], [0.3, -0.135], [0.5, 0]],
    touches: [{ foot: 'r', surf: 'heel', t0: 0.08, t1: 0.14, ball: [[0.08, 0.08, -0.36], [0.14, 0.03, -0.2]] },
              { foot: 'l', surf: 'heel', t0: 0.2, t1: 0.27, ball: [[0.2, -0.01, 0.04], [0.27, 0.26, 0.0]], hit: 1 }],
    feet: { r: { p: [[0, 0.12, A, 0], [0.05, 0.1, 0.22, -0.5], [0.22, 0.14, A, -0.26], [0.38, 0.26, A, -0.32], [0.5, 0.3, A, -0.4]], yaw: [[0, 0], [0.14, 0.05], [0.3, -0.2], [0.5, 0]] },
            l: { p: [[0, -0.12, A, 0.02], [0.13, -0.1, A, 0.0], [0.18, -0.04, 0.17, 0.08], [0.36, 0.08, 0.14, -0.12], [0.5, 0.02, A, -0.28]], yaw: [[0, 0], [0.14, 0.4], [0.2, 1.3], [0.27, 1.25], [0.4, 0.3], [0.5, 0]], pitch: [[0.14, 0], [0.2, -0.2], [0.3, 0], [0.5, 0]] } },
    bones: { pelvis: [0, [[0, 0], [0.15, 0.18], [0.3, -0.3], [0.5, 0]], 0], spine_02: [[[0, 0], [0.12, 0.15], [0.5, 0]], [[0, 0], [0.15, 0.1], [0.32, -0.12], [0.5, 0]], [[0, 0], [0.15, 0.05], [0.34, -0.22], [0.5, 0]]],
      neck_01: [[[0, 0], [0.1, 0.35], [0.3, 0.2], [0.5, 0]], 0, 0],
      upperarm_l: [0, 0, [[0, 0], [0.15, -0.9], [0.35, -1.0], [0.5, 0]]], upperarm_r: [0, 0, [[0, 0], [0.15, 0.9], [0.35, 0.6], [0.5, 0]]],
      lowerarm_r: [[[0, 0], [0.15, 0.5], [0.5, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.15, 0.5], [0.5, 0]], 0, 0] } },
];
// plain lane change: sole roll-over (d=+1: RIGHT sole rolls the ball right across the body, plant foot shuffles)
// SOLE ROLL-OVER (plain lane change), authored for d=+1 = moving RIGHT: a CROSSOVER sole roll. The LEFT sole (foot on the
// side we move AWAY from) comes onto the top of the ball while we are still in the old lane and rolls it across the body
// to the right, in front of the planted RIGHT foot; the ball leads us into the new lane, the left foot crosses over after
// it and the right foot skips out. Mirrored for d=-1 (moving LEFT: RIGHT sole rolls it left, left foot planted).
const ROLLOVER = { id: 'rollover', name: '', T: 0.32, beatT: 0.12,
  lane: [[0, 0], [0.04, 0.06], [0.2, 0.6], [0.32, 1]],
  drop: [[0, 0], [0.05, -0.08], [0.22, -0.07], [0.32, 0]],
  touches: [{ foot: 'l', surf: 'sole', t0: 0.04, t1: 0.18, ball: [[0.04, -0.06, -0.38], [0.18, 0.38, -0.43]], hit: 1 }],
  feet: { l: { p: [[0, -0.12, A, 0.02], [0.03, -0.08, 0.3, -0.3], [0.2, 0.34, 0.2, -0.38], [0.26, 0.16, A, -0.22], [0.32, -0.1, A, 0]],
               yaw: [[0, 0], [0.04, 0.45], [0.18, 0.4], [0.26, 0]], pitch: [[0, 0], [0.04, 0.32], [0.18, 0.22], [0.26, 0]] },
          // plant foot: held on the ground in world space for the first 60 ms (body already moving right), then skips out
          r: { p: [[0, 0.12, A, 0], [0.06, -0.01, A, 0.02], [0.13, 0.06, 0.15, 0.0], [0.21, 0.3, A, -0.06], [0.32, 0.12, A, 0]],
               yaw: [[0, 0], [0.13, -0.15], [0.21, -0.1], [0.32, 0]] } },
  bones: { neck_01: [[[0, 0], [0.08, 0.25], [0.32, 0]], 0, 0],
    upperarm_l: [0, 0, [[0, 0], [0.1, -0.6], [0.3, 0]]], upperarm_r: [0, 0, [[0, 0], [0.1, 0.9], [0.3, 0]]] } };

// ---------- MOCAP roll-over legs ----------
// Captured foot trajectories (MediaPipe heavy, FC Cincinnati clip, Butterworth 5 Hz, retargeted + rig-scaled in Blender):
// 17 frames, per frame [ankle_l, ankle_r, heel_l, heel_r, toe_l, toe_r] in G (x right, y up, -z fwd), hip-centred, ground y=0.
// L = moving LEFT (right sole rolls), R = mirrored (left sole rolls).
const MCF = {"L":[[[-0.0374,0.1132,-0.4018],[0.2548,0.1264,0.1873],[-0.0172,0.077,-0.4039],[0.2641,0.0921,0.1638],[-0.0263,0.0933,-0.4818],[0.3223,0.1055,0.0716]],[[-0.0551,0.1061,-0.4064],[0.2896,0.1481,0.2355],[-0.0344,0.0691,-0.4106],[0.2962,0.1132,0.2125],[-0.0241,0.0729,-0.4863],[0.3671,0.1228,0.1244]],[[-0.0604,0.0817,-0.3364],[0.347,0.1615,0.1958],[-0.0386,0.044,-0.337],[0.3534,0.1261,0.1664],[-0.0038,0.0321,-0.4177],[0.444,0.1447,0.0846]],[[-0.032,0.0603,-0.2411],[0.4109,0.1862,0.0645],[-0.0083,0.0223,-0.2365],[0.4202,0.1525,0.0265],[0.0376,0.0,-0.3309],[0.5235,0.191,-0.0512]],[[0.0073,0.0598,-0.212],[0.4542,0.2288,-0.0877],[0.0323,0.0221,-0.2079],[0.4673,0.1983,-0.1326],[0.0752,0.0007,-0.307],[0.5774,0.258,-0.215]],[[0.0346,0.0647,-0.213],[0.462,0.2632,-0.2119],[0.0598,0.027,-0.2121],[0.477,0.2345,-0.263],[0.1007,0.0086,-0.3065],[0.5943,0.3074,-0.3526]],[[0.0619,0.065,-0.1929],[0.4463,0.2709,-0.2768],[0.0888,0.0269,-0.1939],[0.4615,0.242,-0.3305],[0.1358,0.0155,-0.2868],[0.577,0.3165,-0.4221]],[[0.1038,0.0649,-0.1833],[0.4194,0.27,-0.2951],[0.1348,0.0264,-0.1856],[0.4333,0.2397,-0.3494],[0.1979,0.0314,-0.2849],[0.5355,0.306,-0.4432]],[[0.1444,0.0663,-0.223],[0.3616,0.2823,-0.2848],[0.1802,0.0279,-0.2299],[0.3694,0.2524,-0.3368],[0.2598,0.0521,-0.3367],[0.4689,0.3006,-0.4316]],[[0.1656,0.084,-0.2869],[0.2249,0.3014,-0.3035],[0.2055,0.049,-0.2999],[0.2228,0.2741,-0.3496],[0.2823,0.083,-0.4002],[0.3203,0.2898,-0.4399]],[[0.1788,0.1179,-0.2977],[0.0621,0.3089,-0.3633],[0.2223,0.0888,-0.3123],[0.0507,0.2816,-0.4056],[0.2868,0.12,-0.3991],[0.1228,0.2733,-0.4972]],[[0.1921,0.1375,-0.2396],[-0.0341,0.2987,-0.3813],[0.2362,0.112,-0.2533],[-0.0513,0.2689,-0.42],[0.2882,0.1345,-0.3295],[-0.007,0.2615,-0.5163]],[[0.1942,0.1253,-0.1644],[-0.0843,0.2635,-0.3376],[0.2373,0.1,-0.1775],[-0.1028,0.2321,-0.3729],[0.2763,0.1214,-0.245],[-0.0614,0.236,-0.4715]],[[0.1626,0.0949,-0.1222],[-0.1507,0.2101,-0.2914],[0.2043,0.0676,-0.1335],[-0.1708,0.177,-0.3259],[0.238,0.0944,-0.198],[-0.1178,0.1836,-0.4274]],[[0.1195,0.0643,-0.0951],[-0.1867,0.1479,-0.2383],[0.1593,0.0341,-0.103],[-0.2087,0.113,-0.2722],[0.1991,0.055,-0.1706],[-0.1499,0.1085,-0.3758]],[[0.1096,0.0519,-0.0339],[-0.1558,0.0941,-0.1529],[0.1502,0.0205,-0.0364],[-0.1767,0.0584,-0.1842],[0.1899,0.0237,-0.0974],[-0.119,0.0405,-0.2868]],[[0.112,0.0585,0.0595],[-0.0993,0.0681,-0.065],[0.1546,0.0284,0.0659],[-0.1165,0.0328,-0.0937],[0.1819,0.0147,0.027],[-0.0591,0.0089,-0.1887]]],"R":[[[-0.2781,0.1068,0.2044],[0.0408,0.1529,-0.4386],[-0.2883,0.0674,0.1788],[0.0187,0.1092,-0.4409],[-0.3518,0.07,0.0781],[0.0287,0.1289,-0.5259]],[[-0.3161,0.1233,0.2571],[0.0602,0.1489,-0.4436],[-0.3233,0.0838,0.232],[0.0375,0.1042,-0.4482],[-0.4007,0.0796,0.1357],[0.0263,0.1062,-0.5308]],[[-0.3787,0.1261,0.2138],[0.0659,0.1233,-0.3672],[-0.3858,0.0861,0.1816],[0.0421,0.0777,-0.3678],[-0.4846,0.0876,0.0924],[0.0041,0.0574,-0.4559]],[[-0.4485,0.1398,0.0704],[0.0349,0.0941,-0.2631],[-0.4587,0.1011,0.0289],[0.0091,0.0477,-0.2581],[-0.5714,0.1216,-0.0558],[-0.0411,0.0138,-0.3611]],[[-0.4957,0.1773,-0.0957],[-0.008,0.0854,-0.2314],[-0.5101,0.1412,-0.1448],[-0.0352,0.0391,-0.227],[-0.6302,0.1836,-0.2347],[-0.0821,0.0068,-0.3351]],[[-0.5043,0.2132,-0.2312],[-0.0377,0.0851,-0.2325],[-0.5207,0.1787,-0.2871],[-0.0653,0.0388,-0.2315],[-0.6487,0.234,-0.3849],[-0.1099,0.0102,-0.3345]],[[-0.4871,0.2249,-0.3022],[-0.0676,0.0798,-0.2106],[-0.5038,0.1901,-0.3608],[-0.0969,0.0326,-0.2116],[-0.6298,0.2475,-0.4607],[-0.1482,0.0104,-0.313]],[[-0.4578,0.2294,-0.3221],[-0.1133,0.071,-0.2001],[-0.473,0.1935,-0.3813],[-0.1472,0.0226,-0.2026],[-0.5844,0.2446,-0.4838],[-0.216,0.0149,-0.311]],[[-0.3947,0.2549,-0.3108],[-0.1576,0.0641,-0.2434],[-0.4032,0.2206,-0.3676],[-0.1966,0.0148,-0.2509],[-0.5118,0.2526,-0.4711],[-0.2835,0.0247,-0.3675]],[[-0.2455,0.304,-0.3313],[-0.1808,0.079,-0.3131],[-0.2432,0.2747,-0.3816],[-0.2243,0.0325,-0.3273],[-0.3496,0.2716,-0.4801],[-0.3081,0.0538,-0.4368]],[[-0.0678,0.3459,-0.3966],[-0.1952,0.1133,-0.325],[-0.0553,0.3185,-0.4427],[-0.2426,0.0725,-0.3409],[-0.1341,0.2945,-0.5427],[-0.313,0.0931,-0.4357]],[[0.0372,0.3547,-0.4162],[-0.2097,0.1319,-0.2616],[0.056,0.3258,-0.4585],[-0.2578,0.095,-0.2765],[0.0076,0.3085,-0.5635],[-0.3145,0.1088,-0.3597]],[[0.092,0.3267,-0.3685],[-0.212,0.1181,-0.1794],[0.1122,0.2963,-0.407],[-0.2591,0.0816,-0.1938],[0.067,0.2919,-0.5147],[-0.3016,0.0969,-0.2674]],[[0.1645,0.2822,-0.3181],[-0.1775,0.0915,-0.1334],[0.1864,0.2502,-0.3557],[-0.223,0.0531,-0.1457],[0.1286,0.2464,-0.4665],[-0.2598,0.0754,-0.2161]],[[0.2037,0.2217,-0.2602],[-0.1304,0.0671,-0.1038],[0.2278,0.1882,-0.2971],[-0.1738,0.0259,-0.1125],[0.1636,0.1711,-0.4102],[-0.2173,0.0404,-0.1862]],[[0.17,0.1566,-0.1668],[-0.1196,0.0556,-0.037],[0.1929,0.122,-0.2011],[-0.1639,0.0129,-0.0397],[0.1298,0.0904,-0.3131],[-0.2072,0.0081,-0.1063]],[[0.1084,0.1166,-0.071],[-0.1223,0.0622,0.065],[0.1272,0.0816,-0.1023],[-0.1688,0.0206,0.072],[0.0645,0.0436,-0.206],[-0.1985,0.0,0.0295]]]};
const MC_Y = A - 0.055;                                   // captured flat-foot ankle height -> rig ankle height
// per move: m.F = captured frames {L,R}, m.warp = game time -> capture frame index
function mcIdx(m, t) { const k = m.warp, n = m.F.L.length - 1; if (t <= 0) return 0; for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return n; }
function mcRaw(m, d, j, t, out) { // Catmull-Rom through the captured frames
  const fr = m.F[d < 0 ? 'L' : 'R'], n = fr.length - 1, f = mcIdx(m, t), i = Math.min(n - 1, Math.floor(f)), u = f - i, g = (k) => fr[Math.max(0, Math.min(n, k))][j];
  const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), u2 = u * u, u3 = u2 * u;
  for (let c = 0; c < 3; c++) out.setComponent(c, 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3));
  return out;
}
const ROLLOVER_MC = { id: 'rollover', mc: true, name: '', T: 0.32, beatT: 0.16,
  lane: [[0, 0], [0.04, 0.01], [0.13, 0.12], [0.2, 0.85], [0.25, 0.995], [0.32, 1]],
  drop: [[0, 0], [0.08, -0.05], [0.25, -0.06], [0.32, 0]],
  touches: [{ foot: 'l', surf: 'sole', t0: 0.04, t1: 0.28, mc: true, ball: [[0.04, 0, -0.4], [0.28, 0, -0.4]], hit: 1 }],
  feet: {}, bones: {}, F: MCF, warp: [[0, 0], [0.04, 5], [0.28, 13], [0.32, 16]], clip: 'Rollover' };
ROLLOVER_MC.beat = ROLLOVER_MC.beatT / ROLLOVER_MC.T;
// RONALDO CHOP (mocap): Zaleto slow-mo tutorial (youtube pBXlfYAYmk8, 3.0-9.0 s), capture frames 75..230 @50 fps -> 31 keys.
// Authored for d=+1: the LEFT leg lifts, swings BEHIND the planted right leg, its INSIDE chops the ball right (contact authored,
// approach / recovery / support leg / upper body captured). L set = moving left (right foot chops).
const CHOP_MC = { id: 'chop', mc: true, name: 'RONALDO CHOP!', sub: 'CR7', T: 0.45, beatT: 0.3, clip: 'Chop', F: {"L":[[[-0.1628,0.1423,-0.3406],[0.1233,0.0547,0.1637],[-0.1466,0.1052,-0.3584],[0.1165,0.0239,0.1412],[-0.0878,0.1367,-0.4988],[0.201,0.0234,0.0671]],[[-0.16,0.1489,-0.4295],[0.1286,0.0426,0.1462],[-0.1439,0.1117,-0.4553],[0.1242,0.0106,0.1187],[-0.0896,0.167,-0.6008],[0.2123,0.0192,0.0317]],[[-0.1429,0.1627,-0.481],[0.1233,0.0365,0.175],[-0.1243,0.1276,-0.5124],[0.1187,0.0041,0.1469],[-0.0684,0.2016,-0.6554],[0.2153,0.0206,0.0569]],[[-0.1436,0.1867,-0.5191],[0.1249,0.0422,0.224],[-0.1236,0.1547,-0.555],[0.1183,0.0106,0.1979],[-0.0671,0.2506,-0.6938],[0.2185,0.0253,0.1058]],[[-0.1428,0.2073,-0.5167],[0.1371,0.0556,0.2874],[-0.123,0.1758,-0.5524],[0.1289,0.0261,0.2651],[-0.0707,0.2604,-0.6912],[0.2258,0.0284,0.171]],[[-0.1433,0.2239,-0.4995],[0.148,0.0664,0.3746],[-0.1238,0.1921,-0.5329],[0.138,0.0388,0.3571],[-0.0712,0.2551,-0.6715],[0.2296,0.0338,0.2609]],[[-0.139,0.2212,-0.4758],[0.1366,0.0888,0.4268],[-0.118,0.1886,-0.5055],[0.1216,0.0639,0.4147],[-0.0632,0.2331,-0.6446],[0.1959,0.0439,0.3204]],[[-0.1139,0.2065,-0.4136],[0.1202,0.134,0.4543],[-0.0917,0.1721,-0.4362],[0.1012,0.1128,0.4461],[-0.0495,0.1962,-0.5855],[0.1541,0.0696,0.3593]],[[-0.0894,0.1911,-0.365],[0.0955,0.1695,0.4556],[-0.0667,0.1558,-0.3825],[0.076,0.1504,0.4533],[-0.0338,0.1638,-0.5324],[0.1157,0.0991,0.3828]],[[-0.0973,0.1915,-0.3672],[0.0727,0.1866,0.4733],[-0.0759,0.1569,-0.3842],[0.0501,0.1681,0.4748],[-0.0421,0.1627,-0.5347],[0.0781,0.1113,0.4126]],[[-0.0977,0.1842,-0.3477],[0.0665,0.1975,0.4979],[-0.0774,0.1493,-0.3627],[0.0411,0.1805,0.5026],[-0.0402,0.1473,-0.5111],[0.0599,0.1149,0.4443]],[[-0.0796,0.161,-0.2977],[0.0658,0.2327,0.4891],[-0.0586,0.125,-0.3086],[0.039,0.2193,0.5002],[-0.012,0.1159,-0.4527],[0.0624,0.1517,0.455]],[[-0.0393,0.1151,-0.2006],[0.0468,0.294,0.4021],[-0.0153,0.0769,-0.2053],[0.0174,0.286,0.4157],[0.0459,0.0607,-0.3352],[0.0281,0.2146,0.4032]],[[-0.0321,0.1003,-0.1684],[0.0309,0.3267,0.3473],[-0.007,0.0617,-0.1714],[0.0002,0.3196,0.3613],[0.0632,0.0378,-0.2959],[0.0096,0.2439,0.3578]],[[-0.0449,0.0973,-0.1669],[0.0109,0.3407,0.2964],[-0.0179,0.0592,-0.1698],[-0.0201,0.3324,0.3098],[0.055,0.0309,-0.2916],[-0.0072,0.2552,0.3081]],[[-0.0624,0.0874,-0.1558],[0.0008,0.3348,0.2559],[-0.0347,0.0495,-0.1575],[-0.0307,0.3253,0.2683],[0.0487,0.0224,-0.2802],[-0.0187,0.2421,0.2644]],[[-0.0711,0.0768,-0.1363],[0.0102,0.3062,0.2179],[-0.0433,0.0394,-0.1359],[-0.0197,0.2928,0.2275],[0.0459,0.0167,-0.2538],[-0.001,0.2148,0.2183]],[[-0.0746,0.0685,-0.1233],[0.0372,0.2808,0.207],[-0.0479,0.0315,-0.1222],[0.0097,0.2641,0.2144],[0.0428,0.0112,-0.2341],[0.0419,0.1911,0.2034]],[[-0.0871,0.0694,-0.1279],[0.0938,0.2634,0.2282],[-0.0636,0.0321,-0.1288],[0.071,0.2443,0.2351],[0.0318,0.0158,-0.24],[0.1204,0.1754,0.2285]],[[-0.0987,0.0751,-0.1349],[0.1358,0.2383,0.1584],[-0.0766,0.037,-0.137],[0.1183,0.2151,0.1584],[0.0188,0.0233,-0.2439],[0.1951,0.1644,0.1348]],[[-0.095,0.0633,-0.0974],[0.1479,0.2331,0.0345],[-0.071,0.0237,-0.0956],[0.1333,0.2087,0.0253],[0.0091,0.0033,-0.1939],[0.2228,0.1761,-0.0213]],[[-0.1192,0.0623,-0.0683],[0.2117,0.2121,0.0297],[-0.0971,0.023,-0.0633],[0.2002,0.1876,0.0132],[-0.0317,0.0,-0.1636],[0.2932,0.1687,-0.0425]],[[-0.1321,0.0794,-0.0653],[0.3199,0.1903,0.0596],[-0.1131,0.0421,-0.0619],[0.3153,0.1653,0.0367],[-0.0487,0.0282,-0.1703],[0.4157,0.1668,-0.0215]],[[-0.1431,0.0943,-0.0992],[0.421,0.1843,0.0388],[-0.1251,0.0584,-0.0995],[0.4235,0.1608,0.0097],[-0.0623,0.0541,-0.2237],[0.5147,0.1824,-0.0569]],[[-0.1134,0.0879,-0.1103],[0.5048,0.183,0.0364],[-0.0946,0.0527,-0.1161],[0.5149,0.1604,0.0048],[-0.0289,0.0626,-0.2511],[0.605,0.1963,-0.0643]],[[-0.1171,0.0915,-0.1953],[0.5132,0.1815,-0.0101],[-0.1002,0.0571,-0.2113],[0.5242,0.159,-0.0461],[-0.0404,0.0897,-0.3528],[0.62,0.2176,-0.1169]],[[-0.1238,0.1063,-0.2782],[0.4571,0.1788,-0.0626],[-0.1055,0.073,-0.299],[0.4649,0.1559,-0.0992],[-0.0538,0.1162,-0.4378],[0.5485,0.2119,-0.1684]],[[-0.0684,0.1005,-0.2711],[0.3683,0.1842,-0.1079],[-0.0429,0.0675,-0.2886],[0.3723,0.1616,-0.142],[0.0028,0.1002,-0.423],[0.425,0.1977,-0.2135]],[[-0.0151,0.1127,-0.2835],[0.3197,0.1816,-0.1237],[0.0173,0.0826,-0.299],[0.3221,0.1588,-0.1565],[0.0588,0.1059,-0.4329],[0.3594,0.1829,-0.2309]],[[0.001,0.1619,-0.3444],[0.3003,0.1876,-0.1244],[0.0373,0.1349,-0.3598],[0.3022,0.1641,-0.1558],[0.0786,0.1482,-0.489],[0.3472,0.1839,-0.2278]],[[0.0211,0.1979,-0.405],[0.2587,0.1964,-0.1275],[0.0585,0.1717,-0.4232],[0.2582,0.1729,-0.1579],[0.082,0.1785,-0.5457],[0.3146,0.1862,-0.2257]]],"R":[[[-0.1202,0.0511,0.1596],[0.1586,0.1894,-0.332],[-0.1135,0.0223,0.1376],[0.1428,0.1502,-0.3493],[-0.1959,0.0062,0.0654],[0.0856,0.17,-0.4862]],[[-0.1253,0.0383,0.1425],[0.1559,0.1952,-0.4186],[-0.1211,0.0079,0.1157],[0.1403,0.156,-0.4438],[-0.2069,0.0,0.0309],[0.0873,0.1999,-0.5855]],[[-0.1201,0.0333,0.1706],[0.1393,0.2056,-0.4688],[-0.1157,0.0026,0.1431],[0.1211,0.1679,-0.4994],[-0.2098,0.0008,0.0555],[0.0666,0.2297,-0.6388]],[[-0.1218,0.0386,0.2183],[0.1399,0.229,-0.5059],[-0.1153,0.009,0.1929],[0.1205,0.1942,-0.5409],[-0.2129,0.0048,0.1031],[0.0654,0.2772,-0.6762]],[[-0.1336,0.0494,0.2801],[0.1392,0.249,-0.5036],[-0.1256,0.0222,0.2584],[0.1199,0.2147,-0.5384],[-0.2201,0.0064,0.1666],[0.0689,0.2874,-0.6737]],[[-0.1443,0.0578,0.3651],[0.1396,0.2653,-0.4869],[-0.1345,0.0328,0.348],[0.1207,0.2307,-0.5194],[-0.2238,0.011,0.2543],[0.0694,0.2824,-0.6545]],[[-0.1332,0.0819,0.416],[0.1355,0.2619,-0.4637],[-0.1185,0.0604,0.4042],[0.115,0.2262,-0.4927],[-0.1909,0.0271,0.3123],[0.0616,0.2594,-0.6283]],[[-0.1171,0.129,0.4428],[0.1111,0.2429,-0.4031],[-0.0986,0.1118,0.4348],[0.0894,0.2052,-0.4251],[-0.1501,0.0599,0.3502],[0.0483,0.221,-0.5706]],[[-0.0931,0.1681,0.444],[0.0871,0.2233,-0.3558],[-0.0741,0.1531,0.4418],[0.065,0.1847,-0.3728],[-0.1127,0.0958,0.3731],[0.033,0.1864,-0.5189]],[[-0.0709,0.189,0.4612],[0.0949,0.2252,-0.3578],[-0.0488,0.1751,0.4627],[0.0739,0.1875,-0.3744],[-0.0761,0.1146,0.4021],[0.0411,0.1869,-0.5212]],[[-0.0648,0.2008,0.4853],[0.0952,0.2181,-0.3389],[-0.04,0.1889,0.4899],[0.0755,0.1804,-0.3535],[-0.0584,0.1215,0.433],[0.0391,0.1715,-0.4981]],[[-0.0642,0.2352,0.4767],[0.0775,0.1922,-0.2902],[-0.038,0.2271,0.4875],[0.0571,0.1532,-0.3008],[-0.0608,0.1569,0.4434],[0.0117,0.1357,-0.4412]],[[-0.0457,0.2984,0.3919],[0.0383,0.14,-0.1955],[-0.0169,0.2961,0.4051],[0.0149,0.0984,-0.2],[-0.0274,0.2245,0.3929],[-0.0448,0.0713,-0.3267]],[[-0.0301,0.3332,0.3385],[0.0313,0.1242,-0.1642],[-0.0002,0.332,0.3522],[0.0068,0.082,-0.1671],[-0.0093,0.2565,0.3487],[-0.0616,0.0457,-0.2884]],[[-0.0107,0.3506,0.2889],[0.0437,0.1237,-0.1627],[0.0196,0.3482,0.3019],[0.0175,0.0816,-0.1655],[0.007,0.2707,0.3003],[-0.0536,0.0405,-0.2842]],[[-0.0007,0.3468,0.2494],[0.0608,0.1173,-0.1518],[0.0299,0.3433,0.2615],[0.0338,0.0752,-0.1535],[0.0183,0.26,0.2577],[-0.0475,0.0334,-0.2731]],[[-0.01,0.3171,0.2123],[0.0693,0.1086,-0.1328],[0.0192,0.3096,0.2217],[0.0422,0.067,-0.1325],[0.001,0.2301,0.2128],[-0.0448,0.0284,-0.2474]],[[-0.0363,0.2873,0.2018],[0.0727,0.1011,-0.1202],[-0.0095,0.2761,0.209],[0.0467,0.0601,-0.1191],[-0.0408,0.199,0.1982],[-0.0417,0.0235,-0.2281]],[[-0.0914,0.26,0.2224],[0.0849,0.1043,-0.1247],[-0.0692,0.2455,0.2291],[0.0619,0.0636,-0.1255],[-0.1173,0.1693,0.2227],[-0.031,0.0301,-0.2339]],[[-0.1323,0.2277,0.1543],[0.0962,0.112,-0.1315],[-0.1153,0.2083,0.1543],[0.0747,0.0708,-0.1335],[-0.1901,0.1447,0.1313],[-0.0184,0.0398,-0.2377]],[[-0.1441,0.2204,0.0336],[0.0926,0.0998,-0.0949],[-0.1299,0.1993,0.0247],[0.0692,0.0568,-0.0931],[-0.2171,0.151,-0.0208],[-0.0089,0.0221,-0.189]],[[-0.2063,0.1881,0.0289],[0.1162,0.1033,-0.0665],[-0.1951,0.1664,0.0128],[0.0947,0.061,-0.0616],[-0.2857,0.1307,-0.0414],[0.0309,0.0264,-0.1594]],[[-0.3118,0.1468,0.0581],[0.1288,0.1224,-0.0637],[-0.3072,0.1233,0.0357],[0.1103,0.0825,-0.0603],[-0.4052,0.1062,-0.021],[0.0475,0.0571,-0.166]],[[-0.4103,0.1223,0.0378],[0.1395,0.139,-0.0967],[-0.4127,0.099,0.0094],[0.1219,0.1006,-0.0969],[-0.5016,0.1031,-0.0555],[0.0607,0.0848,-0.2181]],[[-0.492,0.1055,0.0354],[0.1105,0.1272,-0.1075],[-0.5018,0.0817,0.0047],[0.0922,0.0894,-0.1132],[-0.5896,0.0999,-0.0627],[0.0282,0.087,-0.2447]],[[-0.5002,0.1025,-0.0098],[0.1141,0.1314,-0.1903],[-0.5109,0.0785,-0.0449],[0.0977,0.0948,-0.2059],[-0.6043,0.1179,-0.1139],[0.0394,0.1155,-0.3438]],[[-0.4455,0.1102,-0.0611],[0.1206,0.1471,-0.2711],[-0.4531,0.0865,-0.0967],[0.1028,0.1112,-0.2914],[-0.5345,0.1256,-0.1641],[0.0525,0.1437,-0.4267]],[[-0.3589,0.1319,-0.1051],[0.0667,0.1312,-0.2642],[-0.3628,0.1092,-0.1384],[0.0418,0.0943,-0.2813],[-0.4142,0.1346,-0.208],[-0.0027,0.1177,-0.4122]],[[-0.3116,0.1384,-0.1206],[0.0147,0.1332,-0.2763],[-0.314,0.1158,-0.1526],[-0.0169,0.0979,-0.2914],[-0.3503,0.1324,-0.225],[-0.0573,0.1129,-0.4219]],[[-0.2927,0.1479,-0.1213],[-0.001,0.1782,-0.3356],[-0.2946,0.1246,-0.1518],[-0.0363,0.1451,-0.3507],[-0.3384,0.1356,-0.222],[-0.0766,0.1505,-0.4766]],[[-0.2521,0.1641,-0.1242],[-0.0206,0.2095,-0.3947],[-0.2516,0.1413,-0.1539],[-0.057,0.1771,-0.4125],[-0.3066,0.1438,-0.22],[-0.0799,0.1794,-0.5319]]]},
  // v18: slow-mo comparison showed the captured chop contact at capture frames ~205-216 (idx ~25-27): touch moved to 0.25-0.31 s
  warp: [[0, 0], [0.25, 23.5], [0.31, 27], [0.45, 30]],
  lane: [[0, 0], [0.25, 0.03], [0.31, 0.16], [0.4, 0.84], [0.44, 0.99], [0.45, 1]],
  drop: [[0, 0], [0.08, 0.02], [0.27, -0.13], [0.36, -0.1], [0.45, 0]],
  touches: [{ foot: 'l', surf: 'inside', t0: 0.25, t1: 0.31, ball: [[0.25, 0.03, 0.08], [0.31, 0.22, 0.02]], hit: 1 }],
  feet: {}, bones: {} };
CHOP_MC.beat = CHOP_MC.beatT / CHOP_MC.T;
// STEP-OVER (mocap): Zaleto "The Stepover" slow-mo (youtube tlsguKGG110, 8.5-12.0 s), capture frames 20..165 @50 fps -> 37 keys.
// Capture drives the upper body, hips and the push/support leg; the CIRCLING leg is authored (m.own) so it goes round the front of
// the ball with guaranteed clearance (the capture's ankle depth was too noisy to trust near the ball). Authored for d=+1:
// LEFT leg circles inside -> outside and plants wide left, RIGHT foot OUTSIDE pushes the ball right at 0.40-0.47 s (spec.md).
const STEPOVER_MC = { id: 'scissor', mc: true, name: 'STEP-OVER!', sub: 'BODY FEINT', T: 0.60, beatT: 0.42, clip: 'Stepover', F: {"L":[[[0.0754,0.1658,-0.0619],[-0.4025,0.365,0.2936],[0.1125,0.124,-0.0564],[-0.4289,0.3518,0.2898],[0.1945,0.0501,-0.157],[-0.4214,0.2753,0.2641]],[[0.1005,0.1733,-0.0451],[-0.3932,0.394,0.2909],[0.1382,0.1325,-0.038],[-0.4189,0.3846,0.2918],[0.2247,0.0574,-0.1333],[-0.4201,0.3065,0.2762]],[[0.1213,0.1682,-0.0296],[-0.3648,0.4119,0.2874],[0.1597,0.1273,-0.0202],[-0.3897,0.4058,0.2899],[0.2453,0.0554,-0.1106],[-0.4125,0.3284,0.2786]],[[0.133,0.1597,-0.0282],[-0.3168,0.4171,0.2849],[0.1725,0.1186,-0.0169],[-0.3419,0.4134,0.2861],[0.2616,0.0609,-0.1009],[-0.3787,0.3358,0.2727]],[[0.136,0.1562,-0.0329],[-0.2672,0.4148,0.2822],[0.1761,0.1157,-0.0207],[-0.2914,0.4117,0.2813],[0.272,0.0758,-0.0989],[-0.3228,0.3345,0.2705]],[[0.1265,0.1561,-0.0324],[-0.2311,0.4062,0.2844],[0.1642,0.1166,-0.0193],[-0.2533,0.4018,0.2834],[0.2546,0.078,-0.0912],[-0.2742,0.3249,0.2819]],[[0.1055,0.1583,-0.0123],[-0.2093,0.3978,0.2832],[0.139,0.1199,0.0055],[-0.2305,0.3923,0.2849],[0.2092,0.0716,-0.0555],[-0.2548,0.3154,0.2851]],[[0.0724,0.1628,0.0119],[-0.2163,0.386,0.244],[0.1039,0.1254,0.0328],[-0.2398,0.3802,0.2428],[0.1704,0.0695,-0.0251],[-0.2696,0.3015,0.2322]],[[0.0426,0.1733,-0.0148],[-0.2232,0.365,0.2012],[0.0751,0.1372,0.0067],[-0.2508,0.3586,0.1958],[0.1534,0.0819,-0.0601],[-0.286,0.2752,0.1738]],[[0.0248,0.1888,-0.0563],[-0.175,0.347,0.2541],[0.0579,0.1544,-0.0337],[-0.2004,0.3384,0.2529],[0.1393,0.1029,-0.1103],[-0.232,0.2539,0.2333]],[[0.0168,0.2,-0.0422],[-0.0904,0.343,0.3346],[0.0488,0.1676,-0.0179],[-0.1081,0.3321,0.3383],[0.1201,0.1128,-0.0856],[-0.1231,0.2544,0.3298]],[[0.0163,0.1983,0.0172],[-0.0277,0.3303,0.3372],[0.0479,0.1673,0.0423],[-0.0405,0.3161,0.3398],[0.1077,0.1015,-0.0079],[-0.0386,0.2451,0.3414]],[[0.0117,0.1908,0.0777],[0.0018,0.3166,0.3232],[0.0429,0.1603,0.1059],[-0.0083,0.3006,0.3238],[0.0987,0.0853,0.0681],[0.0003,0.2321,0.3261]],[[-0.0015,0.1757,0.1143],[0.0376,0.3069,0.3232],[0.028,0.1448,0.1441],[0.0317,0.2892,0.3243],[0.0821,0.0719,0.1101],[0.049,0.2302,0.3263]],[[-0.0203,0.1618,0.1765],[0.0877,0.2985,0.3504],[0.0068,0.1299,0.2089],[0.0877,0.2774,0.352],[0.0527,0.0618,0.174],[0.1108,0.2302,0.3436]],[[-0.038,0.1529,0.2344],[0.1259,0.2852,0.3812],[-0.0131,0.1201,0.2699],[0.1312,0.2602,0.3804],[0.0218,0.0495,0.2334],[0.1598,0.2193,0.35]],[[-0.0483,0.1422,0.2328],[0.1532,0.2623,0.3628],[-0.0244,0.1086,0.2679],[0.1624,0.2347,0.3573],[0.005,0.0386,0.2282],[0.197,0.1999,0.3082]],[[-0.058,0.1288,0.2335],[0.1823,0.2359,0.3141],[-0.0343,0.0947,0.2666],[0.1956,0.2065,0.3049],[-0.0112,0.0287,0.219],[0.2267,0.1749,0.2383]],[[-0.0646,0.1179,0.2393],[0.2,0.2204,0.2667],[-0.0406,0.0837,0.2712],[0.2167,0.1907,0.2569],[-0.0244,0.0185,0.216],[0.2422,0.1546,0.1764]],[[-0.0627,0.1113,0.242],[0.2032,0.214,0.2312],[-0.0374,0.077,0.2737],[0.2215,0.1849,0.2222],[-0.0279,0.0105,0.2139],[0.2437,0.1432,0.1366]],[[-0.0514,0.1076,0.2392],[0.1994,0.2091,0.205],[-0.0247,0.0729,0.271],[0.218,0.18,0.1963],[-0.0277,0.0046,0.2106],[0.2345,0.1352,0.1112]],[[-0.0372,0.1069,0.2417],[0.1871,0.2004,0.1686],[-0.0086,0.0724,0.2736],[0.2058,0.1696,0.1581],[-0.0263,0.0,0.2165],[0.2092,0.1215,0.071]],[[-0.0192,0.1156,0.234],[0.1615,0.1989,0.1059],[0.0111,0.0824,0.2657],[0.1829,0.1661,0.0923],[-0.0132,0.0069,0.2163],[0.1739,0.1169,0.0053]],[[-0.0003,0.1287,0.1874],[0.1382,0.2046,0.0472],[0.0304,0.0961,0.2163],[0.1623,0.1712,0.0316],[0.0044,0.022,0.1699],[0.1471,0.1236,-0.0547]],[[0.0117,0.1535,0.1664],[0.1035,0.2066,-0.0066],[0.0428,0.1221,0.1939],[0.1274,0.1718,-0.0236],[0.017,0.0449,0.1498],[0.1007,0.1224,-0.1183]],[[0.0137,0.1723,0.1865],[0.064,0.2031,-0.0653],[0.0443,0.1417,0.2136],[0.0866,0.166,-0.0842],[0.0153,0.0615,0.1745],[0.0511,0.1151,-0.1926]],[[0.0168,0.1623,0.1884],[0.0337,0.2079,-0.1143],[0.0465,0.13,0.2147],[0.055,0.1702,-0.1347],[0.0148,0.0586,0.1663],[0.0191,0.127,-0.2504]],[[0.0179,0.15,0.1715],[0.0063,0.2137,-0.1342],[0.0468,0.117,0.1994],[0.0262,0.1761,-0.1556],[0.0171,0.0542,0.1426],[-0.0119,0.1465,-0.2762]],[[0.0098,0.1429,0.1586],[-0.0199,0.2088,-0.13],[0.0363,0.1095,0.1893],[0.0023,0.1712,-0.1547],[0.0012,0.0568,0.1305],[-0.0415,0.1577,-0.282]],[[0.0231,0.1374,0.1301],[-0.0371,0.2051,-0.1398],[0.0461,0.1023,0.1616],[-0.0112,0.1679,-0.167],[-0.0025,0.0648,0.1009],[-0.0632,0.165,-0.3002]],[[0.0511,0.1341,0.1128],[-0.0622,0.2196,-0.1691],[0.0707,0.0964,0.1434],[-0.0362,0.1852,-0.1976],[0.0115,0.0672,0.0798],[-0.1037,0.1893,-0.3214]],[[0.0676,0.1398,0.118],[-0.1212,0.2504,-0.1929],[0.0839,0.101,0.1488],[-0.0975,0.2194,-0.2221],[0.0182,0.0728,0.0808],[-0.1786,0.2313,-0.3358]],[[0.0603,0.1454,0.1418],[-0.1997,0.2801,-0.207],[0.074,0.1071,0.1737],[-0.1798,0.2496,-0.2356],[0.0034,0.0808,0.1008],[-0.2635,0.2722,-0.3462]],[[0.0099,0.1354,0.2086],[-0.2623,0.3011,-0.2102],[0.0202,0.0983,0.2429],[-0.2456,0.2684,-0.2388],[-0.0561,0.0747,0.1647],[-0.3193,0.3013,-0.3552]],[[-0.0484,0.1193,0.2723],[-0.3293,0.3112,-0.1994],[-0.04,0.0843,0.3084],[-0.314,0.277,-0.2273],[-0.1185,0.064,0.2313],[-0.3825,0.3092,-0.345]],[[-0.0732,0.1136,0.2895],[-0.3749,0.3257,-0.2015],[-0.0651,0.0805,0.3264],[-0.3604,0.2912,-0.2287],[-0.1424,0.0604,0.2542],[-0.4309,0.3194,-0.3434]],[[-0.0747,0.1162,0.2903],[-0.3689,0.3557,-0.2246],[-0.0659,0.0847,0.3282],[-0.3546,0.3206,-0.2505],[-0.1412,0.0604,0.2595],[-0.4306,0.3433,-0.3606]]],"R":[[[0.4043,0.4383,0.2949],[-0.0758,0.1472,-0.0622],[0.4308,0.4302,0.2911],[-0.113,0.0981,-0.0567],[0.4233,0.3519,0.2653],[-0.1953,0.0082,-0.1577]],[[0.395,0.4657,0.2922],[-0.101,0.1499,-0.0453],[0.4208,0.4612,0.2931],[-0.1388,0.1017,-0.0382],[0.422,0.383,0.2775],[-0.2257,0.0098,-0.1339]],[[0.3664,0.4783,0.2887],[-0.1219,0.1408,-0.0297],[0.3914,0.4769,0.2912],[-0.1604,0.0924,-0.0203],[0.4144,0.4035,0.2799],[-0.2464,0.0039,-0.1111]],[[0.3182,0.4744,0.2862],[-0.1336,0.13,-0.0284],[0.3434,0.4754,0.2874],[-0.1732,0.0812,-0.0169],[0.3804,0.4045,0.2739],[-0.2628,0.0063,-0.1014]],[[0.2684,0.4626,0.2835],[-0.1366,0.126,-0.0331],[0.2927,0.4641,0.2826],[-0.1769,0.0776,-0.0208],[0.3243,0.3925,0.2717],[-0.2732,0.0192,-0.0994]],[[0.2321,0.4471,0.2857],[-0.127,0.1277,-0.0325],[0.2544,0.4469,0.2847],[-0.1649,0.0808,-0.0194],[0.2754,0.3736,0.2832],[-0.2558,0.0248,-0.0916]],[[0.2103,0.4345,0.2845],[-0.106,0.1339,-0.0124],[0.2315,0.433,0.2861],[-0.1396,0.0889,0.0055],[0.256,0.3605,0.2864],[-0.2101,0.027,-0.0558]],[[0.2173,0.424,0.2451],[-0.0727,0.1447,0.0119],[0.2409,0.4226,0.2439],[-0.1044,0.1011,0.0329],[0.2708,0.3493,0.2333],[-0.1712,0.0323,-0.0252]],[[0.2242,0.4042,0.2021],[-0.0428,0.161,-0.0149],[0.2519,0.403,0.1967],[-0.0754,0.1185,0.0067],[0.2872,0.326,0.1746],[-0.154,0.048,-0.0604]],[[0.1758,0.3769,0.2553],[-0.0249,0.1799,-0.0566],[0.2013,0.3732,0.2541],[-0.0581,0.139,-0.0339],[0.233,0.2943,0.2343],[-0.1399,0.0718,-0.1108]],[[0.0908,0.3568,0.3361],[-0.0169,0.1927,-0.0424],[0.1086,0.3492,0.3398],[-0.049,0.1541,-0.018],[0.1236,0.274,0.3313],[-0.1206,0.0854,-0.086]],[[0.0278,0.3321,0.3387],[-0.0163,0.1911,0.0172],[0.0406,0.3202,0.3413],[-0.0481,0.1539,0.0424],[0.0388,0.2486,0.3429],[-0.1082,0.0764,-0.0079]],[[-0.0018,0.3126,0.3247],[-0.0118,0.1845,0.0781],[0.0083,0.2985,0.3252],[-0.0431,0.1479,0.1063],[-0.0003,0.2281,0.3275],[-0.0992,0.0618,0.0684]],[[-0.0377,0.2961,0.3247],[0.0015,0.1718,0.1148],[-0.0319,0.2794,0.3258],[-0.0281,0.1351,0.1447],[-0.0492,0.2169,0.3278],[-0.0825,0.0515,0.1106]],[[-0.0881,0.2781,0.3519],[0.0203,0.1613,0.1773],[-0.0881,0.2569,0.3536],[-0.0068,0.1241,0.2099],[-0.1113,0.2051,0.3451],[-0.0529,0.047,0.1748]],[[-0.1264,0.2575,0.3829],[0.0382,0.1559,0.2355],[-0.1318,0.2313,0.3821],[0.0132,0.1182,0.2711],[-0.1606,0.1848,0.3516],[-0.0219,0.0405,0.2344]],[[-0.1539,0.2293,0.3644],[0.0486,0.1471,0.2339],[-0.1632,0.1998,0.3589],[0.0245,0.1088,0.2691],[-0.1979,0.1582,0.3096],[-0.005,0.0328,0.2292]],[[-0.1831,0.1972,0.3155],[0.0582,0.1355,0.2346],[-0.1965,0.1651,0.3063],[0.0344,0.0966,0.2678],[-0.2277,0.1275,0.2394],[0.0112,0.0259,0.22]],[[-0.2009,0.1783,0.2679],[0.0649,0.1258,0.2404],[-0.2176,0.1452,0.2581],[0.0408,0.0868,0.2724],[-0.2433,0.1041,0.1772],[0.0245,0.0182,0.2169]],[[-0.2041,0.1712,0.2323],[0.0629,0.1187,0.2431],[-0.2225,0.1385,0.2232],[0.0376,0.0795,0.2749],[-0.2448,0.0924,0.1372],[0.028,0.0109,0.2148]],[[-0.2003,0.167,0.2059],[0.0516,0.1128,0.2402],[-0.219,0.1342,0.1972],[0.0248,0.073,0.2722],[-0.2355,0.0861,0.1117],[0.0278,0.0049,0.2116]],[[-0.1879,0.1606,0.1694],[0.0373,0.1095,0.2428],[-0.2067,0.1261,0.1589],[0.0087,0.0694,0.2749],[-0.2101,0.0772,0.0713],[0.0264,0.0,0.2175]],[[-0.1623,0.164,0.1064],[0.0193,0.1147,0.235],[-0.1837,0.127,0.0927],[-0.0111,0.0756,0.2669],[-0.1747,0.0792,0.0053],[0.0132,0.0045,0.2173]],[[-0.1389,0.1741,0.0474],[0.0003,0.1243,0.1882],[-0.163,0.136,0.0318],[-0.0306,0.0857,0.2173],[-0.1477,0.0911,-0.0549],[-0.0044,0.0162,0.1706]],[[-0.1039,0.1827,-0.0066],[-0.0118,0.1469,0.1671],[-0.1279,0.1433,-0.0237],[-0.043,0.1095,0.1948],[-0.1011,0.0987,-0.1189],[-0.0171,0.0369,0.1505]],[[-0.0643,0.1868,-0.0656],[-0.0137,0.1654,0.1873],[-0.087,0.1452,-0.0846],[-0.0445,0.1289,0.2146],[-0.0513,0.1008,-0.1934],[-0.0153,0.0539,0.1753]],[[-0.0339,0.1974,-0.1148],[-0.0169,0.1548,0.1892],[-0.0552,0.1554,-0.1353],[-0.0467,0.1167,0.2157],[-0.0192,0.1189,-0.2516],[-0.0148,0.051,0.167]],[[-0.0063,0.2084,-0.1348],[-0.018,0.1423,0.1722],[-0.0263,0.1669,-0.1563],[-0.047,0.1036,0.2003],[0.0119,0.1444,-0.2775],[-0.0171,0.0461,0.1432]],[[0.02,0.2085,-0.1305],[-0.0098,0.1366,0.1593],[-0.0023,0.1665,-0.1554],[-0.0365,0.0981,0.1901],[0.0417,0.1614,-0.2833],[-0.0012,0.0518,0.1311]],[[0.0372,0.2081,-0.1404],[-0.0232,0.1286,0.1307],[0.0113,0.1658,-0.1678],[-0.0463,0.089,0.1624],[0.0635,0.1728,-0.3016],[0.0026,0.0606,0.1013]],[[0.0624,0.2274,-0.1699],[-0.0514,0.1199,0.1133],[0.0364,0.188,-0.1985],[-0.071,0.0783,0.1441],[0.1042,0.205,-0.3228],[-0.0116,0.0603,0.0801]],[[0.1217,0.2696,-0.1937],[-0.0679,0.1225,0.1185],[0.0979,0.2339,-0.2231],[-0.0843,0.0804,0.1495],[0.1794,0.2614,-0.3373],[-0.0183,0.0646,0.0811]],[[0.2006,0.3145,-0.208],[-0.0605,0.1296,0.1425],[0.1807,0.28,-0.2366],[-0.0743,0.0884,0.1745],[0.2647,0.3187,-0.3478],[-0.0034,0.0755,0.1013]],[[0.2635,0.3475,-0.2112],[-0.01,0.1291,0.2095],[0.2467,0.3114,-0.2399],[-0.0203,0.0899,0.2439],[0.3208,0.3585,-0.3568],[0.0564,0.0807,0.1655]],[[0.3308,0.3704,-0.2003],[0.0486,0.124,0.2735],[0.3154,0.3331,-0.2283],[0.0402,0.0873,0.3098],[0.3843,0.3786,-0.3466],[0.119,0.0819,0.2324]],[[0.3766,0.3937,-0.2024],[0.0735,0.123,0.2908],[0.3621,0.3562,-0.2297],[0.0654,0.0883,0.3279],[0.4328,0.3979,-0.3449],[0.143,0.0828,0.2554]],[[0.3705,0.4227,-0.2257],[0.075,0.1259,0.2916],[0.3562,0.3847,-0.2516],[0.0662,0.0926,0.3296],[0.4325,0.4219,-0.3622],[0.1418,0.0826,0.2607]]]},
  warp: [[0, 0], [0.6, 36]],
  lane: [[0, 0], [0.29, -0.06], [0.4, 0.04], [0.47, 0.2], [0.55, 0.82], [0.6, 1]],
  drop: [[0, 0], [0.11, -0.06], [0.29, -0.16], [0.46, -0.1], [0.6, 0]],
  touches: [{ foot: 'r', surf: 'outside', t0: 0.4, t1: 0.47, ball: [[0.4, 0.04, -0.42], [0.47, 0.24, -0.5]], hit: 1 }],
  own: 'l', feet: { l: { p: [[0, -0.12, A, 0.02], [0.09, 0.08, 0.4, -0.2], [0.155, 0.02, 0.44, -0.72], [0.22, -0.26, 0.34, -0.62], [0.29, -0.37, A, -0.3], [0.48, -0.35, A, -0.3], [0.6, -0.12, A, -0.12]] } }, bones: {} };
STEPOVER_MC.beat = STEPOVER_MC.beatT / STEPOVER_MC.T;
const mcRollSide = (m, d) => { const f = (m.touches[0] && m.touches[0].foot) || 'l'; return d < 0 ? sw(f) : f; };
const mcOwnSide = (m, d) => m.own ? (d < 0 ? sw(m.own) : m.own) : null;
// every move (mocap or keyframed fallback) uses the aimed release + physical gather; the rainbow's flight is solved ballistics
const aimedMove = (m) => true;
const mcOwns = (m, d, side) => m.own === 'both' || side === mcOwnSide(m, d);
// ROULETTE (mocap): Zaleto "The Spin Turn" slow-mo (youtube mVRrqneCapU, 9.3-13.8 s), capture frames 65..290 @50 fps -> 41 keys.
// Capture (yaw removed) drives pelvis drop, trunk lean, wide arms and head; the 360 spin (CCW for d=+1), both sole drags and the
// feet are authored from spec.md (single-camera pose can't resolve a full turn or keep the soles on the ball reliably).
const ROULETTE_F = {"L":[[[-0.3843,0.1091,-0.1256],[0.0059,0.2197,-0.1933],[-0.3818,0.0683,-0.1096],[0.0167,0.1839,-0.2254],[-0.3994,0.0429,-0.1959],[0.0292,0.1748,-0.3586]],[[-0.3405,0.104,-0.1507],[-0.028,0.2165,-0.1369],[-0.3366,0.0619,-0.1335],[-0.0171,0.181,-0.1623],[-0.3667,0.0463,-0.2354],[-0.0128,0.1648,-0.2913]],[[-0.252,0.1157,-0.2085],[-0.0134,0.2527,-0.126],[-0.2441,0.0733,-0.1909],[0.0013,0.2204,-0.1495],[-0.2797,0.0573,-0.2958],[0.0025,0.198,-0.2692]],[[-0.1649,0.1219,-0.2422],[0.0286,0.2961,-0.1502],[-0.1527,0.079,-0.2238],[0.0468,0.2652,-0.1729],[-0.1831,0.0548,-0.3254],[0.0432,0.2341,-0.2791]],[[-0.1396,0.1174,-0.2196],[0.0499,0.3277,-0.1482],[-0.1272,0.0739,-0.1985],[0.0699,0.2971,-0.1649],[-0.1586,0.0419,-0.3034],[0.0627,0.2568,-0.2618]],[[-0.1281,0.1256,-0.2],[0.1012,0.34,-0.1591],[-0.1182,0.0818,-0.1765],[0.1286,0.309,-0.1739],[-0.1548,0.0509,-0.2835],[0.1265,0.2772,-0.29]],[[-0.1653,0.1296,-0.1543],[0.1375,0.3077,-0.1568],[-0.161,0.0858,-0.1277],[0.1681,0.2737,-0.172],[-0.2008,0.0544,-0.2276],[0.1668,0.2423,-0.3029]],[[-0.1559,0.1272,-0.1495],[0.1672,0.2677,-0.1678],[-0.1514,0.0841,-0.1233],[0.201,0.232,-0.1856],[-0.1834,0.0463,-0.2129],[0.2073,0.2043,-0.3198]],[[-0.2077,0.1097,-0.1031],[0.2026,0.2346,-0.1687],[-0.2068,0.0659,-0.0754],[0.2395,0.2015,-0.1873],[-0.2389,0.0225,-0.1607],[0.2525,0.1869,-0.3276]],[[-0.3488,0.0844,-0.0151],[0.2225,0.2001,-0.1581],[-0.3569,0.0386,0.0146],[0.2614,0.1695,-0.1768],[-0.4045,0.0,-0.0735],[0.2866,0.1627,-0.3217]],[[-0.4348,0.1004,0.0194],[0.2126,0.1758,-0.1196],[-0.4498,0.054,0.0491],[0.2501,0.1444,-0.1347],[-0.5053,0.0159,-0.0462],[0.2841,0.13,-0.2788]],[[-0.4978,0.1361,0.0099],[0.2199,0.1712,-0.0907],[-0.518,0.0912,0.039],[0.2569,0.1399,-0.1023],[-0.5767,0.054,-0.0542],[0.2906,0.1235,-0.2425]],[[-0.5259,0.1883,-0.0429],[0.2352,0.1734,-0.0673],[-0.548,0.1459,-0.0143],[0.2723,0.1428,-0.0759],[-0.6084,0.1099,-0.1019],[0.3068,0.1368,-0.2158]],[[-0.5256,0.2426,-0.1289],[0.1706,0.1603,-0.0225],[-0.5497,0.202,-0.1032],[0.2071,0.1306,-0.0268],[-0.6123,0.1734,-0.1904],[0.239,0.1313,-0.1744]],[[-0.5134,0.2718,-0.2102],[0.0597,0.1487,0.0033],[-0.54,0.2313,-0.1885],[0.0927,0.1184,0.0073],[-0.5988,0.2037,-0.2808],[0.1199,0.115,-0.1438]],[[-0.546,0.2602,-0.2152],[0.1065,0.1757,-0.0266],[-0.5742,0.2197,-0.1955],[0.138,0.1462,-0.0218],[-0.6381,0.188,-0.287],[0.1667,0.1378,-0.1548]],[[-0.5933,0.2686,-0.1956],[0.1439,0.2029,-0.0636],[-0.623,0.2293,-0.1739],[0.1748,0.1743,-0.061],[-0.6965,0.1904,-0.2577],[0.201,0.1649,-0.1774]],[[-0.5799,0.2913,-0.1975],[0.1115,0.2176,-0.0779],[-0.6075,0.2534,-0.1732],[0.1404,0.1884,-0.076],[-0.6813,0.2137,-0.2602],[0.1563,0.1801,-0.196]],[[-0.5179,0.3061,-0.2681],[0.0326,0.2149,-0.0748],[-0.5453,0.2685,-0.2449],[0.0603,0.1856,-0.0712],[-0.6052,0.2366,-0.3353],[0.0713,0.1809,-0.2031]],[[-0.4844,0.3196,-0.3414],[-0.0145,0.2108,-0.0909],[-0.5153,0.2827,-0.3206],[0.0114,0.18,-0.085],[-0.5693,0.2579,-0.4014],[0.0177,0.169,-0.2152]],[[-0.4617,0.3215,-0.3773],[-0.0299,0.2065,-0.0993],[-0.494,0.285,-0.3597],[-0.0041,0.1746,-0.0935],[-0.5474,0.2642,-0.4452],[0.0073,0.1609,-0.225]],[[-0.3952,0.333,-0.4114],[-0.0396,0.2024,-0.1082],[-0.4253,0.2964,-0.3972],[-0.0143,0.1707,-0.1045],[-0.4712,0.2824,-0.4988],[0.004,0.1569,-0.2429]],[[-0.3568,0.3333,-0.4234],[-0.0596,0.1913,-0.1216],[-0.388,0.2966,-0.4087],[-0.0363,0.1604,-0.1192],[-0.4323,0.2795,-0.5108],[-0.0148,0.1437,-0.2577]],[[-0.3006,0.3336,-0.4069],[-0.0277,0.1927,-0.1195],[-0.3317,0.2981,-0.3897],[-0.0033,0.1621,-0.1145],[-0.3697,0.2727,-0.4859],[0.0263,0.1403,-0.2476]],[[-0.2193,0.3295,-0.396],[-0.0152,0.1983,-0.1225],[-0.2491,0.2941,-0.3811],[0.0092,0.1674,-0.1136],[-0.2759,0.2661,-0.479],[0.0475,0.1453,-0.2371]],[[-0.1593,0.329,-0.3939],[0.0032,0.2042,-0.1248],[-0.1893,0.2929,-0.3822],[0.0288,0.1741,-0.1122],[-0.209,0.2687,-0.4822],[0.0758,0.156,-0.2293]],[[-0.1223,0.3138,-0.3846],[0.0712,0.2129,-0.0998],[-0.1522,0.2778,-0.3757],[0.0981,0.1844,-0.0843],[-0.1629,0.2642,-0.4786],[0.1559,0.1718,-0.2019]],[[-0.1114,0.2885,-0.3678],[0.1584,0.2137,-0.074],[-0.1395,0.2513,-0.3621],[0.1889,0.1863,-0.0566],[-0.1398,0.2534,-0.4751],[0.2592,0.1849,-0.1787]],[[-0.1439,0.2672,-0.3776],[0.2291,0.2112,-0.063],[-0.1718,0.2287,-0.3752],[0.2623,0.1841,-0.0447],[-0.1695,0.2377,-0.5],[0.3372,0.1858,-0.1654]],[[-0.1851,0.251,-0.383],[0.2436,0.2039,-0.0726],[-0.2141,0.2136,-0.3824],[0.277,0.1765,-0.056],[-0.2148,0.2313,-0.5088],[0.3522,0.1787,-0.1777]],[[-0.2069,0.2485,-0.3743],[0.286,0.2026,-0.0492],[-0.2349,0.2115,-0.3746],[0.3214,0.1757,-0.0321],[-0.2393,0.2426,-0.5032],[0.3957,0.1861,-0.1567]],[[-0.1954,0.2636,-0.3423],[0.3323,0.2135,-0.0263],[-0.2214,0.2275,-0.3394],[0.3694,0.1873,-0.0082],[-0.2242,0.257,-0.4705],[0.4416,0.2048,-0.1375]],[[-0.1668,0.2909,-0.2806],[0.3408,0.2178,-0.0325],[-0.1937,0.2571,-0.2699],[0.3781,0.1925,-0.0147],[-0.191,0.2828,-0.3948],[0.4544,0.2252,-0.1472]],[[-0.1239,0.3171,-0.2019],[0.3503,0.2209,-0.0351],[-0.1504,0.2856,-0.1845],[0.3874,0.1955,-0.0162],[-0.1378,0.2966,-0.3046],[0.4686,0.2281,-0.1507]],[[-0.137,0.3026,-0.2109],[0.2998,0.2217,-0.0652],[-0.1661,0.2722,-0.1955],[0.3323,0.1959,-0.0448],[-0.1568,0.2859,-0.3126],[0.4047,0.2148,-0.1852]],[[-0.1956,0.3076,-0.265],[0.246,0.2213,-0.0984],[-0.2287,0.2792,-0.2538],[0.2717,0.1957,-0.075],[-0.2283,0.2962,-0.3733],[0.3318,0.2019,-0.2122]],[[-0.2211,0.3436,-0.2881],[0.2335,0.2233,-0.1023],[-0.2549,0.3173,-0.28],[0.2566,0.1984,-0.0789],[-0.2511,0.3383,-0.4063],[0.3168,0.1979,-0.2117]],[[-0.2669,0.3444,-0.328],[0.1842,0.2235,-0.1364],[-0.3024,0.319,-0.3269],[0.2034,0.1982,-0.1146],[-0.2944,0.3431,-0.4585],[0.2668,0.1898,-0.248]],[[-0.2869,0.3254,-0.3643],[0.1672,0.2331,-0.1583],[-0.3221,0.2997,-0.3698],[0.1847,0.2078,-0.1377],[-0.3039,0.3323,-0.5058],[0.2523,0.1944,-0.2688]],[[-0.287,0.3062,-0.361],[0.1758,0.2369,-0.1598],[-0.3208,0.2796,-0.369],[0.1932,0.2116,-0.139],[-0.2942,0.322,-0.5081],[0.2647,0.198,-0.2702]],[[-0.3014,0.2865,-0.3532],[0.1875,0.2433,-0.1658],[-0.3353,0.259,-0.3618],[0.2051,0.2183,-0.1451],[-0.3092,0.3033,-0.5016],[0.2763,0.2032,-0.2789]]],"R":[[[-0.0058,0.1476,-0.1893],[0.3762,0.1118,-0.123],[-0.0164,0.1105,-0.2207],[0.3737,0.0714,-0.1073],[-0.0286,0.0993,-0.3511],[0.391,0.0499,-0.1918]],[[0.0274,0.1507,-0.134],[0.3334,0.0987,-0.1476],[0.0167,0.1139,-0.1589],[0.3295,0.0568,-0.1307],[0.0126,0.0974,-0.2852],[0.359,0.047,-0.2304]],[[0.0131,0.1835,-0.1234],[0.2467,0.0937,-0.2041],[-0.0013,0.1491,-0.1464],[0.239,0.0507,-0.1869],[-0.0024,0.127,-0.2636],[0.2738,0.0416,-0.2896]],[[-0.028,0.2182,-0.147],[0.1614,0.0836,-0.2371],[-0.0458,0.1846,-0.1692],[0.1495,0.0393,-0.2191],[-0.0423,0.1548,-0.2732],[0.1792,0.0213,-0.3186]],[[-0.0488,0.2451,-0.1451],[0.1367,0.0745,-0.215],[-0.0684,0.2115,-0.1615],[0.1245,0.0296,-0.1944],[-0.0614,0.1733,-0.2563],[0.1553,0.0041,-0.297]],[[-0.0991,0.2476,-0.1558],[0.1254,0.0804,-0.1958],[-0.1259,0.2122,-0.1703],[0.1158,0.0356,-0.1728],[-0.1239,0.1815,-0.2839],[0.1515,0.0122,-0.2776]],[[-0.1346,0.2093,-0.1535],[0.1618,0.0912,-0.1511],[-0.1645,0.1704,-0.1684],[0.1577,0.0475,-0.125],[-0.1633,0.1398,-0.2966],[0.1966,0.0242,-0.2228]],[[-0.1637,0.1646,-0.1643],[0.1526,0.0871,-0.1463],[-0.1968,0.1234,-0.1818],[0.1482,0.044,-0.1207],[-0.2029,0.0951,-0.3131],[0.1795,0.013,-0.2085]],[[-0.1984,0.1256,-0.1652],[0.2033,0.0796,-0.1009],[-0.2345,0.0863,-0.1834],[0.2024,0.0365,-0.0738],[-0.2472,0.0696,-0.3207],[0.2338,0.0,-0.1573]],[[-0.2178,0.0882,-0.1548],[0.3414,0.0811,-0.0148],[-0.2559,0.051,-0.1731],[0.3494,0.0377,0.0143],[-0.2806,0.0396,-0.3149],[0.396,0.0088,-0.0719]],[[-0.2081,0.0662,-0.1171],[0.4257,0.1127,0.019],[-0.2448,0.0285,-0.1319],[0.4404,0.0701,0.0481],[-0.2781,0.0081,-0.273],[0.4947,0.0431,-0.0452]],[[-0.2153,0.0603,-0.0888],[0.4874,0.1593,0.0097],[-0.2515,0.0229,-0.1001],[0.5072,0.1192,0.0382],[-0.2845,0.0005,-0.2374],[0.5646,0.0936,-0.0531]],[[-0.2302,0.0597,-0.0659],[0.5149,0.2157,-0.042],[-0.2666,0.0228,-0.0743],[0.5365,0.1782,-0.014],[-0.3003,0.0106,-0.2113],[0.5956,0.1543,-0.0998]],[[-0.167,0.0588,-0.0221],[0.5146,0.2688,-0.1262],[-0.2027,0.023,-0.0262],[0.5382,0.2336,-0.1011],[-0.234,0.0177,-0.1707],[0.5995,0.2172,-0.1864]],[[-0.0585,0.068,0.0032],[0.5026,0.2952,-0.2058],[-0.0908,0.0322,0.0071],[0.5287,0.2604,-0.1846],[-0.1174,0.0239,-0.1408],[0.5863,0.2443,-0.2749]],[[-0.1043,0.0859,-0.026],[0.5346,0.2898,-0.2107],[-0.1351,0.0511,-0.0214],[0.5621,0.2554,-0.1914],[-0.1632,0.0375,-0.1515],[0.6247,0.2363,-0.281]],[[-0.1409,0.1055,-0.0623],[0.5808,0.3068,-0.1914],[-0.1712,0.0717,-0.0597],[0.61,0.2739,-0.1703],[-0.1968,0.0577,-0.1737],[0.6819,0.2494,-0.2523]],[[-0.1092,0.1259,-0.0763],[0.5677,0.3266,-0.1933],[-0.1374,0.0919,-0.0744],[0.5947,0.2946,-0.1696],[-0.153,0.0808,-0.1919],[0.667,0.2694,-0.2547]],[[-0.0319,0.1379,-0.0732],[0.5071,0.3295,-0.2625],[-0.0591,0.1041,-0.0697],[0.5338,0.2978,-0.2398],[-0.0698,0.0974,-0.1989],[0.5925,0.2777,-0.3283]],[[0.0142,0.1427,-0.089],[0.4742,0.3365,-0.3342],[-0.0112,0.1077,-0.0833],[0.5044,0.3061,-0.3139],[-0.0173,0.0957,-0.2107],[0.5573,0.2919,-0.393]],[[0.0293,0.1413,-0.0972],[0.452,0.3341,-0.3694],[0.004,0.1053,-0.0915],[0.4836,0.3044,-0.3521],[-0.0071,0.0898,-0.2203],[0.536,0.294,-0.4359]],[[0.0387,0.1391,-0.1059],[0.3869,0.3331,-0.4027],[0.014,0.1034,-0.1023],[0.4163,0.3029,-0.3889],[-0.0039,0.0865,-0.2378],[0.4614,0.2977,-0.4884]],[[0.0583,0.132,-0.1191],[0.3494,0.3262,-0.4145],[0.0356,0.0974,-0.1167],[0.3798,0.2961,-0.4001],[0.0145,0.0771,-0.2523],[0.4233,0.2876,-0.5001]],[[0.0271,0.1274,-0.117],[0.2943,0.316,-0.3984],[0.0033,0.0929,-0.1121],[0.3248,0.2871,-0.3815],[-0.0257,0.0661,-0.2424],[0.3619,0.2692,-0.4757]],[[0.0149,0.1306,-0.1199],[0.2147,0.297,-0.3877],[-0.009,0.0958,-0.1112],[0.2439,0.2679,-0.3731],[-0.0465,0.067,-0.2321],[0.2701,0.2454,-0.469]],[[-0.0032,0.1329,-0.1222],[0.156,0.2853,-0.3856],[-0.0282,0.0987,-0.1099],[0.1854,0.2555,-0.3742],[-0.0742,0.0722,-0.2245],[0.2046,0.2355,-0.4721]],[[-0.0697,0.1288,-0.0977],[0.1197,0.2636,-0.3766],[-0.096,0.0959,-0.0825],[0.149,0.2339,-0.3678],[-0.1526,0.0728,-0.1977],[0.1595,0.2226,-0.4685]],[[-0.1551,0.1133,-0.0724],[0.109,0.2368,-0.3601],[-0.185,0.0809,-0.0554],[0.1365,0.2056,-0.3545],[-0.2537,0.0664,-0.175],[0.1369,0.2077,-0.4651]],[[-0.2243,0.0978,-0.0617],[0.1409,0.222,-0.3697],[-0.2568,0.0651,-0.0438],[0.1681,0.1895,-0.3673],[-0.3301,0.0529,-0.1619],[0.1659,0.1979,-0.4895]],[[-0.2385,0.0879,-0.0711],[0.1812,0.2137,-0.375],[-0.2712,0.0549,-0.0549],[0.2096,0.1825,-0.3744],[-0.3448,0.0431,-0.174],[0.2103,0.2,-0.4981]],[[-0.28,0.0788,-0.0481],[0.2025,0.2154,-0.3665],[-0.3147,0.0459,-0.0314],[0.23,0.1844,-0.3668],[-0.3874,0.0422,-0.1534],[0.2343,0.2156,-0.4927]],[[-0.3254,0.0809,-0.0258],[0.1913,0.228,-0.3351],[-0.3616,0.0483,-0.0081],[0.2167,0.1975,-0.3323],[-0.4323,0.052,-0.1347],[0.2195,0.2269,-0.4607]],[[-0.3336,0.0835,-0.0318],[0.1633,0.2494,-0.2747],[-0.3702,0.0518,-0.0144],[0.1896,0.2213,-0.2642],[-0.4449,0.0696,-0.1441],[0.187,0.246,-0.3865]],[[-0.343,0.0847,-0.0344],[0.1213,0.267,-0.1977],[-0.3793,0.053,-0.0159],[0.1473,0.2412,-0.1806],[-0.4587,0.0698,-0.1475],[0.1349,0.2496,-0.2982]],[[-0.2935,0.0949,-0.0639],[0.1341,0.2553,-0.2065],[-0.3253,0.0636,-0.0438],[0.1626,0.2309,-0.1914],[-0.3962,0.0687,-0.1813],[0.1535,0.2426,-0.3061]],[[-0.2409,0.1046,-0.0963],[0.1915,0.2711,-0.2594],[-0.266,0.0748,-0.0734],[0.2239,0.2495,-0.2485],[-0.3248,0.0696,-0.2077],[0.2235,0.266,-0.3655]],[[-0.2286,0.1088,-0.1002],[0.2165,0.3111,-0.2821],[-0.2512,0.0802,-0.0772],[0.2496,0.2916,-0.2742],[-0.3101,0.0684,-0.2072],[0.2459,0.3114,-0.3978]],[[-0.1803,0.1182,-0.1335],[0.2613,0.3203,-0.3211],[-0.1991,0.0898,-0.1122],[0.2961,0.3021,-0.3201],[-0.2612,0.0698,-0.2428],[0.2883,0.3242,-0.4489]],[[-0.1637,0.1307,-0.155],[0.2809,0.3055,-0.3567],[-0.1808,0.1027,-0.1348],[0.3154,0.2868,-0.3621],[-0.247,0.077,-0.2631],[0.2976,0.3154,-0.4952]],[[-0.1721,0.1329,-0.1565],[0.281,0.2867,-0.3534],[-0.1891,0.1048,-0.1361],[0.314,0.2669,-0.3612],[-0.2591,0.0782,-0.2645],[0.288,0.3035,-0.4974]],[[-0.1836,0.137,-0.1623],[0.2951,0.2701,-0.3458],[-0.2008,0.1093,-0.1421],[0.3283,0.2495,-0.3542],[-0.2705,0.0812,-0.273],[0.3027,0.288,-0.4911]]]};
// ELASTICO (mocap): "Slow-mo elastico" (youtube RfoXFC_xXHw, 19.4-22.1 s, ~15 fps slow-mo, facing the camera), frames 110..150 -> 26 keys.
// Capture drives the upper body and the support leg; the working foot (outside push -> glued wrap -> inside snap, same foot) and
// both touches are authored from spec.md. Lane: contact starts in the old lane, the snap throws the ball into the new lane.
const ELASTICO_F = {"L":[[[-0.2271,0.2284,-0.2035],[-0.0558,0.3616,-0.2804],[-0.2168,0.1895,-0.1759],[-0.0601,0.3409,-0.3059],[-0.2579,0.1811,-0.2461],[0.0008,0.3625,-0.3544]],[[-0.2525,0.2159,-0.1743],[-0.0164,0.3382,-0.2542],[-0.245,0.1755,-0.1454],[-0.0189,0.315,-0.2773],[-0.292,0.1665,-0.2156],[0.0561,0.3393,-0.3311]],[[-0.2644,0.2098,-0.1442],[0.0355,0.3376,-0.2434],[-0.2587,0.1682,-0.1139],[0.0354,0.3132,-0.2656],[-0.3063,0.157,-0.1823],[0.1267,0.3382,-0.3261]],[[-0.2636,0.2185,-0.1211],[0.1044,0.3627,-0.2584],[-0.2587,0.1766,-0.0902],[0.1091,0.3384,-0.2842],[-0.3056,0.1637,-0.1537],[0.2191,0.3632,-0.341]],[[-0.2678,0.2254,-0.0991],[0.1702,0.3868,-0.2879],[-0.263,0.1839,-0.0676],[0.1804,0.3626,-0.3189],[-0.3104,0.1687,-0.1253],[0.3045,0.3889,-0.3722]],[[-0.28,0.2152,-0.0783],[0.2379,0.3978,-0.3127],[-0.2748,0.173,-0.0468],[0.2547,0.3742,-0.3467],[-0.323,0.1552,-0.1027],[0.38,0.405,-0.4067]],[[-0.3126,0.1612,-0.0365],[0.318,0.4081,-0.3245],[-0.3078,0.1163,-0.0064],[0.3421,0.3858,-0.3573],[-0.3542,0.0982,-0.065],[0.4509,0.422,-0.4332]],[[-0.3587,0.0913,0.0255],[0.391,0.4282,-0.3271],[-0.355,0.0444,0.0543],[0.4209,0.4085,-0.3563],[-0.3971,0.0288,-0.0055],[0.5094,0.4458,-0.4492]],[[-0.3836,0.0602,0.0612],[0.4398,0.4367,-0.3069],[-0.3809,0.0132,0.0896],[0.4733,0.4183,-0.3312],[-0.4167,0.0,0.0291],[0.5481,0.4519,-0.4371]],[[-0.3908,0.0592,0.07],[0.4878,0.4217,-0.2865],[-0.3889,0.0121,0.098],[0.5264,0.4033,-0.3091],[-0.4195,0.0014,0.035],[0.5949,0.436,-0.4269]],[[-0.4046,0.0641,0.087],[0.5204,0.3816,-0.2591],[-0.404,0.0162,0.1143],[0.5637,0.3633,-0.2832],[-0.4364,0.0086,0.0478],[0.6294,0.3949,-0.4099]],[[-0.4091,0.0824,0.1129],[0.4499,0.3046,-0.1637],[-0.4103,0.0348,0.1383],[0.4888,0.285,-0.1869],[-0.4476,0.0269,0.0708],[0.5526,0.3056,-0.3115]],[[-0.3615,0.1082,0.1236],[0.275,0.2416,-0.0372],[-0.3624,0.0622,0.1453],[0.3046,0.2214,-0.0573],[-0.3926,0.0516,0.0834],[0.3526,0.2405,-0.1626]],[[-0.2907,0.1287,0.1194],[0.0616,0.2163,0.0505],[-0.2902,0.0842,0.1378],[0.0854,0.1968,0.0354],[-0.3007,0.0713,0.0902],[0.095,0.2294,-0.0491]],[[-0.3331,0.1283,0.1626],[0.0052,0.1901,0.0845],[-0.3342,0.0848,0.1808],[0.0286,0.1685,0.0714],[-0.3358,0.0745,0.141],[0.029,0.2051,-0.0118]],[[-0.3783,0.118,0.204],[0.0475,0.1494,0.0942],[-0.3786,0.0742,0.2235],[0.0699,0.125,0.0794],[-0.3805,0.0706,0.1797],[0.0957,0.1481,-0.0037]],[[-0.3648,0.1132,0.1893],[0.0902,0.1309,0.0442],[-0.3625,0.0692,0.2099],[0.1123,0.1063,0.0271],[-0.3673,0.0686,0.1641],[0.1511,0.1169,-0.06]],[[-0.3703,0.1207,0.1761],[0.1533,0.1388,-0.0292],[-0.3685,0.078,0.1994],[0.1775,0.1141,-0.0487],[-0.3766,0.0681,0.1576],[0.2169,0.1171,-0.1461]],[[-0.3808,0.141,0.1527],[0.2038,0.1604,-0.081],[-0.3815,0.1002,0.1789],[0.2295,0.1358,-0.102],[-0.3923,0.0798,0.1375],[0.2652,0.1368,-0.2113]],[[-0.3921,0.1579,0.1227],[0.2169,0.1695,-0.0828],[-0.3964,0.1184,0.1486],[0.2435,0.146,-0.1029],[-0.4134,0.1044,0.1011],[0.2789,0.1532,-0.2162]],[[-0.3868,0.1601,0.0965],[0.1737,0.1545,-0.0129],[-0.3948,0.12,0.1199],[0.2018,0.1327,-0.0276],[-0.4138,0.1214,0.07],[0.2423,0.1484,-0.1259]],[[-0.3673,0.1498,0.0924],[0.0917,0.1419,0.0758],[-0.3799,0.1088,0.1124],[0.1213,0.1221,0.0683],[-0.3914,0.1192,0.0725],[0.1752,0.1491,-0.0053]],[[-0.3622,0.1353,0.1564],[0.139,0.1586,0.0593],[-0.3732,0.0933,0.1776],[0.1708,0.1388,0.0489],[-0.3836,0.0996,0.1426],[0.2337,0.1752,-0.0333]],[[-0.3548,0.1292,0.2264],[0.2503,0.1873,-0.0337],[-0.356,0.0854,0.255],[0.2829,0.1636,-0.0483],[-0.3694,0.0702,0.215],[0.3359,0.1913,-0.1529]],[[-0.3427,0.1462,0.2856],[0.2428,0.1724,0.0017],[-0.3368,0.1036,0.323],[0.273,0.145,-0.0095],[-0.3491,0.0606,0.2828],[0.3103,0.1534,-0.1161]],[[-0.3304,0.1722,0.328],[0.1774,0.1372,0.1018],[-0.3227,0.1329,0.3705],[0.2048,0.1089,0.0939],[-0.3299,0.0732,0.3336],[0.2305,0.1041,-0.0086]]],"R":[[[0.0599,0.3349,-0.3011],[0.2439,0.2268,-0.2186],[0.0646,0.3135,-0.3285],[0.2328,0.1829,-0.1889],[-0.0009,0.3243,-0.3805],[0.277,0.1823,-0.2643]],[[0.0176,0.3017,-0.273],[0.2712,0.2185,-0.1872],[0.0203,0.2773,-0.2978],[0.2631,0.1737,-0.1561],[-0.0603,0.2881,-0.3556],[0.3135,0.1736,-0.2315]],[[-0.0381,0.2905,-0.2613],[0.2839,0.2144,-0.1548],[-0.038,0.2643,-0.2852],[0.2778,0.1686,-0.1224],[-0.1361,0.2725,-0.3501],[0.3289,0.1662,-0.1957]],[[-0.1121,0.3034,-0.2775],[0.2831,0.2236,-0.1301],[-0.1172,0.2763,-0.3051],[0.2778,0.1776,-0.0969],[-0.2353,0.2806,-0.3661],[0.3282,0.1733,-0.1651]],[[-0.1827,0.3159,-0.3091],[0.2876,0.2319,-0.1065],[-0.1937,0.2878,-0.3425],[0.2824,0.1863,-0.0726],[-0.327,0.2907,-0.3996],[0.3334,0.1797,-0.1346]],[[-0.2554,0.3139,-0.3358],[0.3007,0.2234,-0.0841],[-0.2735,0.2851,-0.3723],[0.2951,0.177,-0.0502],[-0.4081,0.2927,-0.4368],[0.3469,0.1678,-0.1103]],[[-0.3415,0.3086,-0.3485],[0.3357,0.1721,-0.0392],[-0.3674,0.2798,-0.3836],[0.3305,0.1229,-0.0069],[-0.4842,0.2965,-0.4652],[0.3804,0.1128,-0.0698]],[[-0.4199,0.3154,-0.3513],[0.3852,0.1064,0.0274],[-0.452,0.2881,-0.3827],[0.3812,0.0553,0.0583],[-0.547,0.3101,-0.4823],[0.4265,0.0471,-0.0059]],[[-0.4723,0.3145,-0.3295],[0.4119,0.078,0.0657],[-0.5083,0.288,-0.3556],[0.4091,0.0271,0.0962],[-0.5885,0.3087,-0.4694],[0.4474,0.0201,0.0312]],[[-0.5238,0.2886,-0.3077],[0.4196,0.0784,0.0752],[-0.5653,0.261,-0.3319],[0.4176,0.0275,0.1053],[-0.6388,0.2822,-0.4584],[0.4505,0.0222,0.0376]],[[-0.5589,0.2389,-0.2782],[0.4344,0.0865,0.0935],[-0.6053,0.2104,-0.3041],[0.4338,0.0349,0.1227],[-0.6759,0.2309,-0.4402],[0.4686,0.0334,0.0514]],[[-0.4832,0.1706,-0.1758],[0.4393,0.1072,0.1213],[-0.5249,0.1416,-0.2007],[0.4405,0.0563,0.1485],[-0.5934,0.1507,-0.3345],[0.4807,0.0554,0.076]],[[-0.2953,0.1386,-0.04],[0.3882,0.1251,0.1327],[-0.327,0.1108,-0.0615],[0.3891,0.0759,0.156],[-0.3786,0.1216,-0.1746],[0.4215,0.0707,0.0896]],[[-0.0661,0.1549,0.0542],[0.3121,0.1327,0.1283],[-0.0917,0.1291,0.0381],[0.3116,0.0848,0.1479],[-0.1021,0.1622,-0.0527],[0.3229,0.0731,0.0968]],[[-0.0056,0.1383,0.0908],[0.3577,0.1409,0.1746],[-0.0307,0.1103,0.0767],[0.3589,0.0944,0.1942],[-0.0311,0.1496,-0.0127],[0.3606,0.0837,0.1514]],[[-0.051,0.086,0.1011],[0.4062,0.1391,0.219],[-0.0751,0.0552,0.0853],[0.4065,0.092,0.24],[-0.1027,0.0747,-0.004],[0.4086,0.0886,0.193]],[[-0.0968,0.0574,0.0475],[0.3917,0.1311,0.2033],[-0.1206,0.0265,0.0291],[0.3893,0.0834,0.2254],[-0.1623,0.0299,-0.0644],[0.3944,0.0837,0.1762]],[[-0.1646,0.053,-0.0313],[0.3977,0.1403,0.1891],[-0.1906,0.0215,-0.0523],[0.3957,0.0941,0.2141],[-0.2329,0.0167,-0.1569],[0.4044,0.0851,0.1692]],[[-0.2188,0.066,-0.0869],[0.4089,0.1642,0.164],[-0.2464,0.0343,-0.1095],[0.4097,0.1205,0.1921],[-0.2848,0.0281,-0.2269],[0.4213,0.1008,0.1477]],[[-0.233,0.073,-0.0889],[0.421,0.1847,0.1317],[-0.2615,0.0423,-0.1105],[0.4256,0.1432,0.1596],[-0.2995,0.0428,-0.2322],[0.4439,0.1316,0.1085]],[[-0.1866,0.0657,-0.0138],[0.4153,0.1859,0.1036],[-0.2167,0.0366,-0.0297],[0.4239,0.1446,0.1288],[-0.2602,0.0452,-0.1352],[0.4443,0.1499,0.0752]],[[-0.0985,0.0689,0.0814],[0.3944,0.1709,0.0992],[-0.1302,0.0416,0.0734],[0.408,0.1295,0.1207],[-0.1881,0.0596,-0.0057],[0.4203,0.143,0.0778]],[[-0.1492,0.0772,0.0637],[0.389,0.1544,0.168],[-0.1834,0.0495,0.0525],[0.4008,0.1115,0.1907],[-0.2509,0.0757,-0.0358],[0.4119,0.1204,0.1531]],[[-0.2688,0.0853,-0.0362],[0.381,0.1463,0.2432],[-0.3038,0.0532,-0.0519],[0.3823,0.0995,0.2738],[-0.3608,0.0722,-0.1642],[0.3967,0.0859,0.2309]],[[-0.2607,0.0708,0.0018],[0.368,0.1621,0.3067],[-0.2931,0.0352,-0.0102],[0.3617,0.1152,0.3468],[-0.3332,0.0366,-0.1247],[0.3749,0.0714,0.3036]],[[-0.1905,0.0464,0.1093],[0.3548,0.1875,0.3522],[-0.2199,0.0104,0.1009],[0.3466,0.1437,0.3978],[-0.2475,0.0,-0.0093],[0.3542,0.081,0.3583]]]};
// LA CROQUETA (mocap): Zaleto "la Croqueta" slow-mo (youtube aKJHo6vYmqI, 5.6-8.0 s, 50 fps, facing the camera), frames 130..250 -> 23 keys.
// Capture drives pelvis, trunk, arms and head (the side shuffle); both inside touches and the feet are authored from spec.md.
const CROQUETA_F = {"L":[[[-0.1993,0.1247,0.0401],[-0.0674,0.1371,0.1423],[-0.1856,0.0841,0.0596],[-0.0647,0.1065,0.1284],[-0.1552,0.0412,-0.004],[-0.0208,0.0769,0.0818]],[[-0.1776,0.1243,0.0276],[-0.073,0.1496,0.1638],[-0.1631,0.0836,0.0484],[-0.0729,0.1217,0.1556],[-0.13,0.0443,-0.0132],[-0.0429,0.0854,0.1181]],[[-0.1585,0.1205,0.0232],[-0.0683,0.1722,0.1756],[-0.1434,0.0799,0.0452],[-0.0715,0.1471,0.17],[-0.1087,0.0387,-0.0147],[-0.0515,0.0993,0.1377]],[[-0.1322,0.1126,-0.0096],[-0.0528,0.1815,0.1802],[-0.1155,0.0726,0.0099],[-0.0583,0.1566,0.1739],[-0.0783,0.033,-0.0545],[-0.0322,0.1075,0.1439]],[[-0.1015,0.1095,-0.0592],[-0.0149,0.1846,0.2119],[-0.0826,0.0699,-0.0427],[-0.019,0.1592,0.2051],[-0.0444,0.0332,-0.1136],[0.0187,0.1052,0.1801]],[[-0.0854,0.1047,-0.0597],[0.0551,0.2002,0.225],[-0.066,0.0648,-0.0418],[0.0543,0.1748,0.2181],[-0.0307,0.0257,-0.11],[0.0946,0.1162,0.1944]],[[-0.073,0.0981,-0.0534],[0.1286,0.2034,0.151],[-0.0525,0.0596,-0.0365],[0.1335,0.1765,0.1357],[-0.0219,0.0254,-0.1053],[0.1935,0.1398,0.102]],[[-0.0797,0.0945,-0.014],[0.1949,0.2041,0.087],[-0.0592,0.0576,0.0039],[0.2043,0.1753,0.0661],[-0.0262,0.0335,-0.0652],[0.2674,0.1685,0.0158]],[[-0.0897,0.0977,0.0461],[0.234,0.2114,0.0894],[-0.0702,0.0617,0.0666],[0.2475,0.1849,0.0643],[-0.044,0.0425,0.0002],[0.3139,0.1991,-0.0032]],[[-0.0999,0.1016,0.1157],[0.2626,0.2218,0.1385],[-0.0824,0.0652,0.1399],[0.2794,0.198,0.1154],[-0.0636,0.0389,0.0739],[0.3319,0.2117,0.0358]],[[-0.1059,0.103,0.1418],[0.3002,0.2419,0.1046],[-0.0898,0.0663,0.1678],[0.3202,0.2197,0.0814],[-0.0732,0.0364,0.104],[0.3591,0.2353,0.0012]],[[-0.1134,0.1056,0.1595],[0.3027,0.243,0.0913],[-0.099,0.0689,0.1875],[0.3222,0.2208,0.0694],[-0.0818,0.0339,0.1306],[0.3603,0.2335,-0.0075]],[[-0.1261,0.1063,0.1766],[0.2991,0.2556,0.0375],[-0.1134,0.0697,0.2065],[0.3187,0.234,0.0156],[-0.0932,0.0262,0.1544],[0.3471,0.2468,-0.0719]],[[-0.1351,0.1009,0.1787],[0.2814,0.2439,0.0148],[-0.123,0.0637,0.2113],[0.3003,0.221,-0.0076],[-0.1026,0.01,0.1635],[0.3277,0.2271,-0.0988]],[[-0.1362,0.09,0.1565],[0.2564,0.2101,0.0066],[-0.1236,0.0519,0.1888],[0.2734,0.1851,-0.0162],[-0.0978,0.0024,0.1389],[0.3075,0.1911,-0.1113]],[[-0.1399,0.0847,0.1481],[0.2292,0.2034,-0.0114],[-0.1271,0.0454,0.1802],[0.2455,0.1779,-0.0331],[-0.0992,0.0,0.1316],[0.2828,0.1867,-0.1266]],[[-0.1428,0.0931,0.1483],[0.187,0.1999,0.0292],[-0.1296,0.053,0.1818],[0.2002,0.1739,0.0105],[-0.1045,0.0036,0.1311],[0.2243,0.173,-0.0811]],[[-0.1567,0.0993,0.1512],[0.1484,0.1901,0.0107],[-0.1435,0.0585,0.185],[0.1595,0.1633,-0.0111],[-0.128,0.0056,0.1354],[0.1874,0.1569,-0.1069]],[[-0.1963,0.1089,0.1806],[0.0885,0.1619,0.0065],[-0.1857,0.0681,0.2166],[0.0968,0.1341,-0.0181],[-0.186,0.0083,0.1775],[0.137,0.1262,-0.1046]],[[-0.2302,0.1184,0.2012],[0.0403,0.1508,-0.0263],[-0.2216,0.0773,0.237],[0.047,0.1229,-0.0556],[-0.2413,0.0157,0.203],[0.1023,0.1184,-0.1351]],[[-0.2653,0.1281,0.1467],[0.0029,0.1495,-0.0608],[-0.2571,0.0866,0.1737],[0.0082,0.1212,-0.0926],[-0.2768,0.0342,0.1295],[0.0657,0.1198,-0.171]],[[-0.3032,0.1448,0.0528],[-0.0617,0.1411,-0.0341],[-0.2944,0.1048,0.069],[-0.0587,0.1113,-0.0637],[-0.3039,0.0716,0.005],[-0.0055,0.1065,-0.1384]],[[-0.3344,0.1663,-0.0322],[-0.1365,0.1361,0.013],[-0.3262,0.127,-0.0262],[-0.1353,0.1047,-0.0127],[-0.336,0.114,-0.1015],[-0.0683,0.0911,-0.0718]]],"R":[[[0.0734,0.1427,0.1549],[0.217,0.1564,0.0437],[0.0705,0.1089,0.1398],[0.202,0.1094,0.0649],[0.0227,0.0675,0.0891],[0.169,0.0565,-0.0044]],[[0.0794,0.1575,0.1783],[0.1934,0.1515,0.03],[0.0794,0.1271,0.1694],[0.1775,0.1043,0.0527],[0.0467,0.0814,0.1286],[0.1416,0.0546,-0.0144]],[[0.0744,0.1811,0.1912],[0.1726,0.1435,0.0253],[0.0779,0.1545,0.1851],[0.1562,0.0961,0.0492],[0.0561,0.0982,0.1499],[0.1184,0.0441,-0.016]],[[0.0575,0.188,0.1962],[0.144,0.1295,-0.0105],[0.0634,0.162,0.1893],[0.1257,0.0824,0.0108],[0.0351,0.1032,0.1567],[0.0853,0.0316,-0.0594]],[[0.0163,0.1836,0.2308],[0.1105,0.1197,-0.0644],[0.0207,0.1568,0.2233],[0.0899,0.0727,-0.0465],[-0.0203,0.0901,0.1961],[0.0483,0.0248,-0.1237]],[[-0.06,0.1861,0.2449],[0.093,0.1111,-0.065],[-0.0591,0.1586,0.2374],[0.0719,0.0637,-0.0455],[-0.103,0.0864,0.2117],[0.0334,0.0138,-0.1198]],[[-0.1401,0.1743,0.1644],[0.0795,0.1014,-0.0582],[-0.1453,0.1441,0.1478],[0.0571,0.0553,-0.0397],[-0.2107,0.0917,0.1111],[0.0238,0.0116,-0.1147]],[[-0.2122,0.1614,0.0948],[0.0867,0.0989,-0.0153],[-0.2225,0.1281,0.072],[0.0644,0.0544,0.0042],[-0.2911,0.1077,0.0172],[0.0285,0.0214,-0.071]],[[-0.2548,0.1613,0.0973],[0.0977,0.1044,0.0502],[-0.2695,0.1297,0.07],[0.0764,0.0612,0.0725],[-0.3418,0.1314,-0.0035],[0.0479,0.0349,0.0002]],[[-0.2859,0.1667,0.1508],[0.1088,0.1108,0.126],[-0.3042,0.1373,0.1256],[0.0897,0.0675,0.1523],[-0.3614,0.1413,0.039],[0.0692,0.035,0.0804]],[[-0.3269,0.1808,0.1139],[0.1153,0.1135,0.1544],[-0.3486,0.1525,0.0886],[0.0978,0.0703,0.1827],[-0.391,0.1615,0.0014],[0.0797,0.0343,0.1133]],[[-0.3295,0.1816,0.0994],[0.1234,0.1179,0.1736],[-0.3508,0.1533,0.0756],[0.1078,0.075,0.2042],[-0.3923,0.1592,-0.0081],[0.0891,0.0334,0.1421]],[[-0.3257,0.1959,0.0409],[0.1373,0.1213,0.1922],[-0.347,0.1684,0.017],[0.1235,0.0788,0.2248],[-0.3779,0.1764,-0.0783],[0.1015,0.0273,0.1682]],[[-0.3064,0.1868,0.0161],[0.1471,0.1173,0.1946],[-0.327,0.158,-0.0083],[0.134,0.0743,0.23],[-0.3568,0.159,-0.1076],[0.1117,0.0116,0.178]],[[-0.2792,0.1553,0.0072],[0.1483,0.1056,0.1704],[-0.2977,0.1246,-0.0176],[0.1346,0.0616,0.2056],[-0.3349,0.124,-0.1212],[0.1065,0.0023,0.1513]],[[-0.2496,0.1536,-0.0124],[0.1523,0.1006,0.1613],[-0.2673,0.1224,-0.036],[0.1384,0.0553,0.1962],[-0.3079,0.1243,-0.1378],[0.1081,0.0,0.1433]],[[-0.2036,0.1585,0.0318],[0.1555,0.1104,0.1614],[-0.2179,0.1274,0.0115],[0.1411,0.064,0.198],[-0.2443,0.1215,-0.0883],[0.1138,0.005,0.1427]],[[-0.1616,0.1558,0.0116],[0.1706,0.12,0.1646],[-0.1737,0.1243,-0.0121],[0.1562,0.0729,0.2015],[-0.204,0.1116,-0.1164],[0.1394,0.0121,0.1474]],[[-0.0963,0.1375,0.007],[0.2137,0.1387,0.1967],[-0.1054,0.1055,-0.0198],[0.2022,0.092,0.2358],[-0.1492,0.0885,-0.1139],[0.2025,0.027,0.1933]],[[-0.0439,0.1353,-0.0287],[0.2506,0.156,0.2191],[-0.0512,0.1036,-0.0605],[0.2413,0.1094,0.2581],[-0.1114,0.0872,-0.1471],[0.2627,0.0464,0.221]],[[-0.0032,0.1417,-0.0662],[0.2889,0.1738,0.1597],[-0.0089,0.1098,-0.1009],[0.2799,0.1269,0.1892],[-0.0715,0.0963,-0.1862],[0.3014,0.0739,0.141]],[[0.0671,0.1459,-0.0371],[0.3301,0.1998,0.0575],[0.0639,0.1128,-0.0693],[0.3206,0.1544,0.0751],[0.006,0.0966,-0.1507],[0.3309,0.1202,0.0054]],[[0.1486,0.1559,0.0141],[0.3641,0.2297,-0.0351],[0.1473,0.1214,-0.0139],[0.3552,0.1852,-0.0285],[0.0744,0.0928,-0.0782],[0.3658,0.1731,-0.1105]]]};
// HEEL TO HEEL (mocap): "Heel to Heel (Tutorial)" (youtube i1aNB9A5Als, 49.8-51.6 s, 30 fps, side view), frames 234..288 -> 21 keys.
// Capture drives pelvis, trunk, arms and head; the two heel touches (front foot back-heels it behind the standing leg, the other
// heel pokes it diagonally into the new lane) and the feet are authored from spec.md.
const HEEL_F = {"L":[[[-0.2603,0.1393,-0.0262],[-0.114,0.2211,-0.3041],[-0.2849,0.0976,0.0191],[-0.0874,0.1847,-0.3065],[-0.2918,0.075,-0.0458],[-0.0477,0.196,-0.4332]],[[-0.2046,0.1323,-0.1089],[-0.0887,0.2419,-0.2953],[-0.2258,0.0906,-0.0713],[-0.0592,0.2049,-0.2982],[-0.2284,0.0903,-0.1691],[-0.0291,0.2256,-0.43]],[[-0.1541,0.1175,-0.1728],[-0.0384,0.2736,-0.3218],[-0.1698,0.0747,-0.1454],[-0.005,0.2352,-0.3275],[-0.1613,0.0911,-0.255],[0.0118,0.2623,-0.4589]],[[-0.0759,0.1043,-0.1976],[0.1127,0.2819,-0.3374],[-0.0871,0.0617,-0.173],[0.1543,0.2422,-0.3454],[-0.073,0.0786,-0.2987],[0.1854,0.2773,-0.488]],[[-0.0838,0.0818,-0.1486],[0.1848,0.2928,-0.3898],[-0.097,0.042,-0.1179],[0.2271,0.2548,-0.4043],[-0.0867,0.0455,-0.2575],[0.2715,0.2955,-0.5618]],[[-0.1353,0.0477,-0.0353],[0.1808,0.3156,-0.4866],[-0.1497,0.017,0.0053],[0.2243,0.2819,-0.5106],[-0.139,0.0024,-0.1258],[0.2779,0.3321,-0.664]],[[-0.175,0.0509,0.0505],[0.1954,0.3282,-0.5621],[-0.1899,0.0239,0.0926],[0.2403,0.2991,-0.5911],[-0.1836,0.0,-0.0308],[0.2898,0.3632,-0.7388]],[[-0.2224,0.055,0.1025],[0.1239,0.3305,-0.6014],[-0.2401,0.026,0.1423],[0.1645,0.3047,-0.6311],[-0.2402,0.0077,0.0263],[0.2042,0.3828,-0.7753]],[[-0.2575,0.0547,0.1606],[-0.0185,0.329,-0.618],[-0.2788,0.0273,0.2002],[0.0162,0.3031,-0.6469],[-0.2828,0.016,0.0949],[0.0409,0.3912,-0.7876]],[[-0.3075,0.0614,0.2171],[-0.0784,0.318,-0.6179],[-0.3325,0.0355,0.2573],[-0.0469,0.2898,-0.6442],[-0.3448,0.0216,0.1568],[-0.0271,0.3764,-0.7882]],[[-0.3314,0.083,0.2732],[-0.133,0.286,-0.567],[-0.3583,0.0601,0.3183],[-0.1074,0.2539,-0.5868],[-0.3933,0.027,0.2216],[-0.0992,0.326,-0.7409]],[[-0.3088,0.1163,0.3152],[-0.2167,0.2445,-0.4884],[-0.3359,0.0977,0.3671],[-0.1987,0.2089,-0.5013],[-0.3862,0.0381,0.2889],[-0.2032,0.2576,-0.6499]],[[-0.3179,0.1471,0.3272],[-0.2914,0.2241,-0.4239],[-0.3464,0.1311,0.3814],[-0.2783,0.1865,-0.432],[-0.3897,0.058,0.3158],[-0.2837,0.2223,-0.5756]],[[-0.3018,0.1621,0.3362],[-0.3197,0.2293,-0.4108],[-0.3288,0.1464,0.391],[-0.3065,0.1931,-0.4202],[-0.3682,0.0723,0.3241],[-0.3149,0.2289,-0.5715]],[[-0.2739,0.1241,0.2882],[-0.1635,0.2837,-0.5118],[-0.2988,0.103,0.336],[-0.139,0.2542,-0.5326],[-0.3265,0.0508,0.254],[-0.1297,0.3193,-0.6855]],[[-0.2831,0.0672,0.1562],[0.0611,0.3349,-0.5949],[-0.3072,0.0389,0.1955],[0.0976,0.3112,-0.6229],[-0.3108,0.0166,0.0945],[0.1374,0.3972,-0.7623]],[[-0.1866,0.0577,0.0155],[0.188,0.3297,-0.5439],[-0.204,0.024,0.0539],[0.2309,0.3022,-0.5662],[-0.1904,0.0061,-0.0649],[0.2852,0.3692,-0.7092]],[[-0.1059,0.0924,-0.1319],[0.1915,0.3112,-0.418],[-0.1182,0.0564,-0.0975],[0.2351,0.2741,-0.4291],[-0.1061,0.0358,-0.2211],[0.2829,0.304,-0.5748]],[[-0.1585,0.1168,-0.1581],[0.0187,0.2941,-0.3344],[-0.175,0.0746,-0.1256],[0.0538,0.2542,-0.3397],[-0.1716,0.0597,-0.2353],[0.0841,0.2651,-0.484]],[[-0.2136,0.1195,-0.0408],[-0.072,0.2408,-0.2934],[-0.2369,0.0745,0.0024],[-0.0425,0.2031,-0.2974],[-0.2415,0.0545,-0.0751],[-0.0134,0.2194,-0.4437]],[[-0.248,0.1473,0.1118],[-0.0776,0.1968,-0.3565],[-0.2725,0.1043,0.1614],[-0.0506,0.1601,-0.3678],[-0.2798,0.076,0.1164],[-0.014,0.1932,-0.5064]]],"R":[[[0.1169,0.2195,-0.312],[0.267,0.1641,-0.0269],[0.0896,0.177,-0.3144],[0.2923,0.126,0.0196],[0.049,0.1808,-0.4444],[0.2993,0.1042,-0.047]],[[0.091,0.2359,-0.3029],[0.2099,0.1461,-0.1117],[0.0607,0.1922,-0.3059],[0.2316,0.1074,-0.0731],[0.0299,0.2076,-0.4412],[0.2343,0.1076,-0.1735]],[[0.0394,0.2586,-0.3301],[0.1581,0.121,-0.1772],[0.0051,0.2128,-0.336],[0.1742,0.0802,-0.1491],[-0.0121,0.2372,-0.4708],[0.1655,0.0953,-0.2616]],[[-0.1156,0.2377,-0.3461],[0.0778,0.0923,-0.2027],[-0.1583,0.1889,-0.3543],[0.0893,0.0508,-0.1775],[-0.1902,0.2189,-0.5006],[0.0749,0.0654,-0.3064]],[[-0.1895,0.2348,-0.3999],[0.086,0.0707,-0.1524],[-0.233,0.1876,-0.4148],[0.0995,0.0324,-0.1209],[-0.2785,0.2207,-0.5764],[0.0889,0.0341,-0.2641]],[[-0.1854,0.2591,-0.4992],[0.1388,0.0458,-0.0362],[-0.2301,0.216,-0.5238],[0.1535,0.0171,0.0054],[-0.2851,0.2571,-0.6811],[0.1426,0.0,-0.1291]],[[-0.2004,0.2691,-0.5767],[0.1795,0.0568,0.0518],[-0.2465,0.2305,-0.6063],[0.1948,0.032,0.095],[-0.2973,0.2866,-0.7579],[0.1884,0.0062,-0.0316]],[[-0.1271,0.2854,-0.6169],[0.2281,0.0702,0.1051],[-0.1687,0.251,-0.6474],[0.2463,0.0439,0.146],[-0.2095,0.3234,-0.7954],[0.2464,0.0251,0.027]],[[0.019,0.3116,-0.634],[0.2642,0.0768,0.1648],[-0.0166,0.2783,-0.6636],[0.286,0.0527,0.2054],[-0.0419,0.3639,-0.8079],[0.2901,0.042,0.0974]],[[0.0805,0.3119,-0.6339],[0.3154,0.0934,0.2228],[0.0481,0.2769,-0.6608],[0.3411,0.0717,0.264],[0.0278,0.3619,-0.8086],[0.3537,0.0598,0.1608]],[[0.1365,0.2898,-0.5816],[0.3399,0.1201,0.2803],[0.1102,0.2519,-0.602],[0.3676,0.1019,0.3266],[0.1017,0.3243,-0.7601],[0.4035,0.0748,0.2274]],[[0.2223,0.2635,-0.501],[0.3168,0.1499,0.3233],[0.2038,0.2235,-0.5143],[0.3446,0.1362,0.3766],[0.2084,0.2743,-0.6667],[0.3962,0.0847,0.2964]],[[0.299,0.2571,-0.4348],[0.3261,0.1833,0.3356],[0.2855,0.216,-0.4432],[0.3554,0.1725,0.3913],[0.291,0.2538,-0.5905],[0.3997,0.1059,0.324]],[[0.328,0.268,-0.4214],[0.3096,0.1956,0.3449],[0.3144,0.2283,-0.4311],[0.3373,0.1847,0.4011],[0.323,0.2666,-0.5862],[0.3777,0.1164,0.3325]],[[0.1677,0.2934,-0.5251],[0.281,0.1512,0.2957],[0.1426,0.2583,-0.5464],[0.3065,0.1343,0.3447],[0.133,0.3233,-0.7032],[0.3349,0.0861,0.2605]],[[-0.0627,0.3022,-0.6103],[0.2904,0.0946,0.1602],[-0.1001,0.2707,-0.639],[0.3151,0.0703,0.2006],[-0.141,0.3512,-0.782],[0.3188,0.0481,0.0969]],[[-0.1928,0.2721,-0.5579],[0.1914,0.066,0.0159],[-0.2369,0.2355,-0.5808],[0.2093,0.0348,0.0553],[-0.2926,0.2937,-0.7276],[0.1953,0.0138,-0.0666]],[[-0.1964,0.2524,-0.4288],[0.1086,0.0859,-0.1353],[-0.2412,0.2059,-0.4402],[0.1213,0.0514,-0.1],[-0.2902,0.2272,-0.5896],[0.1089,0.0278,-0.2268]],[[-0.0192,0.2685,-0.343],[0.1626,0.1212,-0.1622],[-0.0551,0.2208,-0.3485],[0.1796,0.0811,-0.1289],[-0.0863,0.226,-0.4965],[0.1761,0.0651,-0.2414]],[[0.0738,0.2315,-0.301],[0.2191,0.1347,-0.0419],[0.0436,0.1871,-0.305],[0.243,0.093,0.0025],[0.0138,0.1982,-0.4552],[0.2477,0.0735,-0.077]],[[0.0796,0.1875,-0.3657],[0.2544,0.1699,0.1147],[0.052,0.1446,-0.3773],[0.2795,0.1305,0.1655],[0.0143,0.1714,-0.5195],[0.287,0.1029,0.1194]]]};
// MOCAP RAINBOW: real-player slow-mo capture (YouTube MAUfC9xQ70o, 60 fps, frames 144-206 -> 53) drives the body; both feet
// and the ball (sole drag, calf roll, heel flick) are authored from spec.md, the flight is physical
const RAINBOW_F = {"L":[[[-0.2751,0.0488,-0.0328],[0.069,0.1364,-0.1455],[-0.2635,0.0089,-0.0487],[0.0376,0.1061,-0.179],[-0.2624,0.0278,-0.1762],[0.0677,0.1155,-0.2859]],[[-0.287,0.0496,-0.0301],[0.0418,0.1475,-0.1559],[-0.2757,0.0095,-0.0458],[0.0094,0.1176,-0.1884],[-0.2739,0.0282,-0.1741],[0.0362,0.1232,-0.2946]],[[-0.2992,0.0509,-0.0263],[0.0184,0.1585,-0.1612],[-0.2882,0.0106,-0.0416],[-0.0148,0.1292,-0.1924],[-0.285,0.0293,-0.1716],[0.0097,0.1313,-0.2975]],[[-0.3116,0.0528,-0.0215],[0.0007,0.1686,-0.1591],[-0.3011,0.0122,-0.0363],[-0.0333,0.1399,-0.189],[-0.2958,0.0315,-0.169],[-0.0097,0.1391,-0.2927]],[[-0.3242,0.0549,-0.016],[-0.0118,0.1773,-0.1501],[-0.3142,0.014,-0.0302],[-0.0464,0.1492,-0.1784],[-0.3064,0.0343,-0.1667],[-0.0228,0.146,-0.2807]],[[-0.3361,0.0568,-0.0099],[-0.0206,0.1843,-0.1361],[-0.3266,0.0156,-0.0234],[-0.0559,0.1568,-0.1628],[-0.316,0.0369,-0.1646],[-0.0316,0.1511,-0.2635]],[[-0.3455,0.0579,-0.0024],[-0.0272,0.189,-0.1185],[-0.3363,0.0165,-0.0151],[-0.0633,0.1619,-0.1435],[-0.3225,0.0379,-0.1613],[-0.0381,0.1535,-0.2427]],[[-0.351,0.0587,0.0075],[-0.0329,0.1912,-0.0986],[-0.342,0.0172,-0.004],[-0.0702,0.1644,-0.1216],[-0.3247,0.0368,-0.1542],[-0.0435,0.153,-0.2193]],[[-0.3524,0.0607,0.0208],[-0.0381,0.1906,-0.0764],[-0.3434,0.0193,0.0111],[-0.0764,0.1639,-0.0973],[-0.323,0.0344,-0.1413],[-0.0478,0.1492,-0.1928]],[[-0.3504,0.0653,0.0375],[-0.0418,0.187,-0.0515],[-0.3415,0.0242,0.0303],[-0.0811,0.16,-0.0699],[-0.3185,0.0317,-0.1216],[-0.0496,0.1418,-0.1624]],[[-0.347,0.0739,0.0565],[-0.0424,0.1804,-0.0235],[-0.3384,0.0334,0.0524],[-0.0824,0.1529,-0.0392],[-0.314,0.0303,-0.096],[-0.0477,0.1305,-0.1276]],[[-0.3451,0.0881,0.0759],[-0.0378,0.1716,0.0068],[-0.3374,0.0486,0.0755],[-0.0783,0.1434,-0.0063],[-0.3126,0.0324,-0.0664],[-0.0405,0.1155,-0.0896]],[[-0.3466,0.1088,0.0937],[-0.0285,0.1623,0.0359],[-0.3406,0.0707,0.0971],[-0.0695,0.1335,0.0254],[-0.3157,0.0402,-0.0366],[-0.0295,0.0979,-0.0529]],[[-0.3514,0.1362,0.1083],[-0.0189,0.1542,0.0598],[-0.3475,0.0999,0.1154],[-0.0605,0.1248,0.0517],[-0.3219,0.0557,-0.0097],[-0.0193,0.08,-0.0224]],[[-0.3579,0.1704,0.1191],[-0.0143,0.1476,0.0765],[-0.3559,0.1364,0.1295],[-0.0566,0.1181,0.0703],[-0.3286,0.0804,0.0131],[-0.0159,0.063,-0.0011]],[[-0.3618,0.2115,0.1268],[-0.0183,0.1418,0.0865],[-0.3616,0.1803,0.1399],[-0.0614,0.1125,0.0816],[-0.3314,0.1155,0.0335],[-0.0226,0.0473,0.0115]],[[-0.3571,0.2612,0.1324],[-0.0313,0.1346,0.0918],[-0.3584,0.2335,0.1484],[-0.0749,0.1058,0.0874],[-0.3247,0.1631,0.0555],[-0.039,0.0322,0.0178]],[[-0.3373,0.32,0.1361],[-0.0501,0.1245,0.0951],[-0.3395,0.2963,0.156],[-0.0939,0.0963,0.0902],[-0.3033,0.2237,0.0832],[-0.06,0.0178,0.0216]],[[-0.3,0.384,0.1369],[-0.0699,0.1122,0.0985],[-0.3019,0.3645,0.1618],[-0.1135,0.0846,0.0927],[-0.2647,0.2916,0.1166],[-0.0799,0.0056,0.0261]],[[-0.2476,0.4452,0.1333],[-0.086,0.1022,0.1031],[-0.2469,0.43,0.1632],[-0.129,0.075,0.0963],[-0.2112,0.3573,0.151],[-0.0948,0.0,0.0328]],[[-0.1906,0.491,0.1249],[-0.0931,0.1037,0.1083],[-0.1852,0.4792,0.1574],[-0.1349,0.0772,0.1009],[-0.1544,0.4067,0.1775],[-0.1007,0.0094,0.0427]],[[-0.1485,0.5027,0.1126],[-0.0863,0.1315,0.1113],[-0.1378,0.4919,0.1431],[-0.1261,0.1071,0.1047],[-0.117,0.4201,0.1843],[-0.0943,0.0469,0.0564]],[[-0.146,0.4599,0.0973],[-0.0618,0.2031,0.108],[-0.1317,0.4456,0.1206],[-0.0988,0.1832,0.1039],[-0.1274,0.3759,0.1598],[-0.0733,0.1265,0.0741]],[[-0.1869,0.3732,0.078],[-0.0249,0.3085,0.0981],[-0.171,0.3518,0.0915],[-0.0591,0.2948,0.0978],[-0.1832,0.2847,0.1058],[-0.0437,0.2354,0.0914]],[[-0.2551,0.2753,0.0518],[0.0134,0.4152,0.0828],[-0.2393,0.2463,0.0569],[-0.0192,0.4066,0.0852],[-0.2566,0.1815,0.0345],[-0.0148,0.34,0.0988]],[[-0.3201,0.2071,0.0209],[0.0376,0.4861,0.0606],[-0.3061,0.1733,0.0216],[0.0055,0.4797,0.0625],[-0.3135,0.11,-0.0308],[0.0049,0.406,0.0857]],[[-0.3525,0.1912,-0.0097],[0.0334,0.5085,0.0303],[-0.342,0.1567,-0.0096],[0.0013,0.5017,0.028],[-0.3311,0.0953,-0.0736],[0.0055,0.4262,0.0507]],[[-0.3253,0.2281,-0.0402],[-0.0107,0.4941,0.0035],[-0.3176,0.1957,-0.0382],[-0.0436,0.4871,-0.0044],[-0.2858,0.1368,-0.098],[-0.029,0.4174,0.0137]],[[-0.2481,0.2826,-0.0776],[-0.0752,0.4724,0.0058],[-0.2401,0.2515,-0.0738],[-0.1092,0.4678,-0.0044],[-0.1871,0.194,-0.1277],[-0.0871,0.406,0.0128]],[[-0.1501,0.3237,-0.129],[-0.127,0.4615,0.0546],[-0.1384,0.2907,-0.1254],[-0.1614,0.4627,0.0481],[-0.0664,0.2327,-0.1815],[-0.1383,0.4061,0.071]],[[-0.071,0.3313,-0.1933],[-0.1331,0.4715,0.1414],[-0.0544,0.2933,-0.1929],[-0.166,0.4803,0.1429],[0.0297,0.2334,-0.2611],[-0.1457,0.4258,0.1768]],[[-0.0348,0.3033,-0.2571],[-0.0812,0.5004,0.2392],[-0.0142,0.2597,-0.2629],[-0.1108,0.5163,0.2492],[0.0721,0.1987,-0.3479],[-0.0914,0.4634,0.2954]],[[-0.0427,0.2508,-0.3035],[0.0165,0.5351,0.3213],[-0.0204,0.2036,-0.3169],[-0.0094,0.5546,0.3376],[0.0591,0.1456,-0.417],[0.0157,0.5052,0.3924]],[[-0.0766,0.1936,-0.3275],[0.1267,0.5583,0.3716],[-0.055,0.1456,-0.3481],[0.1031,0.5765,0.3916],[0.0127,0.0945,-0.4591],[0.1389,0.5312,0.4473]],[[-0.1226,0.1454,-0.3311],[0.2189,0.5602,0.3821],[-0.1035,0.0985,-0.3575],[0.1958,0.5731,0.4038],[-0.0503,0.0559,-0.4754],[0.2415,0.5295,0.4517]],[[-0.1714,0.1148,-0.3202],[0.2685,0.5399,0.3528],[-0.1562,0.0696,-0.3508],[0.2438,0.5451,0.3746],[-0.118,0.0351,-0.4728],[0.2932,0.5001,0.4072]],[[-0.2178,0.104,-0.3026],[0.2645,0.5014,0.2924],[-0.2069,0.0602,-0.3356],[0.2362,0.4985,0.3131],[-0.1825,0.0329,-0.4597],[0.2824,0.4506,0.3248]],[[-0.2575,0.1093,-0.2837],[0.2171,0.4464,0.2144],[-0.2504,0.0661,-0.3172],[0.184,0.436,0.2321],[-0.2372,0.0444,-0.4419],[0.2239,0.3872,0.2183]],[[-0.2857,0.1209,-0.2639],[0.1624,0.3775,0.1361],[-0.281,0.0779,-0.2962],[0.1247,0.3605,0.1485],[-0.2747,0.06,-0.4207],[0.1606,0.3159,0.1065]],[[-0.2989,0.1312,-0.2423],[0.1305,0.302,0.0679],[-0.2949,0.0882,-0.2723],[0.0906,0.2796,0.073],[-0.2909,0.0732,-0.3972],[0.1265,0.2461,0.0039]],[[-0.2968,0.1367,-0.2187],[0.1293,0.2309,0.0126],[-0.2924,0.0936,-0.2455],[0.0897,0.2048,0.0094],[-0.2878,0.0815,-0.373],[0.1282,0.1875,-0.0812]],[[-0.2829,0.1373,-0.193],[0.1466,0.1741,-0.0287],[-0.2775,0.0941,-0.2162],[0.1091,0.1461,-0.0394],[-0.2723,0.0849,-0.3488],[0.1491,0.1454,-0.1434]],[[-0.2626,0.135,-0.1658],[0.165,0.1369,-0.0525],[-0.2564,0.0916,-0.1848],[0.1295,0.1081,-0.068],[-0.2517,0.0846,-0.3232],[0.1667,0.1193,-0.1775]],[[-0.2421,0.1333,-0.1387],[0.1729,0.1175,-0.0566],[-0.2355,0.09,-0.1533],[0.1381,0.0886,-0.0734],[-0.2308,0.0832,-0.2947],[0.1687,0.1042,-0.1836]],[[-0.2241,0.1363,-0.1143],[0.1709,0.1107,-0.0445],[-0.2173,0.0935,-0.1245],[0.1356,0.0819,-0.0599],[-0.2105,0.0842,-0.2644],[0.1601,0.0959,-0.17]],[[-0.2079,0.1471,-0.095],[0.1643,0.1121,-0.0201],[-0.2006,0.1053,-0.1012],[0.1281,0.0835,-0.0324],[-0.1894,0.0908,-0.2358],[0.1513,0.0922,-0.1438]],[[-0.1915,0.1665,-0.0834],[0.1576,0.117,0.0125],[-0.1835,0.126,-0.086],[0.1207,0.0888,0.0037],[-0.1664,0.104,-0.2138],[0.1489,0.0911,-0.1106]],[[-0.1728,0.1916,-0.0824],[0.1514,0.1213,0.0481],[-0.164,0.1522,-0.0818],[0.1141,0.0934,0.0423],[-0.1406,0.1216,-0.2028],[0.151,0.0895,-0.0746]],[[-0.1495,0.2154,-0.0947],[0.1423,0.1219,0.0802],[-0.14,0.1762,-0.0917],[0.1044,0.0944,0.0764],[-0.1105,0.1382,-0.2072],[0.1495,0.0855,-0.0401]],[[-0.1224,0.2323,-0.1185],[0.1284,0.1189,0.1061],[-0.1118,0.1927,-0.1147],[0.0897,0.0922,0.1032],[-0.0771,0.1503,-0.2266],[0.1407,0.0805,-0.01]],[[-0.0955,0.2411,-0.1512],[0.1109,0.1138,0.1268],[-0.0837,0.2009,-0.1488],[0.0715,0.0881,0.124],[-0.045,0.1582,-0.2604],[0.1267,0.0764,0.0155]],[[-0.075,0.244,-0.1896],[0.0939,0.108,0.1454],[-0.062,0.2032,-0.191],[0.054,0.0833,0.1419],[-0.0212,0.1649,-0.3073],[0.112,0.0737,0.0381]],[[-0.0652,0.2437,-0.2316],[0.0813,0.1023,0.1646],[-0.0516,0.2025,-0.2388],[0.0418,0.0785,0.1601],[-0.0107,0.1735,-0.3652],[0.1009,0.0718,0.0603]]],"R":[[[-0.0742,0.1133,-0.1565],[0.2959,0.0893,-0.0353],[-0.0405,0.0872,-0.1926],[0.2835,0.0441,-0.0524],[-0.0728,0.0911,-0.3076],[0.2823,0.0642,-0.1895]],[[-0.0449,0.1308,-0.1678],[0.3087,0.0926,-0.0324],[-0.0101,0.1052,-0.2027],[0.2966,0.0472,-0.0493],[-0.039,0.1058,-0.317],[0.2946,0.0669,-0.1873]],[[-0.0198,0.1474,-0.1734],[0.3218,0.0965,-0.0283],[0.016,0.1226,-0.207],[0.3101,0.0509,-0.0448],[-0.0104,0.1199,-0.3201],[0.3066,0.0704,-0.1846]],[[-0.0007,0.1619,-0.1712],[0.3352,0.1011,-0.0231],[0.0358,0.1379,-0.2033],[0.3239,0.0552,-0.039],[0.0105,0.1323,-0.3149],[0.3182,0.0749,-0.1818]],[[0.0127,0.1738,-0.1615],[0.3488,0.106,-0.0172],[0.0499,0.1506,-0.192],[0.338,0.0599,-0.0325],[0.0245,0.1423,-0.302],[0.3297,0.0802,-0.1794]],[[0.0222,0.1831,-0.1464],[0.3616,0.1104,-0.0106],[0.0601,0.1607,-0.1751],[0.3513,0.0641,-0.0251],[0.034,0.1497,-0.2835],[0.3399,0.0849,-0.1771]],[[0.0292,0.1895,-0.1275],[0.3716,0.1134,-0.0026],[0.0681,0.1678,-0.1544],[0.3618,0.067,-0.0162],[0.0409,0.1536,-0.2611],[0.3469,0.0872,-0.1735]],[[0.0354,0.1931,-0.1061],[0.3776,0.1155,0.0081],[0.0755,0.1719,-0.1309],[0.3679,0.069,-0.0043],[0.0468,0.1541,-0.2359],[0.3494,0.0866,-0.1659]],[[0.0409,0.1935,-0.0822],[0.3791,0.1179,0.0224],[0.0822,0.1726,-0.1046],[0.3695,0.0715,0.012],[0.0514,0.1509,-0.2074],[0.3475,0.0836,-0.152]],[[0.0449,0.1904,-0.0554],[0.377,0.1225,0.0404],[0.0872,0.1693,-0.0752],[0.3674,0.0764,0.0326],[0.0534,0.1433,-0.1747],[0.3427,0.0798,-0.1308]],[[0.0456,0.1834,-0.0252],[0.3733,0.131,0.0608],[0.0886,0.1619,-0.0422],[0.364,0.0857,0.0564],[0.0513,0.1308,-0.1373],[0.3378,0.0774,-0.1033]],[[0.0407,0.173,0.0073],[0.3712,0.1459,0.0817],[0.0842,0.1509,-0.0067],[0.363,0.1019,0.0812],[0.0436,0.1131,-0.0964],[0.3363,0.0793,-0.0715]],[[0.0307,0.1611,0.0386],[0.3728,0.1685,0.1008],[0.0748,0.1384,0.0273],[0.3664,0.1263,0.1045],[0.0317,0.092,-0.0569],[0.3396,0.0884,-0.0394]],[[0.0203,0.1504,0.0644],[0.3781,0.199,0.1165],[0.0651,0.1273,0.0556],[0.3738,0.1591,0.1242],[0.0208,0.0706,-0.0241],[0.3464,0.1064,-0.0105]],[[0.0154,0.1424,0.0823],[0.385,0.237,0.1281],[0.0609,0.1193,0.0756],[0.3829,0.2001,0.1393],[0.0171,0.0517,-0.0012],[0.3535,0.1343,0.0141]],[[0.0197,0.1369,0.093],[0.3892,0.2821,0.1364],[0.066,0.1142,0.0878],[0.389,0.2485,0.1505],[0.0244,0.0361,0.0123],[0.3565,0.1725,0.036]],[[0.0337,0.1319,0.0988],[0.3842,0.3345,0.1425],[0.0806,0.1098,0.094],[0.3855,0.305,0.1596],[0.0419,0.0233,0.0191],[0.3494,0.2224,0.0597]],[[0.0539,0.1248,0.1023],[0.3629,0.3938,0.1465],[0.101,0.1034,0.0971],[0.3653,0.3688,0.1678],[0.0645,0.012,0.0233],[0.3262,0.2832,0.0895]],[[0.0752,0.1156,0.106],[0.3228,0.455,0.1473],[0.1221,0.0948,0.0997],[0.3248,0.4345,0.1741],[0.086,0.003,0.028],[0.2848,0.3484,0.1254]],[[0.0925,0.1082,0.1109],[0.2664,0.5101,0.1434],[0.1387,0.0876,0.1036],[0.2656,0.4937,0.1756],[0.1019,0.0,0.0353],[0.2272,0.4082,0.1625]],[[0.1002,0.1112,0.1165],[0.2051,0.5478,0.1344],[0.1452,0.0913,0.1086],[0.1993,0.534,0.1693],[0.1084,0.0113,0.0459],[0.1661,0.4497,0.1909]],[[0.0928,0.1398,0.1198],[0.1597,0.5518,0.1212],[0.1357,0.1216,0.1126],[0.1483,0.538,0.154],[0.1015,0.0503,0.0607],[0.1259,0.4565,0.1983]],[[0.0665,0.2118,0.1162],[0.1571,0.5053,0.1047],[0.1063,0.198,0.1118],[0.1417,0.4869,0.1297],[0.0789,0.1317,0.0797],[0.1371,0.4111,0.1719]],[[0.0267,0.3176,0.1056],[0.2011,0.4203,0.0839],[0.0636,0.3098,0.1052],[0.184,0.394,0.0984],[0.047,0.2428,0.0984],[0.1971,0.3244,0.1139]],[[-0.0144,0.4246,0.0891],[0.2745,0.3289,0.0557],[0.0207,0.422,0.0916],[0.2574,0.2945,0.0612],[0.0159,0.3494,0.1063],[0.276,0.2283,0.0371]],[[-0.0405,0.4959,0.0652],[0.3443,0.2688,0.0225],[-0.006,0.4956,0.0672],[0.3293,0.2296,0.0232],[-0.0053,0.4164,0.0922],[0.3373,0.1631,-0.0331]],[[-0.036,0.5209,0.0326],[0.3792,0.2584,-0.0104],[-0.0014,0.5201,0.0301],[0.368,0.2191,-0.0103],[-0.0059,0.4381,0.0545],[0.3562,0.1508,-0.0792]],[[0.0115,0.5144,0.0038],[0.3499,0.2925,-0.0432],[0.0469,0.5135,-0.0048],[0.3417,0.2561,-0.0411],[0.0312,0.4356,0.0147],[0.3075,0.1862,-0.1055]],[[0.0809,0.5042,0.0062],[0.267,0.3353,-0.0835],[0.1174,0.5062,-0.0048],[0.2583,0.3003,-0.0794],[0.0937,0.4352,0.0138],[0.2012,0.2276,-0.1374]],[[0.1366,0.5031,0.0588],[0.1615,0.3595,-0.1388],[0.1736,0.5114,0.0517],[0.1489,0.3217,-0.1349],[0.1487,0.4458,0.0764],[0.0714,0.2445,-0.1952]],[[0.1432,0.515,0.1521],[0.0764,0.3516,-0.2079],[0.1786,0.5313,0.1537],[0.0585,0.3073,-0.2075],[0.1567,0.4685,0.1902],[-0.0319,0.2257,-0.2809]],[[0.0874,0.5355,0.2573],[0.0374,0.3141,-0.2766],[0.1192,0.5587,0.2681],[0.0152,0.2629,-0.2829],[0.0983,0.4978,0.3178],[-0.0776,0.1797,-0.3743]],[[-0.0178,0.553,0.3457],[0.0459,0.2592,-0.3265],[0.0101,0.5792,0.3632],[0.022,0.2038,-0.3409],[-0.0169,0.521,0.4221],[-0.0636,0.1252,-0.4486]],[[-0.1363,0.5554,0.3998],[0.0824,0.2046,-0.3524],[-0.111,0.5798,0.4213],[0.0592,0.1486,-0.3745],[-0.1495,0.5238,0.4812],[-0.0137,0.0797,-0.4939]],[[-0.2355,0.5386,0.411],[0.1319,0.1621,-0.3562],[-0.2106,0.5572,0.4344],[0.1114,0.1078,-0.3846],[-0.2598,0.501,0.4859],[0.0541,0.051,-0.5115]],[[-0.2888,0.5067,0.3795],[0.1844,0.1391,-0.3445],[-0.2622,0.5173,0.4031],[0.1681,0.0875,-0.3774],[-0.3154,0.4588,0.4381],[0.1269,0.0426,-0.5086]],[[-0.2845,0.466,0.3146],[0.2343,0.137,-0.3256],[-0.2542,0.4687,0.3368],[0.2225,0.0876,-0.361],[-0.3038,0.4078,0.3494],[0.1963,0.0533,-0.4946]],[[-0.2336,0.4166,0.2307],[0.2771,0.1508,-0.3052],[-0.1979,0.4122,0.2497],[0.2694,0.1029,-0.3412],[-0.2409,0.3515,0.2349],[0.2552,0.0768,-0.4755]],[[-0.1747,0.3536,0.1465],[0.3074,0.1691,-0.2839],[-0.1342,0.343,0.1598],[0.3023,0.1219,-0.3187],[-0.1727,0.2877,0.1146],[0.2956,0.1013,-0.4526]],[[-0.1404,0.2789,0.073],[0.3215,0.1828,-0.2607],[-0.0974,0.263,0.0785],[0.3173,0.1357,-0.2929],[-0.1361,0.2196,0.0042],[0.313,0.1188,-0.4273]],[[-0.1391,0.2026,0.0135],[0.3193,0.1883,-0.2352],[-0.0965,0.1827,0.0101],[0.3145,0.1411,-0.2641],[-0.138,0.1562,-0.0874],[0.3096,0.1271,-0.4013]],[[-0.1578,0.138,-0.0309],[0.3044,0.1862,-0.2076],[-0.1174,0.1155,-0.0424],[0.2985,0.1386,-0.2326],[-0.1604,0.1066,-0.1543],[0.2929,0.1276,-0.3753]],[[-0.1775,0.0942,-0.0565],[0.2825,0.1795,-0.1784],[-0.1393,0.0705,-0.0732],[0.2758,0.1316,-0.1989],[-0.1793,0.0749,-0.191],[0.2708,0.123,-0.3477]],[[-0.186,0.0718,-0.0609],[0.2605,0.1735,-0.1493],[-0.1485,0.0478,-0.079],[0.2534,0.1256,-0.165],[-0.1815,0.0584,-0.1975],[0.2483,0.1173,-0.317]],[[-0.1839,0.0648,-0.0479],[0.2411,0.1731,-0.123],[-0.1459,0.0411,-0.0644],[0.2338,0.1256,-0.134],[-0.1723,0.0511,-0.1829],[0.2264,0.1143,-0.2844]],[[-0.1767,0.0677,-0.0216],[0.2237,0.1814,-0.1022],[-0.1378,0.0444,-0.0348],[0.2158,0.1349,-0.1089],[-0.1628,0.049,-0.1547],[0.2038,0.1171,-0.2537]],[[-0.1695,0.0744,0.0135],[0.206,0.1989,-0.0898],[-0.1299,0.0515,0.004],[0.1974,0.1537,-0.0926],[-0.1602,0.0482,-0.119],[0.179,0.1266,-0.23]],[[-0.1629,0.0802,0.0518],[0.1859,0.2221,-0.0886],[-0.1228,0.0578,0.0455],[0.1765,0.1779,-0.088],[-0.1625,0.0461,-0.0803],[0.1512,0.1402,-0.2182]],[[-0.1531,0.0827,0.0863],[0.1608,0.2429,-0.1019],[-0.1123,0.0609,0.0822],[0.1506,0.1988,-0.0987],[-0.1608,0.0421,-0.0432],[0.1189,0.1519,-0.2229]],[[-0.1381,0.0823,0.1141],[0.1317,0.2555,-0.1275],[-0.0964,0.0615,0.1111],[0.1203,0.2108,-0.1234],[-0.1514,0.0386,-0.0107],[0.0829,0.1581,-0.2438]],[[-0.1194,0.0804,0.1364],[0.1028,0.2595,-0.1626],[-0.0769,0.0608,0.1334],[0.09,0.2139,-0.1601],[-0.1363,0.037,0.0166],[0.0484,0.16,-0.2801]],[[-0.101,0.0776,0.1564],[0.0806,0.2585,-0.204],[-0.0581,0.0592,0.1527],[0.0667,0.212,-0.2055],[-0.1205,0.0371,0.041],[0.0228,0.1623,-0.3306]],[[-0.0874,0.0741,0.1771],[0.0702,0.2562,-0.2492],[-0.0449,0.0565,0.1722],[0.0555,0.209,-0.2569],[-0.1086,0.0373,0.0649],[0.0115,0.1695,-0.3929]]]};
let RAINBOW_MC = null;
function rainbowMC() {
  if (RAINBOW_MC) return RAINBOW_MC; const base = MOVES.find(x => x.id === 'rainbow'); if (!base) return null;
  const m = JSON.parse(JSON.stringify(base, (k, v) => (k === '_t' || k === '_fk') ? undefined : v));
  Object.assign(m, { mc: true, clip: 'Rainbow', F: RAINBOW_F, own: 'both', warp: [[0, 0], [m.T, 52]], bones: {} });
  m.beat = m.beatT / m.T; return (RAINBOW_MC = m);
}
let HEEL_MC = null;
function heelMC() {
  if (HEEL_MC) return HEEL_MC; const base = MOVES.find(x => x.id === 'heel'); if (!base) return null;
  const m = JSON.parse(JSON.stringify(base, (k, v) => (k === '_t' || k === '_fk') ? undefined : v));
  Object.assign(m, { mc: true, clip: 'Heel', F: HEEL_F, own: 'both', warp: [[0, 0], [m.T, 20]], bones: {}, fwdAim: true });
  m.beat = m.beatT / m.T; return (HEEL_MC = m);
}
let CROQUETA_MC = null;
function croquetaMC() {
  if (CROQUETA_MC) return CROQUETA_MC; const base = MOVES.find(x => x.id === 'croqueta'); if (!base) return null;
  const m = JSON.parse(JSON.stringify(base, (k, v) => (k === '_t' || k === '_fk') ? undefined : v));
  Object.assign(m, { mc: true, clip: 'Croqueta', F: CROQUETA_F, own: 'both', warp: [[0, 0], [m.T, 22]], bones: {} });
  m.beat = m.beatT / m.T; return (CROQUETA_MC = m);
}
let ELASTICO_MC = null;
function elasticoMC() {
  if (ELASTICO_MC) return ELASTICO_MC; const base = MOVES.find(x => x.id === 'elastico'); if (!base) return null;
  const m = JSON.parse(JSON.stringify(base, (k, v) => (k === '_t' || k === '_fk') ? undefined : v));
  Object.assign(m, { mc: true, clip: 'Elastico', F: ELASTICO_F, own: 'l', warp: [[0, 0], [m.T, 25]], bones: {} });
  m.touches.forEach(tc => delete tc.hit); m.touches[m.touches.length - 1].hit = 1;
  m.beat = m.beatT / m.T; return (ELASTICO_MC = m);
}
let ROULETTE_MC = null;
function rouletteMC() {
  if (ROULETTE_MC) return ROULETTE_MC; const base = MOVES.find(x => x.id === 'roulette'); if (!base) return null;
  const m = JSON.parse(JSON.stringify(base, (k, v) => (k === '_t' || k === '_fk') ? undefined : v));
  // spec.md: arms wide (upper arms ~60° abduction) -> added on top of the captured arms
  const T8 = m.T / 0.85, arm = (v) => [[[0, 0], [0.12 * T8, v], [0.66 * T8, v], [m.T, 0]], 0, 0];
  Object.assign(m, { mc: true, clip: 'Roulette', F: ROULETTE_F, own: 'both', warp: [[0, 0], [m.T, 40]], addArms: true, bones: { upperarm_r: arm(-0.4), upperarm_l: arm(0) },
    lane: [[0, 0], [0.12 * m.T / 0.8, 0.04], [0.3 * m.T / 0.8, 0.4], [0.42 * m.T / 0.8, 0.66], [0.6 * m.T / 0.8, 0.93], [m.T, 1]] });
  m.beat = m.beatT / m.T; return (ROULETTE_MC = m);
}
const _mv = new THREE.Vector3(), _mv2 = new THREE.Vector3(), _mo = new THREE.Quaternion();
function mcGrounded(m, d, side, t) { return mcRaw(m, d, side === 'l' ? 0 : 1, t, _mv2).y < 0.075; }
// foot orientation from the captured heel->toe vector (yaw + pitch), plus the sole-contact tilt
function mcFootOri(m, d, side, t, out) {
  const j = side === 'l' ? 0 : 1; mcRaw(m, d, 2 + j, t, _mv); mcRaw(m, d, 4 + j, t, _mv2); _mv2.sub(_mv);
  const h = Math.hypot(_mv2.x, _mv2.z) || 1e-3;
  let yaw = Math.atan2(-_mv2.x, -_mv2.z); yaw = Math.max(-0.6, Math.min(0.6, yaw)) * 0.7;
  let pitch = Math.atan2(_mv2.y, h) - 0.18; pitch = Math.max(-0.5, Math.min(0.7, pitch));
  const tc = m.touches[0];
  if (side === mcRollSide(m, d)) { const k = Math.min(1, Math.max(0, Math.min(t - tc.t0 + 0.05, tc.t1 + 0.05 - t) / 0.05));
    if (tc.surf === 'sole') pitch = pitch * (1 - k) - 0.25 * k; else if (tc.surf === 'inside') { pitch *= 1 - k; yaw = yaw * (1 - k) + d * 0.3 * k; } else if (tc.surf === 'outside') { pitch *= 1 - k; yaw = yaw * (1 - k) + d * 0.25 * k; } } // heel up / toe down on the ball
  return out.setFromEuler(_eu.set(pitch, yaw, 0, 'YXZ'));
}
// ankle target in G: captured ankle; the rolling foot is raised onto the top of the ball around the contact window
function mcAnkle(m, d, side, t, out) {
  if (mcOwns(m, d, side)) { const ks = footKeys(m, d, side); let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++;
    if (t <= ks[0].t) out.copy(ks[0].p); else if (t >= ks[ks.length - 1].t) out.copy(ks[ks.length - 1].p); else hermite(ks[i].p, ks[i].v, ks[i + 1].p, ks[i + 1].v, ks[i].t, ks[i + 1].t, t, out);
    out.y = Math.max(out.y, A - 0.01); b2g(bodyAt(m, d, t), out);
    // circle round the ball where it actually is (it may have rolled ahead / aside in the dribble), back to the authored plant
    const k = m === SK.m && m.id === "scissor" ? Math.min(1, Math.max(0, Math.min(t / 0.04, (0.3 - t) / 0.07))) : 0; if (k > 0) { out.z += Math.max(-0.45, Math.min(0.4, BS.p.z - B0[2])) * k; out.x += Math.max(-0.25, Math.min(0.25, BS.p.x)) * k; }
    return out; }
  mcRaw(m, d, side === 'l' ? 0 : 1, t, out); out.y += MC_Y;
  const tc = m.touches[0];
  if (side === mcRollSide(m, d)) {
    const k = ease(Math.min(1, Math.max(0, Math.min(t - tc.t0 + 0.05, tc.t1 + 0.05 - t) / 0.05)));
    if (tc.mc) { mcFootOri(m, d, side, t, _mo); const cy = BR - surfOff(side, 'sole', _mv).applyQuaternion(_mo).y;
      out.y += (Math.max(out.y, cy) - out.y) * k; if (k >= 1) out.y = cy; }
    else if (k > 0) { // authored contact: blend the captured path into the ball-solved ankle at the touch boundaries
      const tt = Math.min(tc.t1, Math.max(tc.t0, t)), tcs = touchesOf(m, d).find(x => x.side === side); if (tcs) { contactAnkle(m, d, tcs, tt, _mv2); out.lerp(_mv2, k); } }
  }
  out.y = Math.max(out.y, A - 0.01);
  return out;
}
// retime every move to the duration measured frame-accurately in the FC 26 Arena POV reference (spec.md)
const TREF = { rollover: 0.32, scissor: 0.60, roulette: 0.80, chop: 0.45, elastico: 0.50, croqueta: 0.45, rainbow: 1.05, heel: 0.40 };
function retime(m, k) {
  const sk = (a) => { if (Array.isArray(a) && a.length && Array.isArray(a[0]) && typeof a[0][0] === 'number') for (const e of a) e[0] *= k; };
  for (const f of ['spin', 'drop', 'px', 'pz', 'lane']) sk(m[f]);
  for (const tc of m.touches || []) { tc.t0 *= k; tc.t1 *= k; sk(tc.ball); }
  for (const s in m.feet || {}) for (const f in m.feet[s]) sk(m.feet[s][f]);
  for (const b in m.bones || {}) for (const ch of m.bones[b]) sk(ch);
  m.T *= k; m.beatT *= k;
}
for (const m of [...MOVES, ROLLOVER]) { if (TREF[m.id]) retime(m, TREF[m.id] / m.T); m.beat = m.beatT / m.T; }
const TTI_WIN = 0.7, DODGE_MIN = 1.2, DODGE_MAX = 10; // skill dodge trigger: time-to-impact < 0.7s (clamped 1.2..10m)
// global slow-mo on the skill's key beat
const SLOW = { scale: 0.32, easeIn: 0.07, hold: 0.3, fovKick: 7 };
const SM = { g: 1, delay: -1, t: -1, n: 0 };
function triggerSlowMo(delay) { if (SM.delay >= 0 || SM.t >= 0) return; SM.delay = delay; SM.n++; }
function updateSlowMo(rdt) {
  if (SM.delay >= 0) { SM.delay -= rdt * SM.g; if (SM.delay < 0) SM.t = 0; }
  if (SM.t >= 0) {
    SM.t += rdt;
    if (SM.t < SLOW.easeIn) SM.g = 1 + (SLOW.scale - 1) * (SM.t / SLOW.easeIn);
    else if (SM.t < SLOW.easeIn + SLOW.hold) SM.g = SLOW.scale;
    else { SM.g = 1; SM.t = -1; SK.fov = Math.max(SK.fov, SLOW.fovKick); shake = Math.max(shake, 0.1); }
  } else SM.g = 1;
}
function threatAhead(leaveLane) {
  // nearest obstacle in the lane we're leaving, measured as time-to-impact
  let best = null;
  for (const o of obstacles) {
    const u = o.userData; if (u.lane !== leaveLane || u.beaten) continue;
    const gap = -o.position.z - (u.d || 0.6) / 2 - 0.25; if (gap < -0.3) continue;
    const v = S.speed * (u.type === 'train' ? 1.25 : 1), tti = Math.max(0, gap) / v;
    if ((tti < TTI_WIN || gap < DODGE_MIN) && gap < DODGE_MAX && (!best || tti < best.tti)) best = { o, tti };
  }
  return best;
}
function startLaneMove(d) {
  const fm = window.__forceMove, real = threatAhead(P.lane - d);
  if (fm === 'rollover') return startRoll(d, real);
  const th = real || (fm ? { o: null, tti: 0.25 } : null);
  if (th) startSkill(d, fm, th); else startRoll(d, real);
}
function startRoll(d, th) {
  if (SK.m && SK.t < 0.95) SK.prev = { m: SK.m, d: SK.d, t: SK.t, fade: SK.fade > 0 ? SK.fade : 1 };
  beginMove(); SK.m = mocapOn() ? ROLLOVER_MC : ROLLOVER; SK.lock = {}; SK.rate = 1; SK.d = d; SK.t = 0; SK.fade = 0; SK.skill = false; SK.ev = th && th.o ? Math.max(0.08, th.tti * 0.75) : 0; SK.rolls = (SK.rolls || 0) + 1;
}
const SK = { prev: null, m: null, d: 1, t: 0, w: 0, fade: 0, last: -1, combo: 0, comboT: 0, fov: 0, count: {} };
function pickMove() { let i; do { i = (Math.random() * MOVES.length) | 0; } while (i === SK.last && MOVES.length > 1); SK.last = i; return MOVES[i]; }
function startSkill(d, forced, th) {
  let m = (forced && MOVES.find(x => x.id === forced)) || pickMove();
  if (m && m.id === 'chop' && mocapOn('Chop')) m = CHOP_MC;
  if (m && m.id === 'scissor' && mocapOn('Stepover')) m = STEPOVER_MC;
  if (m && m.id === 'roulette' && mocapOn('Roulette')) m = rouletteMC() || m;
  if (m && m.id === 'elastico' && mocapOn('Elastico')) m = elasticoMC() || m;
  if (m && m.id === 'croqueta' && mocapOn('Croqueta')) m = croquetaMC() || m;
  if (m && m.id === 'heel' && mocapOn('Heel')) m = heelMC() || m;
  if (m && m.id === 'rainbow' && mocapOn('Rainbow')) m = rainbowMC() || m;
  if (forced) SK.last = MOVES.findIndex(x => x.id === m.id);
  SK.lock = {}; SK.bz = Math.max(-0.4, Math.min(0.3, BS.p.z - B0[2])); SK.bx = Math.max(-0.2, Math.min(0.2, BS.p.x));
  if (SK.m && SK.t < 0.95) SK.prev = { m: SK.m, d: SK.d, t: SK.t, fade: SK.fade > 0 ? SK.fade : 1 };
  beginMove(); SK.m = m; SK.d = d; SK.t = 0; SK.fade = 0; SK.skill = true; SK.rate = 1; SK.ev = 0;
  if (m.lane && th && th.o) { let tm = m.T; for (let x = 0; x <= m.T; x += 0.01) if (laneAt(x, m.lane) >= 0.5) { tm = x; break; } SK.rate = Math.min(1.8, Math.max(1, tm / Math.max(0.1, th.tti))); SK.ev = Math.max(0.08, th.tti * 0.75); } SK.fov = 3.5; shake = Math.max(shake, 0.08);
  SK.count[m.id] = (SK.count[m.id] || 0) + 1;
  puff();
  // skill dodge: a rival close ahead in the lane we're leaving
  const o = th && th.o;
  if (o) {
    o.userData.beaten = true; const riv = o.userData.type === 'rival';
    SK.combo = S.t - SK.comboT < COMBO_WIN ? SK.combo + 1 : 1; SK.comboT = S.t; P.beaten++;
    const pts = SKILL_BONUS * SK.combo; S.score += pts;
    popup(m.name, (riv ? 'NUTMEG +' : 'SKILL DODGE +') + pts + (SK.combo > 1 ? '  x' + SK.combo : ''), true);
    // slow-mo lands on the key beat, or as we pass the obstacle if that comes first
    triggerSlowMo(Math.max(0, Math.min(m.beat * m.T, th.tti) - SLOW.easeIn));
  } else popup(m.name, m.sub);
}
function cancelSkill() { if (SK.m && SK.fade === 0) { SK.fade = 1; if (P.laneT < 1) { P.fromX = P.x; P.laneT = 0; } } }
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _fq = new THREE.Quaternion(), _e = new THREE.Euler(), _yq = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
function rotFrame(bone, x, y, z) {
  // apply rotation (in character frame) to bone, keeping hierarchy: local = P^-1 * F*R*F^-1 * P * local
  bone.parent.getWorldQuaternion(_pq);
  _q.setFromEuler(_e.set(x, y, z, 'YXZ'));
  _q.premultiply(_fq).multiply(_fq.clone().invert());
  bone.quaternion.premultiply(_pq.clone().invert().multiply(_q).multiply(_pq));
}
// ---------- skill-move solver: body layers + foot IK + ball pinned to the real foot ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _eu = new THREE.Euler();
const BS = { p: new THREE.Vector3(...B0), v: new THREE.Vector3(), lastX: 0, inited: false }; // ball state in G
const FOOT_REL = {}; // foot bone world rotation in the rest pose relative to the group (feet flat, toes forward)
const SIDES = ['l', 'r'];
const sw = (s) => s === 'l' ? 'r' : 'l';
function calibrateFeet() {
  const b = hero.bones, saved = {};
  for (const n in b) { saved[n] = b[n].quaternion.clone(); b[n].quaternion.copy(hero.rest[n]); }
  const ry = hero.model.rotation.y; hero.model.rotation.y = Math.PI; hero.group.updateMatrixWorld(true);
  hero.group.getWorldQuaternion(_q1); _q1.invert();
  for (const s of SIDES) { b['foot_' + s].getWorldQuaternion(_q2); FOOT_REL[s] = _q1.clone().multiply(_q2); }
  for (const n in b) b[n].quaternion.copy(saved[n]); hero.model.rotation.y = ry; hero.group.updateMatrixWorld(true);
}
const ease = (u) => u * u * (3 - 2 * u);
function bodyAt(m, d, t) { return { spin: d * kf(t, m.spin), px: d * kf(t, m.px), pz: kf(t, m.pz), drop: kf(t, m.drop) }; }
function b2g(bd, v) { const c = Math.cos(bd.spin), s = Math.sin(bd.spin), x = v.x, z = v.z; v.x = x * c + z * s + bd.px; v.z = -x * s + z * c + bd.pz; return v; }
function g2b(bd, v) { const c = Math.cos(-bd.spin), s = Math.sin(-bd.spin), x = v.x - bd.px, z = v.z - bd.pz; v.x = x * c + z * s; v.z = -x * s + z * c; return v; }
// foot orientation (desired) in G at time t, for the ACTUAL side
function footOri(m, d, side, t, out) {
  if (m.mc && !mcOwns(m, d, side)) return mcFootOri(m, d, side, t, out);
  const f = m.feet[d < 0 ? sw(side) : side] || {};
  let sp = 0; for (const tc of m.touches || []) if (tc.surf === 'sole' && tc.foot === (d < 0 ? sw(side) : side)) { const k = Math.min(1, Math.max(0, Math.min(t - tc.t0 + 0.05, tc.t1 + 0.05 - t) / 0.05)); sp = Math.max(sp, 0.3 * k); }
  _eu.set(kf(t, f.pitch) + sp, d * kf(t, f.yaw) + bodyAt(m, d, t).spin, d * kf(t, f.roll), 'YXZ');
  return out.setFromEuler(_eu);
}
function surfOff(side, surf, out) { const s = SURF[surf]; return out.set(side === 'l' ? -s[0] : s[0], s[1], s[2]); }
function touchesOf(m, d) {
  m._t = m._t || {}; if (m._t[d]) return m._t[d];
  return (m._t[d] = m.touches.map(tc => ({ ...tc, side: tc.foot ? (d < 0 ? sw(tc.foot) : tc.foot) : null })));
}
// ball centre (G) along a touch's authored path
function touchBall(m, d, tc, t, out) {
  if (tc.mc) { mcAnkle(m, d, tc.side, t, out); mcFootOri(m, d, tc.side, t, _mo); out.add(surfOff(tc.side, tc.surf, _mv).applyQuaternion(_mo)); out.y = BR; return out; }
  const k = tc.ball; let i = 0; while (i < k.length - 1 && t > k[i + 1][0]) i++;
  const p0 = k[i], p1 = k[Math.min(i + 1, k.length - 1)], u = p1[0] > p0[0] ? Math.min(1, Math.max(0, (t - p0[0]) / (p1[0] - p0[0]))) : 0;
  const y0 = p0.length > 3 ? p0[2] : BR, z0 = p0.length > 3 ? p0[3] : p0[2], y1 = p1.length > 3 ? p1[2] : BR, z1 = p1.length > 3 ? p1[3] : p1[2];
  out.set(d * (p0[1] + (p1[1] - p0[1]) * u), y0 + (y1 - y0) * u, z0 + (z1 - z0) * u);
  if (tc.frame !== 'G') b2g(bodyAt(m, d, t), out);
  return out;
}
function contactAnkle(m, d, tc, t, out) { // G frame
  touchBall(m, d, tc, t, out); footOri(m, d, tc.side, t, _q3);
  return out.sub(surfOff(tc.side, tc.surf, _c).applyQuaternion(_q3));
}
// per-foot key list in the B frame: authored keys + anchors at the touch boundaries (with velocities), cached
function footKeys(m, d, side) {
  m._fk = m._fk || {}; const key = d + side; if (m._fk[key]) return m._fk[key];
  const f = m.feet[d < 0 ? sw(side) : side] || {}, tcs = touchesOf(m, d).filter(tc => tc.side === side && tc.t1 > tc.t0);
  const keys = (f.p || [[0, side === 'l' ? -0.12 : 0.12, A, 0]]).filter(k => !tcs.some(tc => k[0] > tc.t0 - 0.02 && k[0] < tc.t1 + 0.02))
    .map(k => ({ t: k[0], p: new THREE.Vector3(d * k[1], k[2], k[3]), v: null }));
  const anc = (t, dir) => { const e = 0.004, p = g2b(bodyAt(m, d, t), contactAnkle(m, d, tcs.cur, t, new THREE.Vector3()));
    const q = g2b(bodyAt(m, d, t + dir * e), contactAnkle(m, d, tcs.cur, t + dir * e, new THREE.Vector3())); return { t, p, v: q.sub(p).multiplyScalar(dir / e) }; };
  for (const tc of tcs) { tcs.cur = tc; keys.push(anc(tc.t0, 1), anc(tc.t1, -1)); }
  keys.sort((a, b) => a.t - b.t);
  for (let i = 0; i < keys.length; i++) if (!keys[i].v) {
    const a = keys[i - 1], b = keys[i + 1];
    keys[i].v = a && b ? b.p.clone().sub(a.p).divideScalar(b.t - a.t).multiplyScalar(0.8) : new THREE.Vector3();
  }
  return (m._fk[key] = keys);
}
function hermite(p0, v0, p1, v1, t0, t1, t, out) {
  const h = t1 - t0 || 1e-3, u = Math.min(1, Math.max(0, (t - t0) / h)), u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return out.set(0, 0, 0).addScaledVector(p0, h00).addScaledVector(v0, h10 * h).addScaledVector(p1, h01).addScaledVector(v1, h11 * h);
}
function footTargetG(m, d, side, t, out) {
  const tc = touchesOf(m, d).find(tc => tc.side === side && t >= tc.t0 && t <= tc.t1);
  if (tc) return { tc, p: contactAnkle(m, d, tc, t, out) };
  if (m.mc) return { tc: null, p: mcAnkle(m, d, side, t, out) };
  const ks = footKeys(m, d, side); let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++;
  if (t <= ks[0].t) out.copy(ks[0].p); else if (t >= ks[ks.length - 1].t) out.copy(ks[ks.length - 1].p);
  else hermite(ks[i].p, ks[i].v, ks[i + 1].p, ks[i + 1].v, ks[i].t, ks[i + 1].t, t, out);
  out.y = Math.max(out.y, A - 0.01);
  return { tc: null, p: b2g(bodyAt(m, d, t), out) };
}
// ball centre (G) at time t when NOT in contact: rolls (Hermite between touches, friction after), or flies (rainbow)
function freeBall(sk, t, out) {
  const m = sk.m, d = sk.d, tcs = touchesOf(m, d);
  let prev = null, next = null; for (const tc of tcs) { if (tc.t1 <= t) prev = tc; else if (!next && tc.t0 > t) next = tc; }
  const e = 0.004;
  const P0 = prev ? touchBall(m, d, prev, prev.t1, _a) : _a.copy(sk.bp0), tp = prev ? prev.t1 : 0;
  const V0 = prev ? (prev.foot ? touchBall(m, d, prev, prev.t1, _b).sub(touchBall(m, d, prev, prev.t1 - e, _d)).divideScalar(e) : _b.copy(prev._vland || _b.set(0, 0, 0))) : _b.copy(sk.bv0);
  if (next) {
    const P1 = touchBall(m, d, next, next.t0, _c), tn = next.t0;
    if (next.air) { // ballistic arc to the landing point, bowed out to the exit side
      const u = (t - tp) / (tn - tp);
      out.lerpVectors(P0, P1, u); out.y += 4 * next.air * u * (1 - u) + (P1.y - P0.y) * 0; out.x += d * (next.bulge || 0) * Math.sin(Math.PI * u);
      next._vland = P1.clone().sub(P0).divideScalar(tn - tp).setY(0).multiplyScalar(0.5);
      return out;
    }
    const V1 = next.foot ? touchBall(m, d, next, next.t0 + e, _w1).sub(touchBall(m, d, next, next.t0, _w2)).divideScalar(e) : _w1.set(0, 0, 0);
    hermite(P0, V0, P1, V1, tp, tn, t, out); out.y = Math.max(BR, out.y < BR + 0.02 ? BR : out.y); return out;
  }
  // after the last touch: rolls on with friction (the post-move spring then brings it back to the dribble spot)
  const k = 4.5, tau = t - tp, f = (1 - Math.exp(-k * tau)) / k;
  out.copy(P0).addScaledVector(V0.setY(0), f); out.y = BR; return out;
}
function moveW(sk) { const t = Math.min(1, sk.t) * sk.m.T, T = sk.m.T; const ro = sk.m.id === 'rollover'; let w = Math.min(1, t / (ro ? 0.02 : 0.06), (T - t) / (ro ? 0.07 : 0.1)); if (sk.fade > 0) w = Math.min(w, sk.fade); return Math.max(0, w); }
function wrapPI(a) { return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI; }
function beginMove() { SK.bp0 = BS.p.clone(); SK.bv0 = BS.v.clone(); }
function aimBone(bone, from, to) {
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  _q1.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_q2); _q1.multiply(_q2);
  bone.parent.getWorldQuaternion(_q2); bone.quaternion.copy(_q2.invert().multiply(_q1));
  bone.updateMatrixWorld(true);
}
const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _F = new THREE.Vector3(), _T = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3();
function ikLeg(side, target, footQ, hint) {
  const b = hero.bones, th = b['thigh_' + side], ca = b['calf_' + side], fo = b['foot_' + side];
  th.getWorldPosition(_H); ca.getWorldPosition(_K); fo.getWorldPosition(_F);
  const l1 = _H.distanceTo(_K), l2 = _K.distanceTo(_F);
  _u.subVectors(target, _H); let dd = _u.length(); _u.divideScalar(dd || 1); dd = Math.min(Math.max(dd, Math.abs(l1 - l2) + 0.02), l1 + l2 - 0.003);
  _n.copy(hint).addScaledVector(_u, -hint.dot(_u)); if (_n.lengthSq() < 1e-6) _n.set(0, 0, -1); _n.normalize();
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const Kt = _a.copy(_H).addScaledVector(_u, a).addScaledVector(_n, h), Tc = _T.copy(_H).addScaledVector(_u, dd);
  aimBone(th, _b.subVectors(_K, _H), _c.subVectors(Kt, _H));
  // twist the thigh about its axis so the knee hinge bends toward the pole (no sideways knee)
  ca.getWorldPosition(_K); fo.getWorldPosition(_F); const ax = _d.subVectors(_K, _H).normalize();
  const a1 = _b.subVectors(_F, _K), a2 = _c.subVectors(Tc, _K); a1.addScaledVector(ax, -a1.dot(ax)); a2.addScaledVector(ax, -a2.dot(ax));
  if (a1.lengthSq() > 4e-4 && a2.lengthSq() > 4e-4) {
    a1.normalize(); a2.normalize(); const ang = Math.atan2(_w1.crossVectors(a1, a2).dot(ax), a1.dot(a2));
    _q1.setFromAxisAngle(ax, ang); th.getWorldQuaternion(_q2); _q1.multiply(_q2); th.parent.getWorldQuaternion(_q2); th.quaternion.copy(_q2.invert().multiply(_q1)); th.updateMatrixWorld(true);
  }
  ca.getWorldPosition(_K); fo.getWorldPosition(_F);
  aimBone(ca, _b.subVectors(_F, _K), _c.subVectors(Tc, _K));
  ca.getWorldQuaternion(_q2); fo.quaternion.copy(_q2.invert().multiply(footQ)); fo.updateMatrixWorld(true);
}
const _gq = new THREE.Quaternion(), _tw = { l: new THREE.Vector3(), r: new THREE.Vector3() }, _tq = { l: new THREE.Quaternion(), r: new THREE.Quaternion() }, _hint = { l: new THREE.Vector3(), r: new THREE.Vector3() };
const _jp = new THREE.Vector3(), _jq = new THREE.Quaternion(), _mp = new THREE.Vector3(), _mq = new THREE.Quaternion(), _bw = new THREE.Vector3(), _np = new THREE.Vector3();
// called after the mixer update each frame: the current move (+ an interrupted one fading out), feet IK, ball
// MOCAP roll-over: Rollover_L / Rollover_R clips (MediaPipe monocular capture -> Blender retarget, see mocap/README) drive
// pelvis, spine, head and arms; feet stay on the IK + ball-pin solver. ?roll=code (or __rollMocap=false) = code-keyframed fallback.
window.__rollMocap = !/[?&]roll=code/.test(location.search);
const MC_CLIPS = ['Rollover', 'Chop', 'Stepover', 'Roulette', 'Elastico', 'Croqueta', 'Heel', 'Rainbow'];
const mocapOn = (clip = 'Rollover') => window.__rollMocap && hero && hero.actions && hero.actions[clip + '_L'] && hero.actions[clip + '_R'];
function driveMocap() {
  if (!hero || !hero.actions || !hero.actions.Rollover_L) return;
  const m = SK.m, on = S.state === 'play' && m && m.mc && mocapOn(m.clip);
  let w = 0;
  for (const c of MC_CLIPS) for (const k of [c + '_L', c + '_R']) {
    const a = hero.actions[k]; if (!a) continue; const mine = on && c === m.clip && (k.endsWith('_L')) === (SK.d < 0);
    if (mine) { const T = m.T, t = Math.min(1, SK.t) * T; w = Math.max(0, Math.min(1, t / 0.04, (T - t) / 0.07, SK.fade > 0 ? SK.fade : 1));
      if (!a.isRunning()) { a.reset(); a.play(); } a.timeScale = 0; a.time = mcIdx(m, t) / (m.F.L.length - 1) * a.getClip().duration; a.setEffectiveWeight(w); }
    else if (a.isRunning()) a.stop();
  }
  if (hero.current) hero.current.setEffectiveWeight(1 - w);
}
// ball on grass: rolling resistance + aerodynamic drag, decelerating the WORLD velocity (lateral wx, forward = run speed - vz)
// a = ROLL.a0 + ROLL.cd * v^2  (a0 = 0.8 m/s^2 ~ mu_r 0.08 on short grass; cd = rho*Cd*A/(2m) = 1.2*0.25*0.038/(2*0.43) = 0.0133 /m)
const ROLL = { a0: 0.8, cd: 0.0133, rf: 0.045, e: 0.35, ahead: 0.25, gatherT: 0.15, leadX: 0.1, gGap: 0.09 };
// flight (rainbow): gravity, quadratic air drag (same cd), Magnus from the flick's topspin (kM = rho*A*r*Cl/(m*w*r) ~ 0.0025 s), grass bounce
const AIR = { g: 9.81, kM: 0.0025, e: 0.35, fr: 0.12, settle: 0.7, peak: 2.05, zLand: -1.55, spin: -18 };
// one airborne / bouncing step of the ball (G frame of the runner, which moves forward at S.speed and sideways by lat)
function airStep(st, dt, speed) {
  const uf = speed - st.vz, v = Math.hypot(st.wx, uf, st.vy), c = ROLL.cd * v;
  const ax = -c * st.wx, af = -c * uf + AIR.kM * st.w * st.vy * -1, ay = -AIR.g - c * st.vy + AIR.kM * st.w * uf;
  st.wx += ax * dt; const nuf = uf + af * dt; st.vy += ay * dt; st.vz = speed - nuf; st.w *= Math.exp(-0.3 * dt);
  st.x += st.wx * dt; st.z += (speed - nuf) * dt; st.y += st.vy * dt;
  if (st.y <= BR && st.vy < 0) { // grass bounce: restitution e, tangential friction impulse toward rolling, topspin kicks it on
    st.y = BR; st.vy = -AIR.e * st.vy; const u2 = speed - st.vz, slip = u2 + st.w * BR, ju = Math.min(Math.abs(slip), AIR.fr * (1 + AIR.e) * Math.abs(st.vy / AIR.e)) * Math.sign(slip);
    const nu = u2 - ju; st.vz = speed - nu; st.wx *= 0.9; st.w = -nu / BR; st.bounces = (st.bounces || 0) + 1;
    if (st.vy < AIR.settle) { st.vy = 0; st.air = false; }
  }
  return st;
}
// rolling step of the same model (used by the flight solver to time the gather after the landing)
function rollStepSim(st, dt, speed) {
  const u = speed - st.vz, sp = Math.hypot(st.wx, u); if (sp < 1e-4) { st.z += speed * dt; return st; }
  const a = ballDecel(sp), k = Math.max(0, sp - a * dt) / sp, dist = (sp + sp * k) / 2 * dt;
  st.x += st.wx / sp * dist; st.z += -u / sp * dist + speed * dt; st.wx *= k; st.vz = speed - u * k; return st;
}
// rainbow launch: solve the flick velocity so the ball peaks ~AIR.peak m and lands at AIR.zLand ahead in the new lane (world dx);
// returns the launch state plus the landing time and the time the rolling ball comes back to the dribble spot (gather)
function solveFlick(p, dx, speed) {
  const vy = Math.sqrt(2 * AIR.g * Math.max(0.5, AIR.peak - p.y));
  let wx = dx, vz = -2, r = null;
  const sim = () => { const st = { x: p.x, y: p.y, z: p.z, wx, vz, vy, w: AIR.spin, air: true }; let t = 0, tl, zl;
    while (st.air && t < 3) { airStep(st, SUB, speed); t += SUB; if (st.bounces && tl === undefined) { tl = t; zl = st.z; } }
    if (tl === undefined) { tl = t; zl = st.z; } const tSettle = t;
    while (st.z < B0[2] && t < 4) { rollStepSim(st, SUB, speed); t += SUB; }
    return { tl, zl, tSettle, tGather: t, xg: st.x }; };
  for (let it = 0; it < 10; it++) { // lands AIR.zLand ahead; reaches the new lane's centre (+lead) by the time it is back at the feet
    r = sim(); const ex = dx - (r.xg - p.x), ez = AIR.zLand - r.zl; wx += ex / r.tGather; vz += ez / r.tl;
    if (Math.abs(ex) < 0.005 && Math.abs(ez) < 0.005) break; }
  return { wx, vz, vy, w: AIR.spin, tLand: r.tl, tSettle: r.tSettle, tGather: r.tGather };
}
const _fp = { l: [new THREE.Vector3(), new THREE.Vector3()], r: [new THREE.Vector3(), new THREE.Vector3()] }, _fpv = { l: null, r: null }, _fpt = { l: null, r: null };
const _gp = new THREE.Vector3();
// ball position (G frame of the body at that time) tau seconds ahead, from the rolling model
function predictBall(tau, out) {
  const a = ballDecel(Math.hypot(BS.wx || 0, S.speed - (BS.vz || 0))), u = S.speed - (BS.vz || 0), sp = Math.hypot(BS.wx || 0, u) || 1;
  const k = Math.max(0, 1 - a * tau / sp * 0.5); // mean speed factor over tau
  let px = P.x; if (SK.m && SK.m.lane && SK.fade === 0) { const T = SK.m.T, t = Math.min(T, Math.min(1, SK.t) * T + tau * (SK.rate || 1)); px = P.fromX + (P.toX - P.fromX) * laneProg(SK, t); }
  out.set(P.x + BS.p.x + (BS.wx || 0) * k * tau - px, BR, BS.p.z + (BS.vz || 0) * tau + 0.5 * a * (BS.wx ? 1 : 1) * tau * tau * (u / sp));
  return out;
}
function ballDecel(v) { return ROLL.a0 + ROLL.cd * v * v; }
// fixed-rate substeps (240 Hz): the foot capsules are interpolated between the previous and current frame pose, so contacts,
// impulses, the gather and the safety net see the same sampling at any frame rate / slow-mo stepping
const SUB = 1 / 240, _fc = { l: [new THREE.Vector3(), new THREE.Vector3()], r: [new THREE.Vector3(), new THREE.Vector3()] }, _fcp = { l: null, r: null };
function ballRoll(dt, lat) {
  const b = hero.bones;
  for (const s of SIDES) { const fo = b['foot_' + s], to = b['ball_' + s]; if (!fo || !to) continue;
    const pa = fo.getWorldPosition(_fc[s][0]), pt = to.getWorldPosition(_fc[s][1]); hero.group.worldToLocal(pa); hero.group.worldToLocal(pt); pt.addScaledVector(_a.subVectors(pt, pa), 0.5);
    // previous-frame capsule expressed in the current body frame (the body moved forward dz and sideways lat in between)
    if (!_fcp[s]) _fcp[s] = [pa.clone(), pt.clone()]; }
  const n = Math.max(1, Math.min(64, Math.ceil(dt / SUB - 1e-6))), h = dt / n, t0 = S.t - dt;
  for (let i = 1; i <= n; i++) { BS.subA = i / n; ballStep(h, lat / n, t0 + i * h); }
  for (const s of SIDES) if (_fcp[s]) { _fcp[s][0].copy(_fc[s][0]); _fcp[s][1].copy(_fc[s][1]); }
}
function capsuleAt(s, out0, out1) { const a = BS.subA; out0.lerpVectors(_fcp[s][0], _fc[s][0], a); out1.lerpVectors(_fcp[s][1], _fc[s][1], a); }
function ballStep(dt, lat, now) {
  if (BS.air) { // flight / bounce (rainbow): no foot contact, no gather until it is back on the grass
    const st = { x: BS.p.x, y: BS.p.y, z: BS.p.z, wx: BS.wx, vz: BS.vz, vy: BS.vy, w: BS.w, air: true, bounces: 0 };
    airStep(st, dt, S.speed); BS.p.set(st.x - lat, st.y, st.z); BS.wx = st.wx; BS.vz = st.vz; BS.vy = st.vy; BS.w = st.w; BS.air = st.air;
    if (st.bounces) { BS.bounces = (BS.bounces || 0) + 1; if (BS.bounces === 1) { BS.tLand = now; if (BS.rel) BS.rel.land = { t: +(now - BS.rel.t).toFixed(3), x: +((P.x + BS.p.x) - BS.tgtX).toFixed(3), tl: +BS.flight.tLand.toFixed(3), tg: +BS.flight.tGather.toFixed(3), z: +BS.p.z.toFixed(2) }; } }
    if (!BS.air) BS.p.y = BR; return; }
  // exact integration of dv/dt = -(a0 + cd v^2) along the ground velocity (frame-rate independent)
  let wx = BS.wx || 0, u = S.speed - (BS.vz || 0); const sp = Math.hypot(wx, u); let dist = 0;
  if (sp > 1e-4) {
    const a0 = ROLL.a0, cd = ROLL.cd, c = Math.sqrt(a0 * cd), r = Math.sqrt(cd / a0), th0 = Math.atan(sp * r), tStop = th0 / c, te = Math.min(dt, tStop);
    const th = th0 - c * te, v = th > 0 ? Math.tan(th) / r : 0; dist = Math.log(Math.cos(th) / Math.cos(th0)) / cd;
    const k = v / sp; BS.p.x += wx / sp * dist; BS.p.z -= u / sp * dist; wx *= k; u *= k;
  }
  BS.wx = wx; BS.vz = S.speed - u;
  BS.p.x -= lat; BS.p.z += S.speed * dt; BS.p.y = BR;
  footCollide(dt, lat / dt);
  const G = BS.gather;
  if (G && !G.done && now >= G.t - 0.06) { // the gather touch: the ball has to actually reach the waiting foot (contact within a window)
    const s = G.side, pa = _a, pt = _b; capsuleAt(s, pa, pt);
    const ab = _c.subVectors(pt, pa), u = Math.max(0, Math.min(1, _d.subVectors(BS.p, pa).dot(ab) / ab.lengthSq())), q = _d.copy(pa).addScaledVector(ab, u);
    const gap = q.distanceTo(BS.p) - BR - ROLL.rf; BS.gstat = BS.gstat || { hit: 0, miss: 0, gaps: [] };
    G.best = Math.min(G.best === undefined ? 9 : G.best, gap);
    if (gap > ROLL.gGap && now < G.t + 0.08) {} // not there yet
    else if ((G.done = true) && gap <= ROLL.gGap) {
      const a = ballDecel(S.speed), nz = -Math.min(3.5, Math.sqrt(2 * a * ROLL.ahead)), tr = 2 * -nz / a, nx = Math.max(-2, Math.min(2, -BS.p.x / tr));
      BS.wx = nx + (SK.m ? lat / dt : 0); BS.vz = nz; BS.gstat.hit++; // after the move the body no longer moves sideways G.tHit = now; BS.gstat.gaps.push(+gap.toFixed(3));
      if (BS.rel && !BS.rel.lead) BS.rel.lead = { side: s, dt: +(S.t - BS.rel.t).toFixed(3), x: +(BS.p.x * BS.rel.d).toFixed(3), gap: +gap.toFixed(3) };
    } else { BS.gstat.miss++; BS.gstat.gaps.push(+G.best.toFixed(3)); }
  }
  // safety net only (counted): ball lost behind / far away from the runner
  if (!SK.m && !(BS.gather && !BS.gather.done && BS.gather.flight) && (BS.p.z > 0.1 || Math.abs(BS.p.x) > 0.9 || BS.p.z < -1.6)) { BS.assist = (BS.assist || 0) + dt; // steer back (critically damped), no snap
    const wn = 6; BS.wx += ((0 - BS.p.x) * wn * wn - (BS.wx - (BS.latv || 0)) * 2 * wn) * dt; BS.vz += ((B0[2] - BS.p.z) * wn * wn - BS.vz * 2 * wn) * dt; }
}
// feet as capsules (ankle -> toe tip, radius rf): no interpenetration; a forward-swinging foot in the jog = a dribble touch
function footCollide(dt, latv) {
  const b = hero.bones;
  for (const s of SIDES) {
    if (!_fcp[s]) continue; const pa = _fp[s][0], pt = _fp[s][1]; capsuleAt(s, pa, pt);
    // between a mocap move's release and its gather the ball runs between the legs: only the gathering foot may touch it
    if (BS.gather && !BS.gather.done && (SK.m && aimedMove(SK.m) || s !== BS.gather.side)) { _fpv[s] = null; continue; }
    const ab = _b.subVectors(pt, pa), u = Math.max(0, Math.min(1, _c.subVectors(BS.p, pa).dot(ab) / ab.lengthSq())), q = _d.copy(pa).addScaledVector(ab, u);
    const prev = _fpv[s], ptp = _fpt[s]; _fpv[s] = q.clone(); _fpt[s] = pt.clone(); if (!prev || !ptp || dt <= 0) continue;
    const regather = !SK.m && BS.vz > -0.3 && ptp.z > BS.p.z - BR && pt.z <= BS.p.z - BR && Math.abs(pt.x - BS.p.x) < BR + ROLL.rf + 0.12 && pt.y < 0.34;
    const n = _w1.subVectors(BS.p, q), d3 = n.length(), R = BR + ROLL.rf; if (d3 >= R && !regather) continue;
    n.y = 0; if (n.lengthSq() < 1e-8) n.set(0, 0, -1); n.normalize();
    if (d3 < R) BS.p.addScaledVector(n, R - d3); // push out
    const vf = _w2.subVectors(q, prev).divideScalar(dt), vrx = BS.wx - latv, vrz = BS.vz;
    const app = (vf.x - vrx) * n.x + (vf.z - vrz) * n.z;
    const dribble = !SK.m && BS.vz > -0.3 && vf.z < -0.2 && q.z > BS.p.z - 0.05; // forward-swinging foot behind/beside the ball
    if (app <= 0 && !dribble && !regather) continue;
    // a planting/stepping foot only nudges the ball (soft contact, approach capped at 1.2 m/s); kicks are the authored touches
    // soft contact, frame-rate independent: the ball's normal speed becomes the foot's (capped), it does not accumulate per frame
    const vbn = vrx * n.x + vrz * n.z, vfn = vf.x * n.x + vf.z * n.z, tgt = Math.max(vbn, Math.min(vfn, 0.3)), ap = Math.max(0, tgt - vbn);
    let nx = vrx + n.x * ap, nz = vrz + n.z * ap;
    if (dribble || regather) { // dribble touch: push it ~ROLL.ahead m ahead (it rolls back to the foot under grass friction), steer to centre
      const a = ballDecel(S.speed); nz = -Math.min(3.5, Math.sqrt(2 * a * ROLL.ahead)); const tr = 2 * -nz / a; nx = Math.max(-2, Math.min(2, -BS.p.x / tr));
      BS.touches = (BS.touches || 0) + 1; if (regather) BS.gap = Math.max(BS.gap || 0, Math.abs(pt.x - BS.p.x) - BR); BS.reach = false;
      if (BS.rel && !BS.rel.lead) BS.rel.lead = { side: s, dt: +(S.t - BS.rel.t).toFixed(3), x: +(BS.p.x * BS.rel.d).toFixed(3), ahead: +(q.z - BS.p.z).toFixed(3) };
    }
    BS.wx = nx + latv; BS.vz = nz; BS.hits = (BS.hits || 0) + 1;
  }
}
function applySkillPose(dt) {
  const fb = footBall; if (!hero || !fb || !hero.bones.foot_l) return;
  if (!FOOT_REL.l) calibrateFeet();
  if (SK.prev) { SK.prev.fade -= dt / 0.1; if (SK.prev.fade <= 0) SK.prev = null; }
  const list = []; if (SK.prev) list.push(SK.prev); if (SK.m) list.push(SK);
  let spin = 0, ht = 0, px = 0, pz = 0;
  for (const sk of list) {
    const m = sk.m, t = Math.min(1, sk.t) * m.T, w = moveW(sk), bd = bodyAt(m, sk.d, t);
    let sp = bd.spin; if (sk.fade > 0) sp = wrapPI(sp) * sk.fade;
    spin += sp; ht += bd.drop * w; px += bd.px * w; pz += bd.pz * w;
  }
  hero.model.rotation.y = Math.PI + spin; hero.model.position.set(px, ht, pz);
  hero.group.updateMatrixWorld(true);
  hero.group.getWorldQuaternion(_gq);
  const b = hero.bones;
  if (list.length) {
    _fq.copy(_gq).multiply(_yq.setFromAxisAngle(_Y, spin));
    // upper-body layers (mirrored: for d=-1 the right-side channel drives the left side and y/z rotations negate)
    for (const n0 of ['pelvis', 'spine_02', 'neck_01', 'upperarm_l', 'upperarm_r']) {
      if (!b[n0]) continue; let rx = 0, ry = 0, rz = 0;
      for (const sk of list) {
        const d = sk.d, t = Math.min(1, sk.t) * sk.m.T, w = moveW(sk);
        let src = n0; if (d < 0) src = n0.endsWith('_l') ? n0.slice(0, -2) + '_r' : n0.endsWith('_r') ? n0.slice(0, -2) + '_l' : n0;
        if (sk.m.mc && !(sk.m.addArms && n0.startsWith('upperarm'))) continue; // mocap moves: captured upper body (+ optional arm widening)
        const ch = sk.m.bones && sk.m.bones[src]; if (!ch) continue;
        const sx = n0.startsWith('upperarm') ? 0.4 : -1; // spine/neck authored + = bend forward / look down (bone frame is the opposite); arms damped
        const ua = n0.startsWith('upperarm'), ub = ua ? 1 : n0 === 'neck_01' ? 0.25 : 0.3; // rig is very responsive: keep torso/neck subtle
        rx += kf(t, ch[0]) * w * (ua ? 1 : sx * ub); ry += d * kf(t, ch[1]) * w * ub; rz += d * kf(t, ch[2]) * w * (ua ? sx : ub);
      }
      if (n0.startsWith('upperarm')) { const lim = list.some(sk => sk.m.addArms) ? 0.7 : 0.38; rz = Math.max(-lim, Math.min(lim, rz)); const lx = lim > 0.5 ? 0.45 : 0.15; rx = Math.max(-lx, Math.min(lx, rx)); }
      if (rx || ry || rz) rotFrame(b[n0], rx, ry, rz);
    }
    hero.group.updateMatrixWorld(true);
    // legs: jog pose -> (interrupted move) -> current move, solved with 2-bone IK
    for (const s of SIDES) {
      b['foot_' + s].getWorldPosition(_tw[s]); b['foot_' + s].getWorldQuaternion(_tq[s]);
      _hint[s].set(0, 0, -1).applyQuaternion(_gq).add(_a.set(0, 0.25, 0));
      for (const sk of list) {
        const w = moveW(sk); if (w <= 0) continue; const t = Math.min(1, sk.t) * sk.m.T;
        footTargetG(sk.m, sk.d, s, t, _mp);
        if (sk.m.mc && sk.fade === 0 && s !== mcRollSide(sk.m, sk.d) && !mcOwns(sk.m, sk.d, s)) { // plant lock: grounded support foot holds its lane position
          sk.lock = sk.lock || {}; const L = sk.lock[s];
          if (mcGrounded(sk.m, sk.d, s, t)) { if (!L) sk.lock[s] = { x: _mp.x, px: P.x, z: _mp.z }; else { const lx = L.x - (P.x - L.px), cx = Math.max(_mp.x - 0.22, Math.min(_mp.x + 0.22, lx)), wxp = P.x + cx; if (L.w !== undefined && sk === SK) BS.slide = (BS.slide || 0) + Math.abs(wxp - L.w); L.w = wxp; _mp.x = cx; _mp.z = L.z; } }
          else sk.lock[s] = null;
        }
        hero.group.localToWorld(_mp);
        footOri(sk.m, sk.d, s, t, _mq); _mq.premultiply(_gq).multiply(FOOT_REL[s]);
        _tw[s].lerp(_mp, w); _tq[s].slerp(_mq, w);
        footOri(sk.m, sk.d, s, t, _q3); _hint[s].lerp(_a.set(0, 0.2, -1).applyQuaternion(_q3).applyQuaternion(_gq), w);
      }
      ikLeg(s, _tw[s], _tq[s], _hint[s]);
    }
  }
  // re-gather: after a move the nearer foot reaches out (<=0.3 m) so its next forward swing meets the rolling ball
  // timed re-gather after a mocap move's release: the foot on the ball's side is steered (IK) to where the rolling ball WILL be
  // at G.t (physics prediction), and the touch happens there -> the ball arrives where the foot lands
  if (BS.gather && hero.bones.foot_l && dt > 0) {
    const G = BS.gather, now = S.t; if (now < G.t0) {} else { predictBall(Math.max(0, G.t - now), _gp);
    if (!G.side) G.side = _gp.x > 0 ? 'r' : 'l';
    const w = now < G.t ? ease(Math.min(1, (now - G.t0) / Math.max(0.01, G.t - G.t0))) : G.done ? Math.max(0, 1 - (now - (G.tHit || G.t)) / 0.12) : 1;
    if (G.done && now - (G.tHit || G.t) > 0.12) BS.gather = null;
    else if (w > 0) {
      const sg = G.side === 'r' ? 1 : -1, fo = b['foot_' + G.side];
      if (Math.abs(_gp.x) < 0.15) _gp.z += BR + 0.09; else _gp.x -= Math.sign(_gp.x) * (BR + 0.075);
      _gp.y = A; hero.group.localToWorld(_gp); fo.getWorldPosition(_mp); _mp.lerp(_gp, w); fo.getWorldQuaternion(_mq);
      _hint.r.set(0, 0.25, -1).applyQuaternion(_gq); ikLeg(G.side, _mp, _mq.clone(), _hint.r.clone());
    }
  } }
  if (!list.length && !BS.gather && (BS.reach || Math.abs(BS.p.x) > 0.1) && hero.bones.foot_l) {
    BS.reachW = Math.min(1, (BS.reachW || 0) + dt / 0.1);
    let best = null, bd = 9; for (const s of SIDES) { b['foot_' + s].getWorldPosition(_a); hero.group.worldToLocal(_a); const dd = Math.abs(_a.x - BS.p.x); if (dd < bd) { bd = dd; best = s; } }
    BS.reachSide = best; const fo = b['foot_' + best]; fo.getWorldPosition(_mp); hero.group.worldToLocal(_mp);
    const px = BS.p.x + ((BS.wx || 0) - (BS.latv || 0)) * 0.06, want = px - Math.sign(px) * (BR + ROLL.rf + 0.03), off = Math.max(-0.4, Math.min(0.4, want - _mp.x)) * ease(BS.reachW);
    if (Math.abs(off) > 0.005) { _mp.x += off; hero.group.localToWorld(_mp); fo.getWorldQuaternion(_mq); _hint.l.set(0, 0.25, -1).applyQuaternion(_gq); ikLeg(best, _mp, _mq.clone(), _hint.l.clone()); }
  } else BS.reachW = 0;
  // ---- ball: authored contact (pinned to the real sole) + rolling physics everywhere else ----
  const dz = S.speed * dt, lat = dt > 0 ? P.x - BS.lastX : 0; if (dt > 0) BS.lastX = P.x; // (dt=0 frames: carry the lane shift to the next real step)
  const old = _np.copy(BS.p);
  let pinned = null, phys = true;
  if (SK.m && SK.fade === 0) {
    const t = Math.min(1, SK.t) * SK.m.T, tcs = touchesOf(SK.m, SK.d), tc = tcs.find(tc => tc.side && t >= tc.t0 && t <= tc.t1);
    const last = tcs.reduce((a, c) => Math.max(a, c.t1), 0);
    if (tc) {
      // contact: pin the ball to the ACTUAL foot surface after IK (exact contact even if IK clamps or blends)
      const fo = b['foot_' + tc.side]; fo.getWorldPosition(_bw); fo.getWorldQuaternion(_q1); _q1.multiply(_q2.copy(FOOT_REL[tc.side]).invert());
      _bw.add(surfOff(tc.side, tc.surf, _c).applyQuaternion(_q1)); hero.group.worldToLocal(_bw); _bw.y = Math.max(BR, _bw.y);
      BS.p.copy(_bw); pinned = tc; phys = false;
    } else if (t < last || !aimedMove(SK.m)) { freeBall(SK, t, BS.p); phys = false; } // only the airborne rainbow keeps its authored flight
  }
  if (phys && dt > 0) {
    if (!BS.phys) { // release: take over the ball's actual velocity (sole velocity at release + the body's lane shift), world frame
      // a ball released from under a SOLE rolls with its centre at half the sole's ground speed (top of a rolling ball moves at 2v)
      const half = BS.pin === 'sole' ? 0.5 : 1;
      BS.wx = ((BS.vp ? (BS.v.x + BS.vp.x) / 2 : BS.v.x) + (BS.latv || 0)) * half; BS.vz = (BS.vp ? (BS.v.z + BS.vp.z) / 2 : BS.v.z) * half;
      // forward: the capture ran at ~3 m/s, the game at 13-30 m/s, so the sole's backward drag is clamped to keep the ball in front
      BS.vz = Math.max(-1.2, Math.min(0.2, BS.vz));
      // sideways: the capture's foot swing is far faster than the lane shift needs; the ball leaves at most ROLL.relX faster than the body
      if (SK.m && SK.m.flick) { // rainbow: the heel flick launches the ball over the head into the new lane (ballistic, solved)
        const d = Math.sign(P.toX - P.fromX) || 1, f = solveFlick(BS.p, P.toX + d * ROLL.leadX - P.x - BS.p.x, S.speed);
        BS.wx = f.wx; BS.vz = f.vz; BS.vy = f.vy; BS.w = f.w; BS.air = true; BS.bounces = 0; BS.gT = f.tGather; BS.flight = f; BS.tgtX = P.toX + d * ROLL.leadX;
      } else if (SK.m && aimedMove(SK.m)) { // the touch aims the ball into the new lane: it arrives just ahead of where the body finishes
        const lv = BS.latv || 0, d = Math.sign(P.toX - P.fromX) || 1, tNow = Math.min(1, SK.t) * SK.m.T; let tEnd = SK.m.T;
        if (SK.ev) for (let x = tNow; x <= SK.m.T; x += 0.005) if (laneProg(SK, x) >= 0.97) { tEnd = x; break; } // late dodge: the body arrives early
        const tRem = Math.max(0.12, (tEnd - tNow) / (SK.rate || 1) + 0.06);
        BS.gT = tRem; if (SK.m.fwdAim) BS.vz = Math.max(-1.6, Math.min(0.2, (B0[2] + 0.05 - BS.p.z) / tRem)); // back-heeled ball: roll it out in front for the gather
         const lo = SK.ev ? Math.max(3, Math.abs(lv)) : 3; BS.wx = lv + Math.max(-lo, Math.min(lo, (P.toX + d * ROLL.leadX - P.x - BS.p.x) / tRem - lv)); }
      if (SK.rel) { BS.rel = { t: S.t, x: +(BS.p.x * SK.rel).toFixed(3), wx: +(BS.wx * SK.rel).toFixed(2), vz: +BS.vz.toFixed(2), latv: +((BS.latv || 0) * SK.rel).toFixed(2), d: SK.rel }; SK.rel = 0; }
      BS.reach = true;
      if (SK.m && aimedMove(SK.m) || BS.rel && S.t - BS.rel.t < 0.01) BS.gather = { t0: S.t + (SK.m && SK.m.flick ? BS.flight.tSettle : 0), t: S.t + Math.max(ROLL.gatherT, BS.gT || 0), side: null, done: false, flight: !!(SK.m && SK.m.flick) };
    }
    ballRoll(dt, lat);
  }
  BS.phys = phys; BS.pin = pinned ? pinned.surf : phys ? BS.pin : null;
  if (SK.m && aimedMove(SK.m) && pinned) SK.rel = SK.d;
  if (dt > 0) { // ball velocity over a fixed 1/30 s time window (independent of frame rate / slow-mo stepping)
    const H = BS.hist || (BS.hist = []); H.push({ t: S.t, x: BS.p.x, z: BS.p.z, px: P.x }); while (H.length > 2 && H[1].t <= S.t - 1 / 30) H.shift();
    const tw = S.t - 1 / 30; BS.vp = null; let h = H[0];
    if (H.length > 2 && H[0].t < tw && H[1].t > tw) { const a = H[0], c = H[1], u = (tw - a.t) / (c.t - a.t); h = { t: tw, x: a.x + (c.x - a.x) * u, z: a.z + (c.z - a.z) * u, px: a.px + (c.px - a.px) * u }; }
    const ht = S.t - h.t;
    if (ht > 1e-4 && ht < 0.2) { BS.v.set((BS.p.x - h.x) / ht, 0, (BS.p.z - h.z) / ht); BS.latv = (P.x - h.px) / ht; } else { BS.v.subVectors(BS.p, old).divideScalar(dt); BS.latv = lat / dt; } }
  // skill moves (not the roll-over): v9 lead into the new lane after the last touch; folded into the ball when physics takes over
  let lead = 0;
  if (SK.m && !aimedMove(SK.m) && SK.fade === 0 && SK.m.lane && !pinned) {
    const t = Math.min(1, SK.t) * SK.m.T, hit = (SK.m.touches || []).find(tc => tc.hit);
    if (hit && t > hit.t1) { const r = Math.min(1, (t - hit.t1) / 0.06); lead = (laneAt(t + 0.12, SK.m.lane) - laneAt(t, SK.m.lane)) * (P.toX - P.fromX) * r * r * (3 - 2 * r); }
  }
  if (phys && BS.lead) { BS.p.x += BS.lead; old.x += BS.lead; }
  const dl = lead - (phys ? 0 : (BS.lead || 0)); BS.lead = lead;
  fb.position.copy(BS.p); fb.position.x += lead;
  // rolling without slipping: spin axis = up x ground travel (incl. run speed and lane shift), angle = distance / radius
  const tx = BS.p.x - old.x + lat + dl, tz = BS.p.z - old.z - dz, dist = Math.hypot(tx, tz);
  if (BS.p.y < BR + 0.03 && dist > 1e-5) { _a.set(tz, 0, -tx).normalize(); _q1.setFromAxisAngle(_a, dist / BR); fb.quaternion.premultiply(_q1); }
  else if (BS.p.y >= BR + 0.03) { _q1.setFromAxisAngle(_a.set(1, 0, 0), (BS.air ? BS.w : -12) * dt); fb.quaternion.premultiply(_q1); }
  SK.pinned = pinned ? pinned.side + ':' + pinned.surf : null;
}
// streak trail + dust puff
const trail = [];
function initFX() {
  for (let i = 0; i < 7; i++) { const g = new THREE.Mesh(new THREE.SphereGeometry(0.15 * (1 - i * 0.1), 10, 8), new THREE.MeshBasicMaterial({ color: i < 2 ? 0xfff2b0 : 0xff6a3d, transparent: true, opacity: 0, depthWrite: false })); g.visible = false; scene.add(g); trail.push({ m: g, p: new THREE.Vector3() }); }
  const pg = new THREE.RingGeometry(0.1, 0.35, 20); pg.rotateX(-Math.PI / 2);
  puffM = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xe8d9b5, transparent: true, opacity: 0, depthWrite: false })); scene.add(puffM);
}
let puffM = null, puffT = 1;
function puff() { if (!puffM || !footBall) return; footBall.getWorldPosition(puffM.position); puffM.position.y = 0.03; puffT = 0; }
const _bp = new THREE.Vector3();
function updateFX(dt, dz) {
  if (!footBall || !trail.length) return;
  footBall.getWorldPosition(_bp);
  const on = !!SK.m && SK.fade === 0 && SK.skill;
  for (let i = trail.length - 1; i > 0; i--) { trail[i].p.copy(trail[i - 1].p); trail[i].p.z += dz; }
  trail[0].p.copy(_bp);
  for (let i = 0; i < trail.length; i++) { const t = trail[i]; t.m.visible = on && i > 0; t.m.position.copy(t.p); t.m.material.opacity = on ? 0.55 * (1 - i / trail.length) : 0; }
  if (puffT < 1) { puffT += dt / 0.35; puffM.position.z += dz; puffM.scale.setScalar(1 + puffT * 2.5); puffM.material.opacity = 0.7 * (1 - puffT); } else puffM.material.opacity = 0;
}

// ---------- loop ----------
const clock = new THREE.Timer(); clock.connect?.(document);
const camPos = new THREE.Vector3(0, 3.0, 5.0), camLook = new THREE.Vector3(0, 1.2, -6);
let shake = 0;

function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w / h < 0.75 ? 72 : 62; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function updatePlay(dt, rdt = dt) {
  S.t += dt;
  S.speed = Math.min(MAX_SPEED, S.speed + ACCEL * dt * (S.speed < 20 ? 1.4 : 0.8));
  const dz = S.speed * dt; S.dist += dz; S.score += dz * (1 + S.speed / 30);
  // move clock first, so the body's lane position and the pose/ball solved this frame use the same move time
  if (SK.m) { if (SK.fade > 0) { SK.fade -= dt / 0.09; if (SK.fade <= 0) SK.m = null; } else { SK.t += dt * (SK.rate || 1) / SK.m.T; if (SK.t >= 1) { if (SK.m.lane) { P.x = P.toX; P.laneT = 1; } SK.m = null; } } }
  // lanes
  if (SK.m && SK.fade === 0 && SK.m.lane && P.laneT < 1) {
    // skill moves travel across THROUGH the move: lateral position follows the move's own lane curve
    const lp = laneProg(SK); P.x = P.fromX + (P.toX - P.fromX) * lp; P.laneT = Math.min(0.999, Math.max(0, lp));
  } else if (P.laneT < 1) {
    // lateral translation is decoupled from the visual move and runs on real time so controls stay snappy in slow-mo
    P.laneT = Math.min(1, P.laneT + rdt / LANE_TIME);
    P.x = P.fromX + (P.toX - P.fromX) * easeOut(P.laneT);
  }
  // vertical
  if (!P.grounded) { P.vy -= GRAV * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = 0; P.grounded = true; P.sinceGround = 0; if (P.buffer !== 'down') hero.play('Jog_Fwd_Loop', 0.12, 1.1 + S.speed / 40); } else if (P.vy < 2 && hero.currentName === 'Jump_Start') hero.play('Jump_Loop', 0.15, 1); }
  else P.sinceGround += dt;
  if (P.slideT > 0) { P.slideT -= dt; if (P.slideT <= 0) hero.play('Jog_Fwd_Loop', 0.15, 1.1 + S.speed / 40); }
  if (P.buffer) { if (!BS.air) P.bufferT -= rdt; if (P.bufferT <= 0) P.buffer = null; else tryBuffered(); }
  if (hero.currentName === 'Jog_Fwd_Loop') hero.current.timeScale = 1.1 + S.speed / 40;
  hero.group.position.set(P.x, P.y, 0);
  // lean into lane change
  const lean = SK.m && SK.m.id === 'rollover' && SK.fade === 0 ? -SK.d * 0.24 * Math.sin(Math.PI * Math.min(1, SK.t)) : P.laneT < 1 && !SK.m ? (P.toX - P.fromX) * -0.06 * (1 - P.laneT) : 0;
  hero.group.rotation.z += (lean - hero.group.rotation.z) * Math.min(1, dt * 20);

  // move world
  for (const c of chunks) { c.position.z += dz; if (c.position.z > CHUNK * 1.5) c.position.z -= CHUNK * chunks.length; }
  S.nextSpawn -= dz;
  if (S.nextSpawn <= 0) { spawnRow(-110); S.nextSpawn = Math.max(14, 30 - S.speed * 0.45) + Math.random() * 8; }

  // hitbox
  const sliding = P.slideT > 0, hb = { x: (SK.m && SK.fade === 0 && SK.m.lane) ? P.toX : P.x, w: 0.32, y0: P.y + 0.05, y1: P.y + (sliding ? 0.8 : 1.7), z0: -0.25, z1: 0.25 };
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i], u = o.userData;
    o.position.z += dz + (u.type === 'train' ? S.speed * 0.25 * dt : 0);
    if (u.type === 'rival') u.runner.update(dt);
    if (o.position.z > 12) { release(o); obstacles.splice(i, 1); continue; }
    const hw = u.type === 'train' ? 0.85 : u.type === 'rival' ? 0.3 : 0.8;
    if (Math.abs(o.position.x - hb.x) > hw + hb.w) continue;
    const d = u.d / 2; if (o.position.z + d < hb.z0 || o.position.z - d > hb.z1) continue;
    let ob0 = 0, ob1 = 0;
    if (u.type === 'barrier') { ob0 = 0; ob1 = u.h; } else if (u.type === 'bar') { ob0 = u.y0; ob1 = 2.0; } else if (u.type === 'train') { ob0 = 0; ob1 = 3; } else { ob0 = 0; ob1 = 1.75; }
    if (u.type === 'rival' && u.beaten && u.lane !== P.lane) continue;
    if (hb.y1 > ob0 && hb.y0 < ob1) { shake = 0.4; gameOver(); return; }
  }
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i]; b.position.z += dz; b.rotation.y += dt * 4;
    if (b.position.z > 10) { release(b); balls.splice(i, 1); continue; }
    if (Math.abs(b.position.x - P.x) < 0.8 && Math.abs(b.position.z) < 0.7 && Math.abs(b.position.y - (P.y + 0.8)) < 1.1) {
      S.ballsN++; S.score += 25; release(b); balls.splice(i, 1);
    }
  }
  $('hScore').textContent = Math.floor(S.score); $('hBalls').textContent = '⚽ ' + S.ballsN; $('hDist').textContent = Math.floor(S.dist) + ' m';
}

let titleT = 0;
function frame() {
  clock.update(); let rdt = Math.min(clock.getDelta(), 1 / 20) * (window.__timeScale || 1);
  if (window.__manual) { rdt = window.__stepDt || 0; window.__stepDt = 0; } // test hook: deterministic stepping
  if (S.state === 'play') updateSlowMo(rdt); else { SM.g = 1; SM.t = SM.delay = -1; }
  const dt = rdt * SM.g; // global game time scale (slow-mo)
  if (S.state === 'play') updatePlay(dt, rdt);
  if (S.state === 'over') { for (const o of obstacles) if (o.userData.type === 'rival') o.userData.runner.update(dt); }
  if (hero) { driveMocap(); hero.update(dt); if (S.state === 'play') applySkillPose(dt); }
  updateFX(dt, S.state === 'play' ? S.speed * dt : 0);
  if (SK.fov > 0.01) SK.fov *= Math.exp(-rdt * 9);
  const fov0 = innerWidth / innerHeight < 0.75 ? 72 : 62; if (Math.abs(camera.fov - fov0 - SK.fov) > 0.01) { camera.fov = fov0 + SK.fov; camera.updateProjectionMatrix(); }
  // L train cruises along the elevated track
  lTrain.position.z += dt * (S.state === 'play' ? S.speed + 12 : 10); if (lTrain.position.z > 60) lTrain.position.z = -260 - Math.random() * 120;

  if (S.state === 'title') {
    titleT += dt * 0.35;
    const close = window.__closeup, a = Math.sin(titleT) * 0.9, r = close ? 1.7 : 3.0;
    camera.position.set(Math.sin(a) * r, close ? 1.6 : 1.45, -Math.cos(a) * r);
    camera.lookAt(0, close ? 1.35 : 1.05, 0);
    faceL.position.copy(camera.position).add(new THREE.Vector3(0.5, 0.8, 0)); faceL.intensity = 1.4;
  } else if (hero) {
    const tx = P.x * 0.6, ty = 2.9 + P.y * 0.45;
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 7); camPos.y += (ty - camPos.y) * Math.min(1, dt * 5); camPos.z = 4.9;
    camera.position.copy(camPos);
    if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - .5) * shake * .5; camera.position.y += (Math.random() - .5) * shake * .5; }
    camLook.set(P.x * 0.8, 1.25 + P.y * 0.3, -7); camera.lookAt(camLook);
    if (window.__camLow) { camera.position.set(P.x + 1.1, 0.95, 3.1); camera.lookAt(P.x - 0.1, 0.62, -0.6); } // test/render hook only (game camera unchanged)
  }
  if (S.state !== 'title') faceL.intensity = 0;
  sunL.position.set(P.x - 6, 14, -6); sunL.target.position.set(P.x, 0, -4);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// expose for automated tests
window.__spawnObstacleAhead = (type = 'barrier', z = -6) => { const o = get(type); o.position.set(LANES[P.lane], 0, z); o.userData.lane = P.lane; o.userData.beaten = false; o.visible = true; obstacles.push(o); return o; };
window.__spawnRivalAhead = (z = -4) => { const o = get("rival"); o.position.set(LANES[P.lane], 0, z); o.userData.lane = P.lane; o.userData.beaten = false; o.visible = true; obstacles.push(o); return (window.__lastObs = o); };
window.__cam = camera;
window.__fireRush = { feetG: () => SIDES.map(s => { const v = hero.bones["ball_" + s].getWorldPosition(new THREE.Vector3()); hero.group.worldToLocal(v); return s + ":" + v.x.toFixed(2) + "," + v.y.toFixed(2) + "," + v.z.toFixed(2); }).join(" "), S, P, SK, SM, SLOW, MOVES, ROLLOVER, BS, SURF, FOOT_REL, act, get footBall() { return footBall; }, get hero() { return hero; }, THREE, startGame };

(async () => {
  await loadAssets();
  barFill.style.width = '100%';
  hero = new Runner(HERO_KIT, true);
  // hero faces the camera on the title screen for the showcase
  scene.add(hero.group);
  footBall = new THREE.Mesh(new THREE.SphereGeometry(BR, 18, 14), new THREE.MeshStandardMaterial({ map: ballTex, roughness: .4 })); footBall.castShadow = true; footBall.position.set(...B0); hero.group.add(footBall); initFX();
  hero.play('Idle_Loop', 0);
  $('tBest').textContent = S.best;
  if (loadError) { $('warn').textContent = loadError; show('warn', true); }
  show('loading', false); show('title', true); S.state = 'title';
  frame();
})();
