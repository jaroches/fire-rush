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
    const [hero, anims, hair] = await Promise.all([loadGLB('assets/hero.glb'), loadGLB('assets/anims.glb'), loadGLB('assets/hair.glb')]);
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
      this.bones = {}; model.traverse(o => { if (o.isBone) this.bones[o.name] = o; });
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
const P = { lane: 1, fromX: 0, toX: 0, laneT: 1, x: 0, y: 0, vy: 0, grounded: true, sinceGround: 0, slideT: 0, buffer: null, bufferT: 0 };
let hero;

function resetGame() {
  for (const o of obstacles) release(o); obstacles.length = 0;
  for (const b of balls) release(b); balls.length = 0;
  Object.assign(S, { speed: START_SPEED, dist: 0, score: 0, ballsN: 0, t: 0, nextSpawn: 26 });
  Object.assign(P, { lane: 1, fromX: 0, toX: 0, laneT: 1, x: 0, y: 0, vy: 0, grounded: true, sinceGround: 0, slideT: 0, buffer: null });
  hero.group.position.set(0, 0, 0); hero.group.rotation.set(0, 0, 0);
}

function spawnRow(z) {
  // choose a pattern guaranteeing at least one passable lane
  const r = Math.random(), lanes = [0, 1, 2].sort(() => Math.random() - .5);
  const types = S.dist < 150 ? ['barrier', 'bar', 'rival'] : ['barrier', 'bar', 'rival', 'train', 'train'];
  const n = S.dist < 100 ? 1 : (r < .55 ? 1 : 2);
  const used = [];
  for (let i = 0; i < n; i++) {
    const lane = lanes[i], type = types[(Math.random() * types.length) | 0];
    const o = get(type); o.position.set(LANES[lane], 0, z - (type === 'train' ? 6 : 0)); o.userData.lane = lane;
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
    if (nl !== P.lane) { P.lane = nl; P.fromX = P.x; P.toX = LANES[nl]; P.laneT = 0; }
    P.buffer = null;
  } else if (a === 'up') {
    if (P.grounded || P.sinceGround < COYOTE_T) {
      P.vy = JUMP_V; P.grounded = false; P.sinceGround = 1; P.slideT = 0; P.buffer = null;
      hero.play('Jump_Start', 0.06, 1.6);
    }
  } else if (a === 'down') {
    if (!P.grounded) { P.vy = Math.min(P.vy, -JUMP_V * 1.2); } // fast-fall, then slide when landing (stays buffered)
    else { P.slideT = SLIDE_T; P.buffer = null; hero.play('Roll', 0.06, 1.35); }
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

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function startGame() {
  if (S.state === 'loading') return;
  resetGame(); S.state = 'play'; show('title', false); show('over', false); show('hud', true);
  hero.play('Jog_Fwd_Loop', 0.2, 1.25);
}
function gameOver() {
  S.state = 'over'; hero.play('Death01', 0.08, 1.2);
  if (S.score > S.best) { S.best = Math.floor(S.score); localStorage.setItem('fireRushBest', S.best); }
  $('oScore').textContent = Math.floor(S.score); $('oBalls').textContent = S.ballsN; $('oDist').textContent = Math.floor(S.dist) + 'm';
  $('oBest').textContent = 'Best: ' + S.best; $('tBest').textContent = S.best;
  setTimeout(() => { if (S.state === 'over') { show('over', true); show('hud', false); } }, 900);
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

function updatePlay(dt) {
  S.t += dt;
  S.speed = Math.min(MAX_SPEED, S.speed + ACCEL * dt * (S.speed < 20 ? 1.4 : 0.8));
  const dz = S.speed * dt; S.dist += dz; S.score += dz * (1 + S.speed / 30);
  // lanes
  if (P.laneT < 1) { P.laneT = Math.min(1, P.laneT + dt / LANE_TIME); P.x = P.fromX + (P.toX - P.fromX) * easeOut(P.laneT); }
  // vertical
  if (!P.grounded) { P.vy -= GRAV * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = 0; P.grounded = true; P.sinceGround = 0; if (P.buffer !== 'down') hero.play('Jog_Fwd_Loop', 0.12, 1.1 + S.speed / 40); } else if (P.vy < 2 && hero.currentName === 'Jump_Start') hero.play('Jump_Loop', 0.15, 1); }
  else P.sinceGround += dt;
  if (P.slideT > 0) { P.slideT -= dt; if (P.slideT <= 0) hero.play('Jog_Fwd_Loop', 0.15, 1.1 + S.speed / 40); }
  if (P.buffer) { P.bufferT -= dt; if (P.bufferT <= 0) P.buffer = null; else tryBuffered(); }
  if (hero.currentName === 'Jog_Fwd_Loop') hero.current.timeScale = 1.1 + S.speed / 40;
  hero.group.position.set(P.x, P.y, 0);
  // lean into lane change
  const lean = P.laneT < 1 ? (P.toX - P.fromX) * -0.06 * (1 - P.laneT) : 0;
  hero.group.rotation.z += (lean - hero.group.rotation.z) * Math.min(1, dt * 20);

  // move world
  for (const c of chunks) { c.position.z += dz; if (c.position.z > CHUNK * 1.5) c.position.z -= CHUNK * chunks.length; }
  S.nextSpawn -= dz;
  if (S.nextSpawn <= 0) { spawnRow(-110); S.nextSpawn = Math.max(14, 30 - S.speed * 0.45) + Math.random() * 8; }

  // hitbox
  const sliding = P.slideT > 0, hb = { x: P.x, w: 0.32, y0: P.y + 0.05, y1: P.y + (sliding ? 0.8 : 1.7), z0: -0.25, z1: 0.25 };
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
  clock.update(); const dt = Math.min(clock.getDelta(), 1 / 20);
  if (S.state === 'play') updatePlay(dt);
  if (S.state === 'over') { for (const o of obstacles) if (o.userData.type === 'rival') o.userData.runner.update(dt); }
  if (hero) hero.update(dt);
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
window.__fireRush = { S, P, act, get hero() { return hero; }, THREE, startGame };

(async () => {
  await loadAssets();
  barFill.style.width = '100%';
  hero = new Runner(HERO_KIT, true);
  // hero faces the camera on the title screen for the showcase
  scene.add(hero.group);
  hero.play('Idle_Loop', 0);
  $('tBest').textContent = S.best;
  if (loadError) { $('warn').textContent = loadError; show('warn', true); }
  show('loading', false); show('title', true); S.state = 'title';
  frame();
})();
