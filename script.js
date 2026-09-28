/* ============================================================
   DFN Architecture — Interactive 3D with per-layer colors,
   selection focus, spotlight dimming, and CSS bloom glow.
   ============================================================ */

const W = () => window.innerWidth, H = () => window.innerHeight;

/* ── Distinct color per category (layer) ─────────────────── */
const LAYER_COLORS = {
  dark: {
    trading:   { fill: 0x061524, edge: 0x00b4ff },
    datastore: { fill: 0x0e1220, edge: 0x6888aa },
    esb:       { fill: 0x041510, edge: 0x18d868 },
    gateway:   { fill: 0x04121a, edge: 0x00d8e8 },
    core:      { fill: 0x120528, edge: 0xaa60ff },
    csm:       { fill: 0x1c0d00, edge: 0xf5a020 },
    settle:    { fill: 0x1c0308, edge: 0xff3358 },
  },
  light: {
    trading:   { fill: 0xb8d8f8, edge: 0x1565c0 },
    datastore: { fill: 0xd8e2ec, edge: 0x455a64 },
    esb:       { fill: 0xb8ecd0, edge: 0x1a5e28 },
    gateway:   { fill: 0xb0e8f2, edge: 0x006472 },
    core:      { fill: 0xdcceff, edge: 0x6a1b9a },
    csm:       { fill: 0xffdcaa, edge: 0xbf5200 },
    settle:    { fill: 0xffc0ca, edge: 0xb71c20 },
  },
};

const THEMES = {
  dark: {
    bg: 0x05060b, fog: 0x05060b, fogDensity: 0.0046,
    grid: 0x0b0f1c, ground: 0x05060b,
    ambient: { color: 0xffffff, intensity: 0.38 },
    sun:    { color: 0x9ad4ff, intensity: 0.88 },
    fill:   { color: 0xa070ff, intensity: 0.30 },
    wire:   0x1a2035,
    labelColor: '#cce4ff', labelSubColor: 'rgba(130,165,215,0.6)',
    labelFont: 'Syne', labelFontWeight: '700',
    glow: true, edgeOpacity: 0.9,
  },
  light: {
    bg: 0xf0e8d4, fog: 0xf0e8d4, fogDensity: 0.0033,
    grid: 0xddd0b4, ground: 0xf4edd8,
    ambient: { color: 0xfff8f0, intensity: 0.78 },
    sun:    { color: 0xffe8c0, intensity: 0.98 },
    fill:   { color: 0xffc880, intensity: 0.24 },
    wire:   0xb8a070,
    labelColor: '#3a2a18', labelSubColor: 'rgba(100,78,52,0.7)',
    labelFont: 'Fraunces', labelFontWeight: '600',
    glow: false, edgeOpacity: 0.58,
  },
};

let theme = localStorage.getItem('dfn-theme') || 'dark';
function T() { return THEMES[theme]; }
function LC(layerKey) {
  const m = LAYER_COLORS[theme];
  return m[layerKey] || { fill: 0x0d1628, edge: 0x3a7fff };
}

/* ── Color math ──────────────────────────────────────────── */
function lerpHex(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16) |
          (Math.round(ag + (bg - ag) * t) << 8) |
           Math.round(ab + (bb - ab) * t));
}
function toGray(hex) {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return (l << 16) | (l << 8) | l;
}

/* ── Renderer / Scene / Camera ───────────────────────────── */
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

const ISO = { theta: Math.PI / 4, phi: Math.atan(1 / Math.sqrt(2)), radius: 95, zoom: SZ, tx: 0, ty: 0, tz: 0 };
const orbit = { ...ISO, _theta: ISO.theta, _phi: ISO.phi, _radius: ISO.radius, _zoom: SZ, _tx: 0, _ty: 0, _tz: 0 };

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

