/* ============================================================
   DFN Component Architecture — data-driven, dual-theme rebuild.
   Topology comes from architecture.json (edit that file to change
   the architecture). Visual theming lives entirely in THEMES below.
   ============================================================ */

const W = () => window.innerWidth, H = () => window.innerHeight;

/* ---------- Theme palettes ----------
   Each theme supplies global scene colors + a fill/edge/text triad
   per layer key. Layer keys must match architecture.json's "layers". */
const THEMES = {
  dark: {
    bg: 0x06070c, fog: 0x06070c, fogDensity: 0.0055,
    grid: 0x141a2c, ground: 0x06070c,
    ambient: { color: 0xffffff, intensity: 0.45 },
    sun: { color: 0x8fd9ff, intensity: 1.0 },
    fill: { color: 0xa070ff, intensity: 0.4 },
    wire: 0x3a4a66, labelColor: '#e7f6ff', labelSubColor: 'rgba(160,190,230,.7)',
    tierColor: '#00e5ff',
    glow: true, edgeOpacity: 0.95, planeOpacity: 0.07, planeEdgeOpacity: 0.3,
    layers: {
      trading:   { fill: 0x0a2b4a, edge: 0x00c3ff, text: '#7fe0ff' },
      datastore: { fill: 0x2a2e3d, edge: 0x9fb0d9, text: '#c7d2ee' },
      esb:       { fill: 0x0a3d2e, edge: 0x39ff88, text: '#8dffba' },
      gateway:   { fill: 0x0c2440, edge: 0x00e5ff, text: '#7fefff' },
      core:      { fill: 0x2a1a4d, edge: 0xb967ff, text: '#d9b3ff' },
      csm:       { fill: 0x4a2a06, edge: 0xff9f1c, text: '#ffcf8a' },
      settle:    { fill: 0x4a0f24, edge: 0xff4d6d, text: '#ff9bb0' },
    },
  },
  light: {
    bg: 0xf4ecdc, fog: 0xf4ecdc, fogDensity: 0.004,
    grid: 0xe4d3b6, ground: 0xf7efe1,
    ambient: { color: 0xfff3e0, intensity: 0.85 },
    sun: { color: 0xfff0d9, intensity: 1.05 },
    fill: { color: 0xffd9b3, intensity: 0.3 },
    wire: 0xc3a586, labelColor: '#42332a', labelSubColor: 'rgba(120,96,76,.75)',
    tierColor: '#a25a2f',
    glow: false, edgeOpacity: 0.55, planeOpacity: 0.16, planeEdgeOpacity: 0.4,
    layers: {
      trading:   { fill: 0x9dc3e0, edge: 0x5a86ab, text: '#3c5a70' },
      datastore: { fill: 0xd8cbb3, edge: 0xa58f6f, text: '#5c4a34' },
      esb:       { fill: 0xa9d3b4, edge: 0x5f9c74, text: '#345c41' },
      gateway:   { fill: 0xe8c58c, edge: 0xc9713f, text: '#7a4520' },
      core:      { fill: 0xc9b8e0, edge: 0x8f74b8, text: '#4a3a68' },
      csm:       { fill: 0xe3b98c, edge: 0xb87838, text: '#6b4620' },
      settle:    { fill: 0xd99c92, edge: 0xb85a4a, text: '#6b342a' },
    },
  },
};

let theme = localStorage.getItem('dfn-theme') || 'dark';
function T() { return THEMES[theme]; }

