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
    const [hero, anims, hair, roll] = await Promise.all([loadGLB('assets/hero.glb'), loadGLB('assets/anims.glb'), loadGLB('assets/hair.glb'), loadGLB('assets/rollover.glb?v=9').catch(e => { console.warn('mocap roll-over clip missing', e); return null; })]);
    if (roll) anims.animations.push(...roll.animations);
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
  hero.group.position.set(0, 0, 0); hero.group.rotation.set(0, 0, 0); BS.p.set(...B0); BS.v.set(0, 0, 0); BS.lastX = 0;
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
    if (nl !== P.lane) { const d = nl > P.lane ? 1 : -1; P.lane = nl; P.fromX = P.x; P.toX = LANES[nl]; P.laneT = 0; if (P.grounded && P.slideT <= 0) startLaneMove(d); else SK.m = null; }
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
  { id: 'rainbow', name: 'RAINBOW FLICK!', sub: 'NEYMAR', T: 1.1, beatT: 0.18,
    lane: [[0, 0], [0.22, 0.08], [0.7, 0.8], [1.0, 1]], // lateral progress old lane -> new lane (body), driven by the move timeline
    drop: [[0, 0], [0.1, -0.08], [0.22, -0.02], [0.4, 0], [1.1, 0]],
    touches: [{ foot: 'r', surf: 'sole', t0: 0.02, t1: 0.12, ball: [[0.02, 0.06, -0.34], [0.12, -0.04, 0.06]] },
              { foot: 'l', surf: 'heel', t0: 0.14, t1: 0.22, ball: [[0.14, -0.06, BR, 0.1], [0.22, -0.02, 0.55, 0.2]], hit: 1 },
              { foot: null, t0: 1.0, t1: 1.0, air: 1.95, bulge: 0.1, ball: [[1.0, 0.06, BR, -1.6]] }],
    feet: { r: { p: [[0, 0.12, A, 0], [0.0, 0.12, A, 0], [0.2, 0.14, A, -0.12], [0.42, 0.13, 0.2, -0.35], [0.56, 0.12, A, -0.28], [0.78, 0.12, 0.2, 0.05], [0.94, 0.12, A, -0.2], [1.1, 0.12, A, 0]], pitch: [[0, 0], [0.02, 0.25], [0.12, 0.15], [0.2, 0]] },
            l: { p: [[0, -0.12, A, 0.05], [0.1, -0.08, A, -0.06], [0.36, -0.12, 0.38, 0.26], [0.55, -0.12, A, -0.2], [0.74, -0.12, 0.2, 0.08], [0.92, -0.12, A, -0.2], [1.1, -0.12, A, 0]], pitch: [[0.1, 0], [0.14, -0.4], [0.22, -1.0], [0.36, -0.6], [0.55, 0]] } },
    bones: { spine_02: [[[0, 0], [0.18, 0.3], [0.45, 0.05], [1.1, 0]], 0, 0], neck_01: [[[0, 0], [0.15, 0.35], [0.45, -0.45], [0.8, 0.1], [1.1, 0]], 0, 0],
      upperarm_l: [[[0, 0], [0.2, 0.3], [0.6, 0], [1.1, 0]], 0, [[0, 0], [0.2, -0.9], [0.6, -0.5], [1.1, 0]]], upperarm_r: [[[0, 0], [0.2, 0.3], [0.6, 0], [1.1, 0]], 0, [[0, 0], [0.2, 0.9], [0.6, 0.5], [1.1, 0]]],
      lowerarm_r: [[[0, 0], [0.2, 0.6], [1.1, 0]], 0, 0], lowerarm_l: [[[0, 0], [0.2, 0.6], [1.1, 0]], 0, 0] } },
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
  const th = window.__forceMove ? { o: null, tti: 0.25 } : threatAhead(P.lane - d);
  if (th) startSkill(d, window.__forceMove, th); else startRoll(d);
}
function startRoll(d) {
  if (SK.m && SK.t < 0.95) SK.prev = { m: SK.m, d: SK.d, t: SK.t, fade: SK.fade > 0 ? SK.fade : 1 };
  beginMove(); SK.m = ROLLOVER; SK.rate = 1; SK.d = d; SK.t = 0; SK.fade = 0; SK.skill = false; SK.rolls = (SK.rolls || 0) + 1;
}
const SK = { prev: null, m: null, d: 1, t: 0, w: 0, fade: 0, last: -1, combo: 0, comboT: 0, fov: 0, count: {} };
function pickMove() { let i; do { i = (Math.random() * MOVES.length) | 0; } while (i === SK.last && MOVES.length > 1); SK.last = i; return MOVES[i]; }
function startSkill(d, forced, th) {
  const m = forced ? MOVES.find(x => x.id === forced) : pickMove();
  if (forced) SK.last = MOVES.indexOf(m);
  if (SK.m && SK.t < 0.95) SK.prev = { m: SK.m, d: SK.d, t: SK.t, fade: SK.fade > 0 ? SK.fade : 1 };
  beginMove(); SK.m = m; SK.d = d; SK.t = 0; SK.fade = 0; SK.skill = true; SK.rate = 1;
  if (m.lane && th && th.o) { let tm = m.T; for (let x = 0; x <= m.T; x += 0.01) if (laneAt(x, m.lane) >= 0.5) { tm = x; break; } SK.rate = Math.min(1.8, Math.max(1, tm / Math.max(0.1, th.tti))); } SK.fov = 3.5; shake = Math.max(shake, 0.08);
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
const mocapOn = () => window.__rollMocap && hero && hero.actions && hero.actions.Rollover_L && hero.actions.Rollover_R;
function driveMocap() {
  if (!hero || !hero.actions || !hero.actions.Rollover_L) return;
  const on = mocapOn() && S.state === 'play' && SK.m && SK.m.id === 'rollover';
  let w = 0;
  for (const k of ['Rollover_L', 'Rollover_R']) {
    const a = hero.actions[k], mine = on && (k === 'Rollover_L') === (SK.d < 0);
    if (mine) { const T = SK.m.T, t = Math.min(1, SK.t) * T; w = Math.max(0, Math.min(1, t / 0.04, (T - t) / 0.07, SK.fade > 0 ? SK.fade : 1));
      if (!a.isRunning()) { a.reset(); a.play(); } a.timeScale = 0; a.time = Math.min(1, SK.t) * a.getClip().duration; a.setEffectiveWeight(w); }
    else if (a.isRunning()) a.stop();
  }
  if (hero.current) hero.current.setEffectiveWeight(1 - w);
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
        if (sk.m.id === 'rollover' && mocapOn()) continue;
        const ch = sk.m.bones && sk.m.bones[src]; if (!ch) continue;
        const sx = n0.startsWith('upperarm') ? 0.4 : -1; // spine/neck authored + = bend forward / look down (bone frame is the opposite); arms damped
        const ua = n0.startsWith('upperarm'), ub = ua ? 1 : n0 === 'neck_01' ? 0.25 : 0.3; // rig is very responsive: keep torso/neck subtle
        rx += kf(t, ch[0]) * w * (ua ? 1 : sx * ub); ry += d * kf(t, ch[1]) * w * ub; rz += d * kf(t, ch[2]) * w * (ua ? sx : ub);
      }
      if (n0.startsWith('upperarm')) { rz = Math.max(-0.38, Math.min(0.38, rz)); rx = Math.max(-0.15, Math.min(0.15, rx)); }
      if (rx || ry || rz) rotFrame(b[n0], rx, ry, rz);
    }
    hero.group.updateMatrixWorld(true);
    // legs: jog pose -> (interrupted move) -> current move, solved with 2-bone IK
    for (const s of SIDES) {
      b['foot_' + s].getWorldPosition(_tw[s]); b['foot_' + s].getWorldQuaternion(_tq[s]);
      _hint[s].set(0, 0, -1).applyQuaternion(_gq).add(_a.set(0, 0.25, 0));
      for (const sk of list) {
        const w = moveW(sk); if (w <= 0) continue; const t = Math.min(1, sk.t) * sk.m.T;
        footTargetG(sk.m, sk.d, s, t, _mp); hero.group.localToWorld(_mp);
        footOri(sk.m, sk.d, s, t, _mq); _mq.premultiply(_gq).multiply(FOOT_REL[s]);
        _tw[s].lerp(_mp, w); _tq[s].slerp(_mq, w);
        footOri(sk.m, sk.d, s, t, _q3); _hint[s].lerp(_a.set(0, 0.2, -1).applyQuaternion(_q3).applyQuaternion(_gq), w);
      }
      ikLeg(s, _tw[s], _tq[s], _hint[s]);
    }
  }
  // ---- ball ----
  const dz = S.speed * dt, lat = P.x - BS.lastX; BS.lastX = P.x;
  const old = _np.copy(BS.p);
  let pinned = null;
  if (SK.m) {
    const t = Math.min(1, SK.t) * SK.m.T, tc = touchesOf(SK.m, SK.d).find(tc => tc.side && t >= tc.t0 && t <= tc.t1);
    if (tc && SK.fade === 0) {
      // contact: pin the ball to the ACTUAL foot surface after IK (exact contact even if IK clamps or blends)
      const fo = b['foot_' + tc.side]; fo.getWorldPosition(_bw); fo.getWorldQuaternion(_q1); _q1.multiply(_q2.copy(FOOT_REL[tc.side]).invert());
      _bw.add(surfOff(tc.side, tc.surf, _c).applyQuaternion(_q1)); hero.group.worldToLocal(_bw); _bw.y = Math.max(BR, _bw.y);
      BS.p.copy(_bw); pinned = tc;
    } else if (SK.fade === 0) freeBall(SK, t, BS.p);
    else BS.p.lerp(_a.set(B0[0], BR, B0[2]), Math.min(1, dt * 6));
  } else {
    // dribble: small pushes ahead in rhythm with the jog, critically damped spring toward the spot
    const tgt = _a.set(B0[0], BR, B0[2] - 0.04 * Math.max(0, Math.sin(S.t * 9.4)));
    const wn = 11, acc = _b.subVectors(tgt, BS.p).multiplyScalar(wn * wn).addScaledVector(BS.v, -2 * wn);
    BS.v.addScaledVector(acc, dt); BS.p.addScaledVector(BS.v, dt); if (BS.p.y < BR) BS.p.y = BR;
  }
  if (SK.m && dt > 0) BS.v.subVectors(BS.p, old).divideScalar(dt);
  let lead = 0;
  if (SK.m && SK.fade === 0 && SK.m.lane && !pinned) {
    const t = Math.min(1, SK.t) * SK.m.T, hit = (SK.m.touches || []).find(tc => tc.hit);
    if (hit && t > hit.t1) { const r = Math.min(1, (t - hit.t1) / 0.06); lead = (laneAt(t + 0.12, SK.m.lane) - laneAt(t, SK.m.lane)) * (P.toX - P.fromX) * r * r * (3 - 2 * r); }
  }
  const dl = lead - (BS.lead || 0); BS.lead = lead;
  fb.position.copy(BS.p); fb.position.x += lead;
  // rolling: ground contact => spin about (up x travel), travel includes the run speed and the lane shift
  const tx = BS.p.x - old.x + lat + dl, tz = BS.p.z - old.z - dz, dist = Math.hypot(tx, tz);
  if (BS.p.y < BR + 0.03 && dist > 1e-5) { _a.set(tz, 0, -tx).normalize(); _q1.setFromAxisAngle(_a, dist / BR); fb.quaternion.premultiply(_q1); }
  else if (BS.p.y >= BR + 0.03) { _q1.setFromAxisAngle(_a.set(1, 0, 0), dt * 12); fb.quaternion.premultiply(_q1); }
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
  // lanes
  if (SK.m && SK.fade === 0 && SK.m.lane && P.laneT < 1) {
    // skill moves travel across THROUGH the move: lateral position follows the move's own lane curve
    const lp = laneAt(Math.min(1, SK.t) * SK.m.T, SK.m.lane); P.x = P.fromX + (P.toX - P.fromX) * lp; P.laneT = Math.min(0.999, Math.max(0, lp));
  } else if (P.laneT < 1) {
    // lateral translation is decoupled from the visual move and runs on real time so controls stay snappy in slow-mo
    P.laneT = Math.min(1, P.laneT + rdt / LANE_TIME);
    P.x = P.fromX + (P.toX - P.fromX) * easeOut(P.laneT);
  }
  if (SK.m) { if (SK.fade > 0) { SK.fade -= dt / 0.09; if (SK.fade <= 0) SK.m = null; } else { SK.t += dt * (SK.rate || 1) / SK.m.T; if (SK.t >= 1) { if (SK.m.lane) { P.x = P.toX; P.laneT = 1; } SK.m = null; } } }
  // vertical
  if (!P.grounded) { P.vy -= GRAV * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = 0; P.grounded = true; P.sinceGround = 0; if (P.buffer !== 'down') hero.play('Jog_Fwd_Loop', 0.12, 1.1 + S.speed / 40); } else if (P.vy < 2 && hero.currentName === 'Jump_Start') hero.play('Jump_Loop', 0.15, 1); }
  else P.sinceGround += dt;
  if (P.slideT > 0) { P.slideT -= dt; if (P.slideT <= 0) hero.play('Jog_Fwd_Loop', 0.15, 1.1 + S.speed / 40); }
  if (P.buffer) { P.bufferT -= rdt; if (P.bufferT <= 0) P.buffer = null; else tryBuffered(); }
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
  }
  if (S.state !== 'title') faceL.intensity = 0;
  sunL.position.set(P.x - 6, 14, -6); sunL.target.position.set(P.x, 0, -4);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// expose for automated tests
window.__spawnObstacleAhead = (type = 'barrier', z = -6) => { const o = get(type); o.position.set(LANES[P.lane], 0, z); o.userData.lane = P.lane; o.userData.beaten = false; o.visible = true; obstacles.push(o); return o; };
window.__spawnRivalAhead = (z = -4) => { const o = get('rival'); o.position.set(LANES[P.lane], 0, z); o.userData.lane = P.lane; o.userData.beaten = false; o.visible = true; obstacles.push(o); };
window.__cam = camera;
window.__fireRush = { S, P, SK, SM, SLOW, MOVES, ROLLOVER, BS, SURF, FOOT_REL, act, get footBall() { return footBall; }, get hero() { return hero; }, THREE, startGame };

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