/* ── Lights ──────────────────────────────────────────────── */
const ambientLight = new THREE.AmbientLight(T().ambient.color, T().ambient.intensity);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight(T().sun.color, T().sun.intensity);
sun.position.set(25, 45, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
['left','right','top','bottom'].forEach((k, i) => sun.shadow.camera[k] = [-40,40,40,-40][i]);
scene.add(sun);
const fillLight = new THREE.DirectionalLight(T().fill.color, T().fill.intensity);
fillLight.position.set(-15, 10, -15); scene.add(fillLight);

/* ── Ground + faded grid ─────────────────────────────────── */
const grid = new THREE.GridHelper(180, 90, T().grid, T().grid);
grid.material.vertexColors = false;
grid.material.transparent = true;
grid.material.opacity = 0.55;
grid.position.y = -0.01;
scene.add(grid);
const gndMat = new THREE.MeshLambertMaterial({ color: T().ground });
const gnd = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), gndMat);
gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; scene.add(gnd);

/* ── Layout helpers ──────────────────────────────────────── */
const S = 1 / 17;
function sx(v) { return (v - 340) * S; }
function sz(v) { return (v - 310) * S; }

/* ── Shape builders ──────────────────────────────────────── */
// Store _meshRef, _edgesRef, _subMeshes, _layerKey on each group
// so tickSelection can drive them per-frame.

function makeMats(layerKey, opacity) {
  const c = LC(layerKey);
  const fillMat = new THREE.MeshLambertMaterial({
    color: c.fill,
    transparent: opacity !== undefined ? opacity < 1 : false,
    opacity: opacity !== undefined ? opacity : 1,
    emissive: T().glow ? c.edge : 0x000000,
    emissiveIntensity: T().glow ? 0.07 : 0,
  });
  const edgeMat = new THREE.LineBasicMaterial({
    color: c.edge, transparent: true, opacity: T().edgeOpacity,
  });
  return { fillMat, edgeMat };
}

function box(layerKey, w = 2.2, h = 1.4, d = 1.8, opacity) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const { fillMat, edgeMat } = makeMats(layerKey, opacity);
  const m = new THREE.Mesh(geo, fillMat);
  m.castShadow = (opacity === undefined || opacity >= 1);
  m.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  const g = new THREE.Group(); g.add(m, edges);
  g._meshRef = m; g._edgesRef = edges; g._layerKey = layerKey;
  g.userData.recolor = (lk) => {
    const lkey = lk || g._layerKey;
    const c = LC(lkey);
    m.material.color.setHex(c.fill);
    m.material.emissive.setHex(T().glow ? c.edge : 0x000000);
    m.material.emissiveIntensity = T().glow ? 0.07 : 0;
    edges.material.color.setHex(c.edge);
    edges.material.opacity = T().edgeOpacity;
  };
  return g;
}

function dbBox(layerKey) {
  const g = new THREE.Group();
  const slices = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BoxGeometry(2.2, 0.38, 1.8);
    const { fillMat, edgeMat } = makeMats(layerKey);
    const mesh = new THREE.Mesh(geo, fillMat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.y = i * 0.44;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.y = i * 0.44;
    g.add(mesh, edges);
    slices.push({ mesh, edges });
  }
  g._subMeshes = slices; g._layerKey = layerKey;
  g.userData.recolor = (lk) => {
    const c = LC(lk || g._layerKey);
    slices.forEach(({ mesh, edges }) => {
      mesh.material.color.setHex(c.fill);
      mesh.material.emissive.setHex(T().glow ? c.edge : 0x000000);
      mesh.material.emissiveIntensity = T().glow ? 0.07 : 0;
      edges.material.color.setHex(c.edge);
      edges.material.opacity = T().edgeOpacity;
    });
  };
  return g;
}
function wideBox(layerKey, w, h, d) { return box(layerKey, w, h, d, 0.20); }