/* ---------- Renderer / scene / camera ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W(), H());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('c').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(T().bg);
scene.fog = new THREE.FogExp2(T().fog, T().fogDensity);

const SZ = 32;
const camera = new THREE.OrthographicCamera(-SZ * W() / H(), SZ * W() / H(), SZ, -SZ, 0.1, 900);

const orbit = {
  theta: Math.PI / 4, phi: Math.atan(1 / Math.sqrt(2)), radius: 95, zoom: SZ,
  tx: 0, ty: 0, tz: 0,
  _theta: Math.PI / 4, _phi: Math.atan(1 / Math.sqrt(2)), _radius: 95, _zoom: SZ,
  _tx: 0, _ty: 0, _tz: 0,
};
const ISO = { theta: Math.PI / 4, phi: Math.atan(1 / Math.sqrt(2)), radius: 95, zoom: SZ, tx: 0, ty: 0, tz: 0 };

function applyOrbit() {
  const sp = Math.sin(orbit._phi), cp = Math.cos(orbit._phi);
  camera.position.set(
    orbit._tx + orbit._radius * sp * Math.sin(orbit._theta),
    orbit._ty + orbit._radius * cp,
    orbit._tz + orbit._radius * sp * Math.cos(orbit._theta)
  );
  camera.lookAt(orbit._tx, orbit._ty, orbit._tz);
  const a = W() / H();
  camera.left = -orbit._zoom * a; camera.right = orbit._zoom * a;
  camera.top = orbit._zoom; camera.bottom = -orbit._zoom;
  camera.updateProjectionMatrix();
}
applyOrbit();

/* ---------- Lights (colors/intensity swapped per theme) ---------- */
const ambientLight = new THREE.AmbientLight(T().ambient.color, T().ambient.intensity);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight(T().sun.color, T().sun.intensity);
sun.position.set(25, 45, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
['left', 'right', 'top', 'bottom'].forEach((k, i) => sun.shadow.camera[k] = [-40, 40, 40, -40][i]);
scene.add(sun);
const fillLight = new THREE.DirectionalLight(T().fill.color, T().fill.intensity);
fillLight.position.set(-15, 10, -15);
scene.add(fillLight);

/* ---------- Ground ---------- */
const grid = new THREE.GridHelper(170, 85, T().grid, T().grid);
// GridHelper bakes its two colors into per-vertex color attributes, so a
// plain material.color.setHex() later wouldn't retint it correctly unless
// we turn vertexColors off up front and drive color from material.color alone.
grid.material.vertexColors = false;
grid.position.y = -0.01; scene.add(grid);
const gndMat = new THREE.MeshLambertMaterial({ color: T().ground });
const gnd = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), gndMat);
gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; scene.add(gnd);

/* ---------- Layout scale (SVG-space → 3D isometric space) ---------- */
const S = 1 / 17;
function sx(v) { return (v - 340) * S; }
function sz(v) { return (v - 310) * S; }

/* ---------- Shape builders ----------
   Each returns { group, recolor(layerKey) } so theme switches just
   recolor existing geometry instead of rebuilding the scene. */
function makeMats(layerKey, opacity = 1) {
  const c = T().layers[layerKey];
  const fillMat = new THREE.MeshLambertMaterial({
    color: c.fill, transparent: opacity < 1, opacity,
    emissive: T().glow ? c.edge : 0x000000, emissiveIntensity: T().glow ? 0.18 : 0,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: c.edge, transparent: true, opacity: T().edgeOpacity });
  return { fillMat, edgeMat };
}

function box(layerKey, w = 2.2, h = 1.4, d = 1.8, opacity = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const { fillMat, edgeMat } = makeMats(layerKey, opacity);
  const m = new THREE.Mesh(geo, fillMat);
  m.castShadow = opacity >= 1; m.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  const g = new THREE.Group(); g.add(m, edges);
  g.userData.recolor = (lk) => {
    const c = T().layers[lk];
    m.material.color.setHex(c.fill);
    m.material.emissive.setHex(T().glow ? c.edge : 0x000000);
    m.material.emissiveIntensity = T().glow ? 0.18 : 0;
    edges.material.color.setHex(c.edge);
    edges.material.opacity = T().edgeOpacity;
  };
  return g;
}
function dbBox(layerKey) {
  const g = new THREE.Group();
  const meshes = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BoxGeometry(2.2, 0.38, 1.8);
    const { fillMat, edgeMat } = makeMats(layerKey);
    const mesh = new THREE.Mesh(geo, fillMat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.y = i * 0.44;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.y = i * 0.44;
    g.add(mesh, edges);
    meshes.push({ mesh, edges });
  }
  g.userData.recolor = (lk) => {
    const c = T().layers[lk];
    meshes.forEach(({ mesh, edges }) => {
      mesh.material.color.setHex(c.fill);
      mesh.material.emissive.setHex(T().glow ? c.edge : 0x000000);
      mesh.material.emissiveIntensity = T().glow ? 0.18 : 0;
      edges.material.color.setHex(c.edge);
      edges.material.opacity = T().edgeOpacity;
    });
  };
  return g;
}
function wideBox(layerKey, w, h, d) { return box(layerKey, w, h, d, 0.18); }