/* ── Label sprites (canvas-baked, one per theme) ─────────── */
function bakeLabelTexture(text, sub, th) {
  const cv = document.createElement('canvas');
  cv.width = 320; cv.height = sub ? 96 : 64;
  const ctx = cv.getContext('2d');
  const font = `${th.labelFont || 'sans-serif'}, monospace`;
  ctx.font = `${th.labelFontWeight || '700'} 30px ${font}`;
  ctx.fillStyle = th.labelColor; ctx.textAlign = 'center';
  ctx.fillText(text, 160, sub ? 36 : 40);
  if (sub) {
    ctx.font = `400 19px ${font}`;
    ctx.fillStyle = th.labelSubColor;
    ctx.fillText(sub, 160, 65);
  }
  return new THREE.CanvasTexture(cv);
}
const labelSprites = [];
function makeLabelSprite(text, sub, x, y, z) {
  const texDark = bakeLabelTexture(text, sub, THEMES.dark);
  const texLight = bakeLabelTexture(text, sub, THEMES.light);
  const mat = new THREE.SpriteMaterial({
    map: theme === 'dark' ? texDark : texLight,
    transparent: true, depthTest: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(sub ? 3.4 : 2.7, sub ? 1.3 : 0.95, 1);
  s.position.set(x, y, z);
  scene.add(s);
  const entry = { sprite: s, texDark, texLight, nodeId: null };
  labelSprites.push(entry);
  return entry;
}

/* ── Node registry ───────────────────────────────────────── */
const nodes = {};
const meshes = [];
function addNode(id, group, x, y, z, meta) {
  group.position.set(x, y, z);
  scene.add(group);
  nodes[id] = { group, x, y, z, meta };
  group.traverse(c => { if (c.isMesh) { c.userData.nodeId = id; meshes.push(c); } });
  const entry = makeLabelSprite(meta.label, meta.sub || '', x, y + (meta.h || 1.4) / 2 + 1.1, z);
  entry.nodeId = id;
}

/* ── Connections ─────────────────────────────────────────── */
const connectionLines = [];
const arrows = [];
function connect(a, b, layerKey, both) {
  const pts = [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const color = layerKey ? LC(layerKey).edge : T().wire;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.48 });
  const line = new THREE.Line(geo, mat); scene.add(line);
  connectionLines.push({ line, layerKey, baseColor: color });

  const mkDot = (pa, pb) => {
    const dmat = new THREE.MeshBasicMaterial({ color });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), dmat);
    dot.userData.anim = { pa: pa.clone(), pb: pb.clone(), t: Math.random(), speed: 0.27 + Math.random() * 0.27 };
    dot.userData.layerKey = layerKey;
    scene.add(dot); arrows.push(dot);
  };
  mkDot(pts[0], pts[1]);
  if (both) mkDot(pts[1], pts[0]);
}

/* ── Build from architecture.json ────────────────────────── */
let ARCH = null;
const nodeStates = {}; // { [id]: { dim: 0..1, dimTarget: 0..1 } }

function buildFromArch(arch) {
  ARCH = arch;
  document.getElementById('hdr-sub').textContent = arch.meta.subtitle || arch.meta.name;
  document.getElementById('stat-nodes').textContent = arch.nodes.length;

  const DEF = { w: 2.2, h: 1.4, d: 1.8 };
  arch.nodes.forEach(n => {
    const size = { ...DEF, ...(n.size || {}) };
    let group;
    if      (n.shape === 'db')   group = dbBox(n.layer);
    else if (n.shape === 'wide') group = wideBox(n.layer, size.w, size.h, size.d);
    else                         group = box(n.layer, size.w, size.h, size.d);

    const y = n.shape === 'db' ? 0.7 : (size.h >= 1.5 ? 0.75 : 0.7);
    addNode(n.id, group, sx(n.x), y, sz(n.row), {
      label: n.label, sub: n.sub || '', h: n.shape === 'db' ? 1.7 : size.h,
    });
    nodeStates[n.id] = { dim: 0, dimTarget: 0 };
  });

  arch.connections.forEach(c => {
    const a = nodes[c.from], b = nodes[c.to];
    if (!a || !b) return;
    const lA = arch.nodes.find(n => n.id === c.from)?.layer;
    const lB = arch.nodes.find(n => n.id === c.to)?.layer;
    const key = lB !== 'datastore' ? lB : (lA !== 'datastore' ? lA : null);
    connect(a, b, key, !!c.both);
  });

  applyThemeToScene();
}

/* ── Selection system ────────────────────────────────────── */
let selectedNodeId = null;
const selEnv = { current: 0, target: 0 }; // global 0→1 envelope

const glowDot     = document.getElementById('glow-dot');
const selOverlay  = document.getElementById('sel-overlay');
const focusPanel  = document.getElementById('focus-panel');
let glowDotActive = false;
let overlayActive = false;

function selectNode(id) {
  if (!ARCH || !nodes[id]) return;
  selectedNodeId = id;
  selEnv.target = 1;

  ARCH.nodes.forEach(n => {
    if (!nodeStates[n.id]) nodeStates[n.id] = { dim: 0, dimTarget: 0 };
    nodeStates[n.id].dimTarget = n.id === id ? 0 : 1;
  });

  // Smooth camera focus on node
  const nd = nodes[id];
  orbit.tx = nd.x; orbit.ty = nd.y; orbit.tz = nd.z;
  orbit.zoom = 9;

  _showFocusPanel(id);
  document.getElementById('mlbl').textContent = 'Focus: ' + (ARCH.nodes.find(n => n.id === id)?.label || id);
}

function deselectNode() {
  if (!selectedNodeId) return;
  selectedNodeId = null;
  selEnv.target = 0;
  ARCH?.nodes.forEach(n => { if (nodeStates[n.id]) nodeStates[n.id].dimTarget = 0; });
  // Return to ISO
  Object.assign(orbit, { theta: ISO.theta, phi: ISO.phi, zoom: ISO.zoom, tx: ISO.tx, ty: ISO.ty, tz: ISO.tz });
  _hideFocusPanel();
  document.getElementById('mlbl').textContent = 'Isometric';
}

function _showFocusPanel(id) {
  const nodeDef = ARCH.nodes.find(n => n.id === id);
  if (!nodeDef) return;
  const lc = LC(nodeDef.layer);
  const edgeCSS = '#' + lc.edge.toString(16).padStart(6, '0');
  const layerLabel = ARCH.layers?.[nodeDef.layer]?.label || nodeDef.layer;

  document.getElementById('fp-color-dot').style.background = edgeCSS;
  document.getElementById('fp-color-dot').style.boxShadow = `0 0 14px ${edgeCSS}88`;
  document.getElementById('fp-name').textContent = nodeDef.label;
  const sub = document.getElementById('fp-sub');
  sub.textContent = nodeDef.sub || '';
  sub.style.display = nodeDef.sub ? '' : 'none';
  document.getElementById('fp-desc').textContent = nodeDef.desc || '—';
  document.getElementById('fp-cat').textContent = layerLabel;
  document.getElementById('fp-cat').style.color = edgeCSS;

  const conns = ARCH.connections.filter(c => c.from === id || c.to === id);
  const names = [...new Set(conns.map(c => {
    const oid = c.from === id ? c.to : c.from;
    return ARCH.nodes.find(n => n.id === oid)?.label || oid;
  }))];
  document.getElementById('fp-connections').textContent = names.length ? names.join(', ') : '—';

  focusPanel.classList.add('visible');
}
function _hideFocusPanel() {
  focusPanel.classList.remove('visible');
}