const zonePlanes = []; // { mesh, edges, layerKey }
function floatPlane(layerKey, cx, cz, w, d) {
  const geo = new THREE.PlaneGeometry(w, d);
  const c = T().layers[layerKey];
  const mat = new THREE.MeshBasicMaterial({ color: c.fill, transparent: true, opacity: T().planeOpacity, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.02, cz); scene.add(m);
  const edgeMat = new THREE.LineBasicMaterial({ color: c.edge, transparent: true, opacity: T().planeEdgeOpacity });
  const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  el.rotation.x = -Math.PI / 2; el.position.set(cx, 0.03, cz); scene.add(el);
  zonePlanes.push({ mesh: m, edges: el, layerKey });
}

/* ---------- Labels (canvas sprite, baked once per theme) ---------- */
function bakeLabelTexture(text, sub, th) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = sub ? 80 : 56;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 28px monospace'; ctx.fillStyle = th.labelColor; ctx.textAlign = 'center';
  ctx.fillText(text, 128, sub ? 32 : 32);
  if (sub) { ctx.font = '20px monospace'; ctx.fillStyle = th.labelSubColor; ctx.fillText(sub, 128, 58); }
  return new THREE.CanvasTexture(cv);
}
function makeLabelSprite(text, sub, x, y, z) {
  const texDark = bakeLabelTexture(text, sub, THEMES.dark);
  const texLight = bakeLabelTexture(text, sub, THEMES.light);
  const mat = new THREE.SpriteMaterial({ map: theme === 'dark' ? texDark : texLight, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(sub ? 3.5 : 2.8, sub ? 1.4 : 1.0, 1);
  s.position.set(x, y, z);
  scene.add(s);
  labelSprites.push({ sprite: s, texDark, texLight });
  return s;
}
const labelSprites = [];

function bakeTierTexture(text, th) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 44;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 22px monospace'; ctx.fillStyle = th.tierColor; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, 22);
  return new THREE.CanvasTexture(cv);
}
const tierSprites = [];
function tierLabel(text, z) {
  const texDark = bakeTierTexture(text, THEMES.dark);
  const texLight = bakeTierTexture(text, THEMES.light);
  const mat = new THREE.SpriteMaterial({ map: theme === 'dark' ? texDark : texLight, transparent: true, depthTest: false, opacity: 0.9 });
  const s = new THREE.Sprite(mat);
  s.scale.set(6.5, 0.9, 1);
  s.position.set(-19.5, 0.3, z);
  scene.add(s);
  tierSprites.push({ sprite: s, texDark, texLight });
}

/* ---------- Node registry ---------- */
const nodes = {};
const meshes = [];
function addNode(id, group, x, y, z, meta) {
  group.position.set(x, y, z);
  scene.add(group);
  nodes[id] = { group, x, y, z, meta };
  group.traverse(c => { if (c.isMesh) { c.userData.nodeId = id; meshes.push(c); } });
  makeLabelSprite(meta.label, meta.sub || '', x, y + (meta.h || 1.4) / 2 + 1.1, z);
}

/* ---------- Arrows / packet animation ---------- */
const arrows = [];
const connectionLines = []; // { line, layerKey|null }
function connect(a, b, layerKey, both) {
  const pts = [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const color = layerKey ? T().layers[layerKey].edge : T().wire;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 });
  const line = new THREE.Line(geo, mat); scene.add(line);
  connectionLines.push({ line, layerKey });

  const mkDot = (pa, pb) => {
    const dmat = new THREE.MeshBasicMaterial({ color });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.12, 6, 6), dmat);
    dot.userData.anim = { pa: pa.clone(), pb: pb.clone(), t: Math.random(), speed: .3 + Math.random() * .3 };
    dot.userData.layerKey = layerKey;
    scene.add(dot); arrows.push(dot);
  };
  mkDot(pts[0], pts[1]);
  if (both) mkDot(pts[1], pts[0]);
}