/* Per-frame: lerp all materials + update CSS overlays */
function tickSelection(t) {
  if (!ARCH) return;
  const sel = selectedNodeId;

  // Global envelope (0=idle, 1=focused)
  selEnv.current += (selEnv.target - selEnv.current) * 0.055;
  const env = selEnv.current;

  // Slow breath for glow pulse (~10.8s period)
  const breath = Math.sin(t * 0.58) * 0.5 + 0.5;

  ARCH.nodes.forEach(n => {
    const node = nodes[n.id]; if (!node) return;
    const st = nodeStates[n.id]; if (!st) return;
    st.dim += (st.dimTarget - st.dim) * 0.062;

    const isSel = sel === n.id;
    const dim = st.dim;
    const lc = LC(n.layer);

    // Lerp fill color toward its own luminance-gray as it dims
    const fillTarget = lerpHex(lc.fill, toGray(lc.fill), dim * 0.88);
    const edgeTarget = lerpHex(lc.edge, toGray(lc.edge), dim * 0.88);
    const opacity    = Math.max(0.16, 1 - dim * 0.74);
    const edgeOp     = T().edgeOpacity * Math.max(0.12, 1 - dim * 0.78);

    // Emissive: selected node breathes, others fade to almost zero
    const emissiveInt = isSel
      ? (T().glow ? env * (0.88 + 0.22 * breath) : 0)
      : (T().glow ? 0.06 * (1 - dim) : 0);

    const applyMesh = (mesh, edges) => {
      mesh.material.color.setHex(fillTarget);
      mesh.material.opacity = opacity;
      mesh.material.transparent = true;
      mesh.material.emissive.setHex(T().glow ? lc.edge : 0x000000);
      mesh.material.emissiveIntensity = emissiveInt;
      edges.material.color.setHex(edgeTarget);
      edges.material.opacity = isSel
        ? Math.min(1, T().edgeOpacity + env * 0.12)
        : edgeOp;
    };

    const g = node.group;
    if (g._meshRef)   applyMesh(g._meshRef, g._edgesRef);
    if (g._subMeshes) g._subMeshes.forEach(({ mesh, edges }) => applyMesh(mesh, edges));
  });

  // Connection lines & packet dots — dim when anything is selected
  connectionLines.forEach(({ line }) => { line.material.opacity = sel ? 0.10 : 0.48; });
  arrows.forEach(d => { d.material.opacity = sel ? 0.08 : 1.0; d.material.transparent = true; });

  // Label sprites — focused label stays bright, others dim
  labelSprites.forEach(entry => {
    const isSel = sel && entry.nodeId === sel;
    entry.sprite.material.opacity = isSel ? 1.0 : (sel ? 0.10 : 1.0);
  });

  // ── CSS Glow dot ──
  if (sel && nodes[sel]) {
    const fn = nodes[sel];
    const wp = new THREE.Vector3(fn.x, fn.group.position.y, fn.z);
    wp.project(camera);
    const px = ((wp.x + 1) / 2) * W();
    const py = ((-wp.y + 1) / 2) * H();
    const lc = LC(ARCH.nodes.find(n => n.id === sel)?.layer || 'core');
    const cr = (lc.edge >> 16) & 0xff, cg = (lc.edge >> 8) & 0xff, cb = lc.edge & 0xff;
    const a1 = (env * (0.54 + 0.16 * breath)).toFixed(3);
    const a2 = (env * (0.22 + 0.07 * breath)).toFixed(3);

    glowDot.style.left = px + 'px';
    glowDot.style.top  = py + 'px';
    glowDot.style.background =
      `radial-gradient(circle, rgba(${cr},${cg},${cb},${a1}) 0%, rgba(${cr},${cg},${cb},${a2}) 30%, rgba(${cr},${cg},${cb},0) 70%)`;
    if (!glowDotActive) { glowDot.style.opacity = '1'; glowDotActive = true; }

    // Spotlight overlay — follow selected component in real time
    selOverlay.style.setProperty('--sx', px + 'px');
    selOverlay.style.setProperty('--sy', py + 'px');
    if (!overlayActive) { selOverlay.classList.add('active'); overlayActive = true; }
  } else {
    if (glowDotActive)  { glowDot.style.opacity = '0'; glowDotActive = false; }
    if (overlayActive)  { selOverlay.classList.remove('active'); overlayActive = false; }
  }
}

/* ── Theme system ────────────────────────────────────────── */
function applyThemeToScene() {
  const th = T();
  scene.background = new THREE.Color(th.bg);
  scene.fog.color.setHex(th.fog); scene.fog.density = th.fogDensity;
  grid.material.color.setHex(th.grid);
  gndMat.color.setHex(th.ground);
  ambientLight.color.setHex(th.ambient.color); ambientLight.intensity = th.ambient.intensity;
  sun.color.setHex(th.sun.color);              sun.intensity = th.sun.intensity;
  fillLight.color.setHex(th.fill.color);       fillLight.intensity = th.fill.intensity;

  if (ARCH) {
    ARCH.nodes.forEach(n => {
      const g = nodes[n.id].group;
      if (g.userData.recolor) g.userData.recolor(n.layer);
    });
  }
  connectionLines.forEach(({ line, layerKey }) => {
    line.material.color.setHex(layerKey ? LC(layerKey).edge : th.wire);
  });
  arrows.forEach(dot => {
    const lk = dot.userData.layerKey;
    dot.material.color.setHex(lk ? LC(lk).edge : th.wire);
  });
  labelSprites.forEach(({ sprite, texDark, texLight }) => {
    sprite.material.map = theme === 'dark' ? texDark : texLight;
    sprite.material.needsUpdate = true;
  });
}