/* ---------- Build everything from architecture.json ---------- */
let ARCH = null;

function buildFromArch(arch) {
  ARCH = arch;
  document.getElementById('hdr-sub').textContent = arch.meta.subtitle || arch.meta.name;
  document.getElementById('stat-nodes').textContent = arch.nodes.length;
  document.getElementById('stat-layers').textContent = Object.keys(arch.layers).length;

  const DEFAULT_SIZE = { w: 2.2, h: 1.4, d: 1.8 };

  arch.nodes.forEach(n => {
    const size = { ...DEFAULT_SIZE, ...(n.size || {}) };
    let group;
    if (n.shape === 'db') group = dbBox(n.layer);
    else if (n.shape === 'wide') group = wideBox(n.layer, size.w, size.h, size.d);
    else group = box(n.layer, size.w, size.h, size.d);

    const y = n.shape === 'wide' ? 0.4 : (n.shape === 'db' ? 0.7 : (size.h >= 1.5 ? 0.75 : 0.7));
    const x3 = sx(n.x), z3 = sz(n.row);
    addNode(n.id, group, x3, y, z3, { label: n.label, sub: n.sub, h: n.shape === 'db' ? 1.7 : size.h });

    // Zone floor plate, sized to the node's footprint (or wider for 'wide' shapes)
    const zw = n.shape === 'wide' ? size.w + 2 : Math.max(size.w, size.d) + 2.2;
    const zd = n.shape === 'wide' ? size.d + 0.2 : Math.max(size.w, size.d) + 1.7;
    floatPlane(n.layer, x3, z3, zw, zd);
  });

  (arch.tiers || []).forEach(t => tierLabel(t.label, sz(t.row)));

  arch.connections.forEach(c => {
    const a = nodes[c.from], b = nodes[c.to];
    if (!a || !b) return;
    const layerA = arch.nodes.find(n => n.id === c.from).layer;
    const layerB = arch.nodes.find(n => n.id === c.to).layer;
    const key = layerB !== 'datastore' ? layerB : (layerA !== 'datastore' ? layerA : null);
    connect(a, b, key, !!c.both);
  });

  buildLegend(arch);
  applyThemeToScene(); // ensure everything matches the current theme's exact values
}

function buildLegend(arch) {
  const used = new Set(arch.nodes.map(n => n.layer));
  const box = document.getElementById('leg-items');
  box.innerHTML = '';
  Object.entries(arch.layers).forEach(([key, def]) => {
    if (!used.has(key)) return;
    const row = document.createElement('div');
    row.className = 'li';
    const sw = document.createElement('div');
    sw.className = 'ls';
    sw.dataset.layer = key;
    row.appendChild(sw);
    row.appendChild(document.createTextNode(def.label));
    box.appendChild(row);
  });
  recolorLegend();
}
function recolorLegend() {
  document.querySelectorAll('#leg-items .ls').forEach(el => {
    const c = T().layers[el.dataset.layer];
    if (!c) return;
    el.style.background = '#' + c.fill.toString(16).padStart(6, '0');
    el.style.border = '1px solid #' + c.edge.toString(16).padStart(6, '0');
  });
}

/* ---------- Theme application (re-colors an already-built scene) ---------- */
function applyThemeToScene() {
  const th = T();
  scene.background = new THREE.Color(th.bg);
  scene.fog.color.setHex(th.fog);
  scene.fog.density = th.fogDensity;
  grid.material.color.setHex(th.grid);
  grid.material.opacity = 1;
  gndMat.color.setHex(th.ground);
  ambientLight.color.setHex(th.ambient.color); ambientLight.intensity = th.ambient.intensity;
  sun.color.setHex(th.sun.color); sun.intensity = th.sun.intensity;
  fillLight.color.setHex(th.fill.color); fillLight.intensity = th.fill.intensity;

  if (ARCH) {
    ARCH.nodes.forEach(n => {
      const g = nodes[n.id].group;
      if (g.userData.recolor) g.userData.recolor(n.layer);
    });
  }
  zonePlanes.forEach(({ mesh, edges, layerKey }) => {
    const c = th.layers[layerKey];
    mesh.material.color.setHex(c.fill); mesh.material.opacity = th.planeOpacity;
    edges.material.color.setHex(c.edge); edges.material.opacity = th.planeEdgeOpacity;
  });
  connectionLines.forEach(({ line, layerKey }) => {
    line.material.color.setHex(layerKey ? th.layers[layerKey].edge : th.wire);
  });
  arrows.forEach(dot => {
    const lk = dot.userData.layerKey;
    dot.material.color.setHex(lk ? th.layers[lk].edge : th.wire);
  });
  labelSprites.forEach(({ sprite, texDark, texLight }) => {
    sprite.material.map = theme === 'dark' ? texDark : texLight;
    sprite.material.needsUpdate = true;
  });
  tierSprites.forEach(({ sprite, texDark, texLight }) => {
    sprite.material.map = theme === 'dark' ? texDark : texLight;
    sprite.material.needsUpdate = true;
  });
  recolorLegend();
}