function setTheme(next) {
  theme = next;
  localStorage.setItem('dfn-theme', theme);
  document.documentElement.dataset.theme = theme;
  document.getElementById('tt-icon').textContent  = theme === 'dark' ? '☾' : '☀';
  document.getElementById('tt-label').textContent = theme === 'dark' ? 'Neon' : 'Cozy';
  applyThemeToScene();
}
document.getElementById('theme-toggle').addEventListener('click',
  () => setTheme(theme === 'dark' ? 'light' : 'dark'));
document.getElementById('tt-icon').textContent  = theme === 'dark' ? '☾' : '☀';
document.getElementById('tt-label').textContent = theme === 'dark' ? 'Neon' : 'Cozy';

/* ── Click detection ─────────────────────────────────────── */
const raycaster = new THREE.Raycaster();
const hoverMouse = new THREE.Vector2(-9999, -9999);
const tip = document.getElementById('tip');
let mouseDownPos = null;

document.getElementById('c').addEventListener('mousedown', e => {
  mouseDownPos = { x: e.clientX, y: e.clientY };
});
document.getElementById('c').addEventListener('click', e => {
  if (!mouseDownPos) return;
  const dx = e.clientX - mouseDownPos.x, dy = e.clientY - mouseDownPos.y;
  if (dx * dx + dy * dy > 30) return; // ignore drags

  const mx = (e.clientX / W()) * 2 - 1;
  const my = -(e.clientY / H()) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length) {
    const id = hits[0].object.userData.nodeId;
    if (id) { (selectedNodeId === id) ? deselectNode() : selectNode(id); return; }
  }
  deselectNode(); // click on empty — deselect
});

window.addEventListener('mousemove', e => {
  hoverMouse.x = (e.clientX / W()) * 2 - 1;
  hoverMouse.y = -(e.clientY / H()) * 2 + 1;
  tip.style.left = (e.clientX + 16) + 'px';
  tip.style.top  = (e.clientY + 16) + 'px';
});

document.getElementById('btn-deselect').addEventListener('click', deselectNode);

/* ── Orbit controls ──────────────────────────────────────── */
let drag = null, autoRot = false, autoAngle = orbit.theta;
const hintEl = document.getElementById('hint');
let hintFaded = false;

document.getElementById('c').addEventListener('contextmenu', e => e.preventDefault());
document.getElementById('c').addEventListener('mousedown', e => {
  autoRot = false;
  document.getElementById('btn-rot').classList.remove('active');
  drag = { type: e.button === 2 ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
  if (!hintFaded) { hintEl.classList.add('faded'); hintFaded = true; }
});
window.addEventListener('mouseup', () => { drag = null; mouseDownPos = null; });
window.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.type === 'orbit') {
    orbit.theta -= dx * 0.007;
    orbit.phi = Math.max(0.06, Math.min(Math.PI / 2 - 0.02, orbit.phi - dy * 0.005));
    if (!selectedNodeId) {
      const iso = Math.abs(orbit.theta - ISO.theta) < 0.01 && Math.abs(orbit.phi - ISO.phi) < 0.01;
      document.getElementById('mlbl').textContent = iso ? 'Isometric' : 'Free';
    }
  }
  if (drag.type === 'pan') {
    const spd = orbit._zoom * 0.0016;
    const right = new THREE.Vector3();
    right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 1, 0)).normalize();
    const fwd = new THREE.Vector3(); fwd.crossVectors(right, new THREE.Vector3(0, 1, 0)).normalize();
    orbit.tx -= right.x * dx * spd - fwd.x * dy * spd;
    orbit.tz -= right.z * dx * spd - fwd.z * dy * spd;
  }
});
document.getElementById('c').addEventListener('wheel', e => {
  e.preventDefault();
  orbit.zoom = Math.max(7, Math.min(58, orbit.zoom + e.deltaY * 0.022));
}, { passive: false });

document.getElementById('btn-zi').onclick = () => orbit.zoom = Math.max(7,  orbit.zoom - 4);
document.getElementById('btn-zo').onclick = () => orbit.zoom = Math.min(58, orbit.zoom + 4);
document.getElementById('btn-iso').onclick = () => {
  autoRot = false;
  document.getElementById('btn-rot').classList.remove('active');
  deselectNode();
  Object.assign(orbit, ISO);
  document.getElementById('mlbl').textContent = 'Isometric';
};
document.getElementById('btn-rot').onclick = () => {
  autoRot = !autoRot;
  document.getElementById('btn-rot').classList.toggle('active', autoRot);
  if (autoRot) autoAngle = orbit.theta;
};
window.addEventListener('resize', () => { renderer.setSize(W(), H()); applyOrbit(); });