function setTheme(next) {
  theme = next;
  localStorage.setItem('dfn-theme', theme);
  document.documentElement.dataset.theme = theme;
  document.getElementById('tt-icon').textContent = theme === 'dark' ? '☾' : '☀';
  document.getElementById('tt-label').textContent = theme === 'dark' ? 'Neon' : 'Cozy';
  applyThemeToScene();
}
document.getElementById('theme-toggle').addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
// Reflect the saved/default theme in the toggle immediately.
document.getElementById('tt-icon').textContent = theme === 'dark' ? '☾' : '☀';
document.getElementById('tt-label').textContent = theme === 'dark' ? 'Neon' : 'Cozy';

/* ---------- Raycasting / hover tooltip ---------- */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-9999, -9999);
const tip = document.getElementById('tip');

window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / W()) * 2 - 1;
  mouse.y = -(e.clientY / H()) * 2 + 1;
  tip.style.left = (e.clientX + 16) + 'px';
  tip.style.top = (e.clientY + 16) + 'px';
});

/* ---------- Orbit / pan / zoom controls ---------- */
let drag = null, autoRot = false, autoAngle = orbit.theta;
const hintEl = document.getElementById('hint');
let hintFaded = false;

document.getElementById('c').addEventListener('contextmenu', e => e.preventDefault());
document.getElementById('c').addEventListener('mousedown', e => {
  autoRot = false; document.getElementById('btn-rot').classList.remove('active');
  drag = { type: e.button === 0 ? 'orbit' : 'pan', x: e.clientX, y: e.clientY };
  if (!hintFaded) { hintEl.classList.add('faded'); hintFaded = true; }
});
window.addEventListener('mouseup', () => drag = null);
window.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.type === 'orbit') {
    orbit.theta -= dx * .007;
    orbit.phi = Math.max(.06, Math.min(Math.PI / 2 - .02, orbit.phi - dy * .005));
    const iso = Math.abs(orbit.theta - ISO.theta) < .01 && Math.abs(orbit.phi - ISO.phi) < .01;
    document.getElementById('mlbl').textContent = iso ? 'Isometric' : 'Free';
  }
  if (drag.type === 'pan') {
    const spd = orbit._zoom * .0016;
    const right = new THREE.Vector3();
    right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 1, 0)).normalize();
    const fwd = new THREE.Vector3(); fwd.crossVectors(right, new THREE.Vector3(0, 1, 0)).normalize();
    orbit.tx -= right.x * dx * spd - fwd.x * dy * spd;
    orbit.tz -= right.z * dx * spd - fwd.z * dy * spd;
  }
});
document.getElementById('c').addEventListener('wheel', e => {
  e.preventDefault();
  orbit.zoom = Math.max(10, Math.min(55, orbit.zoom + e.deltaY * .022));
}, { passive: false });

document.getElementById('btn-zi').onclick = () => orbit.zoom = Math.max(10, orbit.zoom - 4);
document.getElementById('btn-zo').onclick = () => orbit.zoom = Math.min(55, orbit.zoom + 4);
document.getElementById('btn-iso').onclick = () => {
  autoRot = false; document.getElementById('btn-rot').classList.remove('active');
  Object.assign(orbit, { theta: ISO.theta, phi: ISO.phi, radius: ISO.radius, zoom: ISO.zoom, tx: ISO.tx, ty: ISO.ty, tz: ISO.tz });
  document.getElementById('mlbl').textContent = 'Isometric';
};
document.getElementById('btn-rot').onclick = () => {
  autoRot = !autoRot;
  document.getElementById('btn-rot').classList.toggle('active', autoRot);
  if (autoRot) autoAngle = orbit.theta;
};