/* ── Touch controls ──────────────────────────────────────── */
let lt = null, lpd = null;
document.getElementById('c').addEventListener('touchstart', e => {
  if (e.touches.length === 1) lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lpd = Math.sqrt(dx * dx + dy * dy);
  }
}, { passive: true });
document.getElementById('c').addEventListener('touchmove', e => {
  if (e.touches.length === 1 && lt) {
    orbit.theta -= (e.touches[0].clientX - lt.x) * 0.007;
    orbit.phi = Math.max(0.06, Math.min(Math.PI / 2 - 0.02, orbit.phi - (e.touches[0].clientY - lt.y) * 0.005));
    lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e.touches.length === 2 && lpd) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const d = Math.sqrt(dx * dx + dy * dy);
    orbit.zoom = Math.max(7, Math.min(58, orbit.zoom * (lpd / d)));
    lpd = d;
  }
}, { passive: true });
document.getElementById('c').addEventListener('touchend', () => { lt = null; lpd = null; });

/* ── Animate loop ────────────────────────────────────────── */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta(), t = clock.getElapsedTime();

  if (autoRot) { autoAngle += dt * 0.18; orbit.theta = autoAngle; }

  // Smooth camera lerp (easing = 9% per frame)
  const L = 0.09;
  orbit._theta += (orbit.theta - orbit._theta) * L;
  orbit._phi   += (orbit.phi   - orbit._phi)   * L;
  orbit._zoom  += (orbit.zoom  - orbit._zoom)  * L;
  orbit._tx    += (orbit.tx    - orbit._tx)    * L;
  orbit._ty    += (orbit.ty    - orbit._ty)    * L;
  orbit._tz    += (orbit.tz    - orbit._tz)    * L;
  applyOrbit();

  // Animated packet dots along connection lines
  arrows.forEach(d => {
    const a = d.userData.anim;
    a.t = (a.t + dt * a.speed) % 1;
    d.position.lerpVectors(a.pa, a.pb, a.t);
    d.position.y += Math.sin(a.t * Math.PI) * 0.2;
  });

  // Subtle idle float (each node has a unique phase)
  Object.values(nodes).forEach(n => {
    n.group.position.y = n.y + Math.sin(t * 1.05 + n.x * 0.65 + n.z * 0.28) * 0.042;
  });

  // Selection dimming, glow, and CSS overlays
  tickSelection(t);

  // Hover tooltip (only when nothing is selected)
  if (!selectedNodeId) {
    raycaster.setFromCamera(hoverMouse, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length && ARCH) {
      const id = hits[0].object.userData.nodeId;
      const nd = id && ARCH.nodes.find(n => n.id === id);
      if (nd) {
        document.getElementById('tname').textContent = nd.label + (nd.sub ? ' · ' + nd.sub : '');
        document.getElementById('tdesc').textContent = nd.desc || '';
        tip.style.display = 'block';
      } else { tip.style.display = 'none'; }
    } else { tip.style.display = 'none'; }
  } else { tip.style.display = 'none'; }

  renderer.render(scene, camera);
}

/* ── Boot ────────────────────────────────────────────────── */
document.documentElement.dataset.theme = theme;
fetch('architecture.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(arch => {
    buildFromArch(arch);
    const started = performance.now();
    const finish = () => {
      const l = document.getElementById('load');
      l.style.opacity = '0';
      setTimeout(() => l.style.display = 'none', 500);
    };
    setTimeout(finish, Math.max(0, 900 - (performance.now() - started)));
    animate();
  })
  .catch(err => {
    const l = document.getElementById('load');
    l.innerHTML = '<div class="ll" style="color:#ff5555">Failed to load architecture.json</div>'
      + '<div style="color:var(--muted);font-size:10px;max-width:320px;text-align:center;line-height:1.6">'
      + 'Serve with a local HTTP server (e.g. <b>python -m http.server</b>) and open over http://.<br><br>'
      + 'Error: ' + err.message + '</div>';
  });