window.addEventListener('resize', () => { renderer.setSize(W(), H()); applyOrbit(); });

/* ---------- Touch ---------- */
let lt = null, lpd = null;
document.getElementById('c').addEventListener('touchstart', e => {
  if (e.touches.length === 1) lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY; lpd = Math.sqrt(dx * dx + dy * dy); }
}, { passive: true });
document.getElementById('c').addEventListener('touchmove', e => {
  if (e.touches.length === 1 && lt) { orbit.theta -= (e.touches[0].clientX - lt.x) * .007; orbit.phi = Math.max(.06, Math.min(Math.PI / 2 - .02, orbit.phi - (e.touches[0].clientY - lt.y) * .005)); lt = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  if (e.touches.length === 2 && lpd) { const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY, d = Math.sqrt(dx * dx + dy * dy); orbit.zoom = Math.max(10, Math.min(55, orbit.zoom * (lpd / d))); lpd = d; }
}, { passive: true });
document.getElementById('c').addEventListener('touchend', () => { lt = null; lpd = null; });

/* ---------- Animate ---------- */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta(), t = clock.getElapsedTime();

  if (autoRot) { autoAngle += dt * .2; orbit.theta = autoAngle; }

  const L = .1;
  orbit._theta += (orbit.theta - orbit._theta) * L;
  orbit._phi += (orbit.phi - orbit._phi) * L;
  orbit._zoom += (orbit.zoom - orbit._zoom) * L;
  orbit._tx += (orbit.tx - orbit._tx) * L;
  orbit._ty += (orbit.ty - orbit._ty) * L;
  orbit._tz += (orbit.tz - orbit._tz) * L;
  applyOrbit();

  arrows.forEach(d => {
    const a = d.userData.anim;
    a.t = (a.t + dt * a.speed) % 1;
    d.position.lerpVectors(a.pa, a.pb, a.t);
    d.position.y += Math.sin(a.t * Math.PI) * 0.25;
  });

  Object.values(nodes).forEach(n => {
    n.group.position.y = n.y + Math.sin(t * 1.1 + n.x * 0.7 + n.z * 0.3) * 0.05;
  });

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length > 0 && ARCH) {
    const id = hits[0].object.userData.nodeId;
    const nodeDef = id && ARCH.nodes.find(n => n.id === id);
    if (nodeDef) {
      document.getElementById('tname').textContent = nodeDef.label + (nodeDef.sub ? ' ' + nodeDef.sub : '');
      document.getElementById('tlayer').textContent = ARCH.layers[nodeDef.layer].label;
      document.getElementById('tdesc').textContent = nodeDef.desc || '';
      tip.style.display = 'block';
    }
  } else {
    tip.style.display = 'none';
  }

  renderer.render(scene, camera);
}

/* ---------- Boot ---------- */
document.documentElement.dataset.theme = theme;
fetch('architecture.json')
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(arch => {
    buildFromArch(arch);
    const started = performance.now();
    const minDisplay = 900;
    const finish = () => {
      const l = document.getElementById('load');
      l.style.opacity = '0';
      setTimeout(() => l.style.display = 'none', 500);
    };
    const elapsed = performance.now() - started;
    setTimeout(finish, Math.max(0, minDisplay - elapsed));
    animate();
  })
  .catch(err => {
    const l = document.getElementById('load');
    l.innerHTML = '<div class="ll" style="color:#ff6b6b">Failed to load architecture.json</div>'
      + '<div style="color:var(--muted);font-size:10px;max-width:320px;text-align:center;line-height:1.6">'
      + 'This usually means the page was opened directly as a file. Serve the folder with a local '
      + 'server (e.g. <b>python -m http.server</b>) and open it over http://, then reload.<br><br>'
      + 'Error: ' + err.message + '</div>';
  });
