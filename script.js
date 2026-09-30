/* ============================================================
   DFN Architecture — Interactive 3D with per-layer colors,
   geometry-bound energy effects and cinematic component inspection.
   ============================================================ */

const W = () => window.innerWidth, H = () => window.innerHeight;

/* ── Distinct color per category (layer) ─────────────────── */
const LAYER_COLORS = {
  dark: {
    trading:   { fill: 0x061a2e, edge: 0x00e5ff },
    datastore: { fill: 0x101632, edge: 0x8fb4ff },
    esb:       { fill: 0x041f14, edge: 0x00ffa8 },
    gateway:   { fill: 0x03151f, edge: 0x00f0ff },
    core:      { fill: 0x180730, edge: 0xc060ff },
    csm:       { fill: 0x201000, edge: 0xffb020 },
    settle:    { fill: 0x22040c, edge: 0xff2d6b },
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
    bg: 0x03040a, fog: 0x03040a, fogDensity: 0.0044,
    grid: 0xffffff, gridOpacity: 0.10, ground: 0x03040a,
    ambient: { color: 0x2a3cff, intensity: 0.34 },
    sun:    { color: 0x50d8ff, intensity: 0.95 },
    fill:   { color: 0xff2ec4, intensity: 0.40 },
    wire:   0x263454,
    labelColor: '#d8f2ff', labelSubColor: 'rgba(140,205,255,0.68)',
    labelFont: 'Syne', labelFontWeight: '700',
    glow: true, edgeOpacity: 0.95, baseEmissive: 0.28, haloOpacity: 0.32,
  },
  light: {
    bg: 0xf0e8d4, fog: 0xf0e8d4, fogDensity: 0.0033,
    grid: 0xddd0b4, gridOpacity: 0.55, ground: 0xf4edd8,
    ambient: { color: 0xfff8f0, intensity: 0.78 },
    sun:    { color: 0xffe8c0, intensity: 0.98 },
    fill:   { color: 0xffc880, intensity: 0.24 },
    wire:   0xb8a070,
    labelColor: '#3a2a18', labelSubColor: 'rgba(100,78,52,0.7)',
    labelFont: 'Fraunces', labelFontWeight: '600',
    glow: true, edgeOpacity: 0.78, baseEmissive: 0.12, haloOpacity: 0.16,
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(W(), H());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
document.getElementById('c').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(T().bg);
scene.fog = new THREE.FogExp2(T().fog, T().fogDensity);

const SZ = 32;
const camera = new THREE.OrthographicCamera(-SZ * W() / H(), SZ * W() / H(), SZ, -SZ, 0.1, 900);

const ISO = { theta: Math.PI / 4, phi: Math.atan(1 / Math.sqrt(2)), radius: 95, zoom: SZ, tx: 0, ty: 0, tz: 0 };
const orbit = { ...ISO, _theta: ISO.theta, _phi: ISO.phi, _radius: ISO.radius, _zoom: SZ, _tx: 0, _ty: 0, _tz: 0 };
let cameraTransition = null, savedView = null;
let framing = 0;
function transitionCamera(target, duration = 1.05) {
  const start = {};
  ['theta','phi','zoom','tx','ty','tz'].forEach(key => { start[key] = orbit['_' + key]; });
  Object.assign(orbit, target);
  cameraTransition = { start, target: { ...start, ...target }, elapsed: 0, duration: DFNEffects.reduced() ? 0.12 : duration };
}
function advanceCamera(dt) {
  if (!cameraTransition) return;
  const tween = cameraTransition;
  tween.elapsed += dt;
  const p = Math.min(1, tween.elapsed / tween.duration);
  const ease = p * p * p * (p * (p * 6 - 15) + 10);
  Object.keys(tween.start).forEach(key => { orbit['_' + key] = THREE.MathUtils.lerp(tween.start[key],tween.target[key],ease); });
  if (p === 1) cameraTransition = null;
}

function applyOrbit() {
  const sp = Math.sin(orbit._phi), cp = Math.cos(orbit._phi);
  camera.position.set(
    orbit._tx + orbit._radius * sp * Math.sin(orbit._theta),
    orbit._ty + orbit._radius * cp,
    orbit._tz + orbit._radius * sp * Math.cos(orbit._theta)
  );
  camera.lookAt(orbit._tx, orbit._ty, orbit._tz);
  const a = W() / H();
  // Frame the object in the available space beside (or above) the inspector.
  const narrow = W() <= 720;
  const xBias = narrow ? 0 : framing * Math.min(360,W() * 0.32) / W() * orbit._zoom * a;
  const yBias = narrow ? -framing * orbit._zoom * 0.4 : 0;
  camera.left = -orbit._zoom * a + xBias; camera.right = orbit._zoom * a + xBias;
  camera.top = orbit._zoom + yBias; camera.bottom = -orbit._zoom + yBias;
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
/* Extra rim light for a techy neon edge in dark mode */
const rimLight = new THREE.DirectionalLight(0x00e5ff, theme === 'dark' ? 0.25 : 0);
rimLight.position.set(10, 6, -30); scene.add(rimLight);

/* ── Ground + faded grid ─────────────────────────────────── */
const grid = new THREE.GridHelper(180, 90, T().grid, T().grid);
grid.material.vertexColors = false;
grid.material.transparent = true;
grid.material.opacity = T().gridOpacity;
grid.position.y = 0.01;
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
    emissiveIntensity: T().glow ? T().baseEmissive : 0,
  });
  const edgeMat = new THREE.LineBasicMaterial({
    color: c.edge, transparent: true, opacity: T().edgeOpacity,
  });
  return { fillMat, edgeMat };
}

// Shared soft halo, tinted with each node's category color.
const haloCanvas = document.createElement('canvas');
haloCanvas.width = haloCanvas.height = 128;
const haloCtx = haloCanvas.getContext('2d');
const haloGradient = haloCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
haloGradient.addColorStop(0, 'rgba(255,255,255,0.65)');
haloGradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
haloGradient.addColorStop(0.7, 'rgba(255,255,255,0.08)');
haloGradient.addColorStop(1, 'rgba(255,255,255,0)');
haloCtx.fillStyle = haloGradient;
haloCtx.fillRect(0, 0, 128, 128);
const haloTexture = new THREE.CanvasTexture(haloCanvas);

function addNodeGlow(group, layerKey, side) {
  const material = new THREE.SpriteMaterial({
    map: haloTexture, color: LC(layerKey).edge,
    transparent: true, opacity: T().haloOpacity,
    blending: theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(material);
  halo.scale.set(side * 3, side * 3, 1);
  group.add(halo);
  group._glowRef = halo;
}

function box(layerKey, side = 2.2, opacity) {
  const geo = new THREE.BoxGeometry(side, side, side);
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
    m.material.emissiveIntensity = T().glow ? T().baseEmissive : 0;
    edges.material.color.setHex(c.edge);
    edges.material.opacity = T().edgeOpacity;
  };
  return g;
}

function dbBox(layerKey, side = 2.2) {
  const g = new THREE.Group();
  const slices = [];
  const gap = side * 0.035;
  const sliceHeight = (side - 2 * gap) / 3;
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BoxGeometry(side, sliceHeight, side);
    const { fillMat, edgeMat } = makeMats(layerKey);
    const mesh = new THREE.Mesh(geo, fillMat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.y = -side / 2 + sliceHeight / 2 + i * (sliceHeight + gap);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.y = mesh.position.y;
    g.add(mesh, edges);
    slices.push({ mesh, edges });
  }
  g._subMeshes = slices; g._layerKey = layerKey;
  g.userData.recolor = (lk) => {
    const c = LC(lk || g._layerKey);
    slices.forEach(({ mesh, edges }) => {
      mesh.material.color.setHex(c.fill);
      mesh.material.emissive.setHex(T().glow ? c.edge : 0x000000);
      mesh.material.emissiveIntensity = T().glow ? T().baseEmissive : 0;
      edges.material.color.setHex(c.edge);
      edges.material.opacity = T().edgeOpacity;
    });
  };
  return g;
}
function wideBox(layerKey, side) { return box(layerKey, side, 0.20); }

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
  connectionLines.push({ line, layerKey, baseColor: color, a, b });

  const mkDot = (pa, pb) => {
    const dmat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), dmat);
    dot.userData.anim = { pa: pa.clone(), pb: pb.clone(), a: pa === pts[0] ? a : b, b: pb === pts[1] ? b : a, t: Math.random(), speed: 0.27 + Math.random() * 0.27 };
    dot.userData.layerKey = layerKey;
    scene.add(dot); arrows.push(dot);
  };
  mkDot(pts[0], pts[1]);
  if (both) mkDot(pts[1], pts[0]);
}

/* ── Build from architecture.json ────────────────────────── */
let ARCH = null;
const nodeStates = {};

function buildFromArch(arch) {
  ARCH = arch;
  document.getElementById('hdr-sub').textContent = arch.meta.subtitle || arch.meta.name;
  document.getElementById('stat-nodes').textContent = arch.nodes.length;

  arch.nodes.forEach(n => {
    // Preserve each node's footprint width while enforcing a 1:1:1 envelope.
    const side = n.size?.w || 2.2;
    let group;
    if      (n.shape === 'db')   group = dbBox(n.layer, side);
    else if (n.shape === 'wide') group = wideBox(n.layer, side);
    else                         group = box(n.layer, side);
    addNodeGlow(group, n.layer, side);

    const y = side / 2;
    addNode(n.id, group, sx(n.x), y, sz(n.row), {
      label: n.label, sub: n.sub || '', h: side,
    });
    DFNEffects.createNode(group, side, LC(n.layer).edge);
    nodeStates[n.id] = { dim: 0, dimTarget: 0, hover: 0, selection: 0, burstAge: 10 };
  });
  document.getElementById('fp-switch').replaceChildren(...arch.nodes.map(n => {
    const option = document.createElement('option'); option.value = n.id; option.textContent = n.label;
    return option;
  }));

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
let hoveredNodeId = null, hoverProximity = 0;
let focusNodeId = null;
const selEnv = { current: 0, target: 0 }; // global 0→1 envelope

const focusPanel  = document.getElementById('focus-panel');

function selectNode(id) {
  if (!ARCH || !nodes[id]) return;
  if (!selectedNodeId && !cameraTransition?.returning) {
    savedView = {};
    ['theta','phi','zoom','tx','ty','tz'].forEach(key => { savedView[key] = orbit['_' + key]; });
    savedView.autoRot = autoRot;
  }
  autoRot = false;
  resumeAutoRotation = false;
  document.getElementById('btn-rot').classList.remove('active');
  selectedNodeId = id;
  focusNodeId = id;
  selEnv.target = 1;
  nodeStates[id].burstAge = 0;

  ARCH.nodes.forEach(n => {
    nodeStates[n.id].dimTarget = n.id === id ? 0 : 1;
  });

  // Smooth camera focus on node
  const nd = nodes[id];
  transitionCamera({ tx: nd.x, ty: nd.y, tz: nd.z, zoom: Math.max(8,Math.min(orbit._zoom,17)) });

  _showFocusPanel(id);
  document.body.classList.add('is-inspecting');
  document.getElementById('mlbl').textContent = 'Focus: ' + (ARCH.nodes.find(n => n.id === id)?.label || id);
}

function deselectNode() {
  if (!selectedNodeId) return;
  selectedNodeId = null;
  selEnv.target = 0;
  ARCH?.nodes.forEach(n => { if (nodeStates[n.id]) nodeStates[n.id].dimTarget = 0; });
  const returnView = savedView || ISO;
  const { autoRot: resumeRotation, ...target } = returnView;
  transitionCamera(target,0.9);
  cameraTransition.returning = true;
  // Resume automatic rotation only after the return animation completes.
  resumeAutoRotation = !!resumeRotation;
  _hideFocusPanel();
  document.body.classList.remove('is-inspecting');
  document.getElementById('mlbl').textContent = Math.abs(target.theta - ISO.theta) < 0.01 && Math.abs(target.phi - ISO.phi) < 0.01 ? 'Isometric' : 'Free';
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
  focusPanel.style.setProperty('--node-accent',edgeCSS);
  document.getElementById('fp-switch').value = id;

  const list = document.getElementById('fp-properties');
  const entries = [
    ['ID',nodeDef.id], ['Type',nodeDef.type || (nodeDef.shape === 'db' ? 'Database' : 'Service component')],
    ['Category',layerLabel], ['Geometry',nodeDef.shape === 'db' ? 'Three-tier cube' : 'Cube'],
    ['Dimensions',`${nodes[id].meta.h} × ${nodes[id].meta.h} × ${nodes[id].meta.h}`],
    ['Ratio','1 : 1 : 1'], ['Placement','Grounded'],
  ];
  const row = (key,value) => {
    const term = document.createElement('dt'); term.textContent = key;
    const detail = document.createElement('dd'); detail.textContent = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return [term,detail];
  };
  list.replaceChildren(...entries.flatMap(([key,value]) => row(key,value)));
  if (nodeDef.properties && typeof nodeDef.properties === 'object') {
    Object.entries(nodeDef.properties).forEach(([key,value]) => list.append(...row(key,value)));
  }

  const conns = ARCH.connections.filter(c => c.from === id || c.to === id);
  const connectionRows = conns.map(c => {
    const oid = c.from === id ? c.to : c.from;
    const button = document.createElement('button');
    button.className = 'fp-connection'; button.type = 'button';
    const name = document.createElement('span'); name.textContent = ARCH.nodes.find(n => n.id === oid)?.label || oid;
    const direction = document.createElement('small'); direction.textContent = c.both ? '↔ Bidirectional' : c.from === id ? '→ Outgoing' : '← Incoming';
    button.append(name,direction); button.addEventListener('click',() => selectNode(oid));
    return button;
  });
  document.getElementById('fp-connection-count').textContent = String(conns.length);
  const connList = document.getElementById('fp-connections');
  connList.replaceChildren(...connectionRows);
  if (!conns.length) connList.textContent = 'No connections defined.';
  const fillDetails = (container,value,emptyText) => {
    container.replaceChildren();
    if (value == null) { container.textContent = emptyText; return; }
    const pre = document.createElement('pre'); pre.textContent = typeof value === 'object' ? JSON.stringify(value,null,2) : String(value);
    container.append(pre);
  };
  fillDetails(document.getElementById('fp-config'),nodeDef.configuration ?? nodeDef.config,'No runtime configuration provided.');
  const known = new Set(['id','label','sub','layer','shape','size','x','row','desc','type','properties','configuration','config']);
  const extra = Object.fromEntries(Object.entries(nodeDef).filter(([key]) => !known.has(key)));
  extra.layout = { x: nodeDef.x, row: nodeDef.row, worldPosition: {x:nodes[id].x,y:nodes[id].y,z:nodes[id].z} };
  fillDetails(document.getElementById('fp-extra'),extra);
  document.getElementById('fp-extra-section').hidden = false;
  const content = document.getElementById('fp-content');
  content.getAnimations().forEach(animation => animation.cancel());
  if (!DFNEffects.reduced()) content.animate([{opacity:0.35,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'});

  focusPanel.classList.add('visible');
  focusPanel.inert = false;
  focusPanel.setAttribute('aria-hidden','false');
}
function _hideFocusPanel() {
  if (focusPanel.contains(document.activeElement)) document.getElementById('c').focus({preventScroll:true});
  focusPanel.classList.remove('visible');
  focusPanel.inert = true;
  focusPanel.setAttribute('aria-hidden','true');
}

/* Per-frame: lerp all materials + update CSS overlays */
function tickSelection(t,dt) {
  if (!ARCH) return;
  const sel = selectedNodeId;

  // Global envelope (0=idle, 1=focused)
  const ease = 1 - Math.exp(-dt * (DFNEffects.reduced() ? 35 : 7));
  selEnv.current += (selEnv.target - selEnv.current) * ease;
  const env = selEnv.current;

  // Slow breath for glow pulse (~10.8s period)
  const breath = DFNEffects.reduced() ? 0.5 : Math.sin(t * 1.8) * 0.5 + 0.5;

  ARCH.nodes.forEach(n => {
    const node = nodes[n.id]; if (!node) return;
    const st = nodeStates[n.id]; if (!st) return;
    st.dim += (st.dimTarget - st.dim) * ease;
    st.hover += ((hoveredNodeId === n.id ? 0.6 + hoverProximity * 0.4 : 0) - st.hover) * ease;
    st.selection += ((sel === n.id ? 1 : 0) - st.selection) * ease;
    st.burstAge += dt;

    const dim = st.dim;
    const lc = LC(n.layer);

    // Lerp fill color toward its own luminance-gray as it dims
    const fillTarget = lerpHex(lc.fill, toGray(lc.fill), dim * 0.88);
    const edgeTarget = lerpHex(lc.edge, toGray(lc.edge), dim * 0.88);
    const opacity    = Math.max(0.16, 1 - dim * 0.74);
    const edgeOp     = T().edgeOpacity * Math.max(0.12, 1 - dim * 0.78);

    // Emissive: selected node breathes, others fade to a low idle glow
    const active = Math.min(1,st.selection + st.hover * 0.55);
    const emissiveInt = T().baseEmissive * (1 - dim * 0.7) + active * (theme === 'dark' ? 0.42 + 0.08 * breath : 0.16);

    const applyMesh = (mesh, edges) => {
      mesh.material.color.setHex(fillTarget);
      mesh.material.opacity = opacity * (mesh.userData.baseOpacity ?? 1);
      mesh.material.emissive.setHex(T().glow ? lc.edge : 0x000000);
      mesh.material.emissiveIntensity = emissiveInt;
      edges.material.color.setHex(edgeTarget);
      edges.material.opacity = Math.min(1, edgeOp + active * 0.2);
    };

    const g = node.group;
    if (g._meshRef)   applyMesh(g._meshRef, g._edgesRef);
    if (g._subMeshes) g._subMeshes.forEach(({ mesh, edges }) => applyMesh(mesh, edges));
    if (g._glowRef) {
      g._glowRef.material.color.setHex(edgeTarget);
      g._glowRef.material.opacity = T().haloOpacity * (1 - dim * 0.85) * (0.75 + active * 0.45);
      g._glowRef.scale.set(g._effects.side * (2.3 + active * 0.45),g._effects.side * (2.3 + active * 0.45),1);
    }
    const scale = 1 + (DFNEffects.reduced() ? 0 : active * 0.016);
    if (Math.abs(g.scale.y-scale) > 0.0001) renderer.shadowMap.needsUpdate = true;
    g.scale.setScalar(scale);
    g.position.y = node.y * scale;
    DFNEffects.tickNode(g,st,t,edgeTarget,theme === 'dark');
  });

  // Connection lines & packet dots — dim when anything is selected
  connectionLines.forEach(({ line,a,b }) => {
    line.material.opacity = THREE.MathUtils.lerp(0.48,0.18,env);
    const p = line.geometry.attributes.position;
    p.setXYZ(0,a.group.position.x,a.group.position.y,a.group.position.z);
    p.setXYZ(1,b.group.position.x,b.group.position.y,b.group.position.z);
    p.needsUpdate = true;
  });
  arrows.forEach(d => { d.material.opacity = THREE.MathUtils.lerp(1,0.22,env); });

  // Label sprites — focused label stays bright, others dim
  labelSprites.forEach(entry => {
    const state = nodeStates[entry.nodeId];
    entry.sprite.material.opacity = 1 - state.dim * 0.7;
    const node = nodes[entry.nodeId];
    entry.sprite.position.y = node.meta.h * node.group.scale.y + 1.1;
  });
  if (!sel && env < 0.002) focusNodeId = null;
}

/* ── Theme system ────────────────────────────────────────── */
function applyThemeToScene() {
  const th = T();
  scene.background = new THREE.Color(th.bg);
  scene.fog.color.setHex(th.fog); scene.fog.density = th.fogDensity;
  grid.material.color.setHex(th.grid);
  grid.material.opacity = th.gridOpacity;
  gndMat.color.setHex(th.ground);
  ambientLight.color.setHex(th.ambient.color); ambientLight.intensity = th.ambient.intensity;
  sun.color.setHex(th.sun.color);              sun.intensity = th.sun.intensity;
  fillLight.color.setHex(th.fill.color);       fillLight.intensity = th.fill.intensity;
  rimLight.intensity = theme === 'dark' ? 0.25 : 0;

  if (ARCH) {
    ARCH.nodes.forEach(n => {
      const g = nodes[n.id].group;
      if (g.userData.recolor) g.userData.recolor(n.layer);
      if (g._glowRef) {
        g._glowRef.material.color.setHex(LC(n.layer).edge);
        g._glowRef.material.opacity = th.haloOpacity;
        g._glowRef.material.blending = theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
        g._glowRef.material.needsUpdate = true;
      }
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
  if (selectedNodeId) _showFocusPanel(selectedNodeId);
}
document.getElementById('theme-toggle').addEventListener('click',
  () => setTheme(theme === 'dark' ? 'light' : 'dark'));
document.getElementById('tt-icon').textContent  = theme === 'dark' ? '☾' : '☀';
document.getElementById('tt-label').textContent = theme === 'dark' ? 'Neon' : 'Cozy';

/* ── Pointer, touch, and keyboard interaction ─────────────── */
const canvasHost = document.getElementById('c');
const raycaster = new THREE.Raycaster();
const hoverMouse = new THREE.Vector2(-9999,-9999);
const tip = document.getElementById('tip');
const techCursor = new DFNEffects.Cursor();
const focusRenderer = new DFNEffects.FocusRenderer(renderer,scene,camera);
const pointerPositions = new Map();
let drag = null, pinchDistance = null;
let autoRot = false, autoAngle = orbit.theta, resumeAutoRotation = false;
let pointerOnScene = false, pointerX = 0, pointerY = 0;
let keyboardIndex = -1;
const hoverProjected = new THREE.Vector3();

function cancelCameraTransition() {
  if (!cameraTransition) return;
  ['theta','phi','zoom','tx','ty','tz'].forEach(key => { orbit[key] = orbit['_' + key]; });
  cameraTransition = null;
}
function hitAt(x,y) {
  raycaster.setFromCamera(new THREE.Vector2(x / W() * 2 - 1,-y / H() * 2 + 1),camera);
  return raycaster.intersectObjects(meshes,false)[0]?.object.userData.nodeId || null;
}
function updateHover() {
  hoveredNodeId = null;
  if (pointerOnScene && !drag) {
    raycaster.setFromCamera(hoverMouse,camera);
    hoveredNodeId = raycaster.intersectObjects(meshes,false)[0]?.object.userData.nodeId || null;
  }
  const node = hoveredNodeId && nodes[hoveredNodeId];
  if (node) {
    hoverProjected.copy(node.group.position).project(camera);
    const px = (hoverProjected.x + 1) * W() / 2, py = (1 - hoverProjected.y) * H() / 2;
    const radius = node.meta.h * H() / (2 * orbit._zoom);
    hoverProximity = 1 - Math.min(1,Math.hypot(pointerX-px,pointerY-py) / radius);
    const def = ARCH.nodes.find(n => n.id === hoveredNodeId);
    if (selectedNodeId !== hoveredNodeId) {
      document.getElementById('tname').textContent = def.label + (def.sub ? ' · ' + def.sub : '');
      document.getElementById('tdesc').textContent = def.desc || '';
      tip.style.display = 'block';
      tip.style.left = Math.max(8,Math.min(W()-tip.offsetWidth-8,pointerX+20)) + 'px';
      tip.style.top = Math.max(62,Math.min(H()-tip.offsetHeight-8,pointerY+20)) + 'px';
      return;
    }
  }
  tip.style.display = 'none';
}
window.addEventListener('pointermove',e => {
  pointerOnScene = e.pointerType !== 'touch' && canvasHost.contains(e.target);
  pointerX = e.clientX; pointerY = e.clientY;
  hoverMouse.set(e.clientX / W() * 2 - 1,-e.clientY / H() * 2 + 1);
});
canvasHost.addEventListener('pointerleave',() => { pointerOnScene = false; });
window.addEventListener('blur',() => {
  pointerOnScene = false; drag = null; pointerPositions.clear(); pinchDistance = null;
});
canvasHost.addEventListener('contextmenu',e => e.preventDefault());
canvasHost.addEventListener('pointerdown',e => {
  if (e.button !== 0 && e.button !== 2) return;
  canvasHost.setPointerCapture(e.pointerId);
  pointerPositions.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (pointerPositions.size > 1) { if (drag) drag.moved = true; pinchDistance = null; return; }
  drag = { id:e.pointerId, type:e.button === 2 ? 'pan' : 'orbit', x:e.clientX,y:e.clientY,
    startX:e.clientX,startY:e.clientY, moved:false, button:e.button };
});
canvasHost.addEventListener('pointermove',e => {
  if (!pointerPositions.has(e.pointerId) || !drag) return;
  pointerPositions.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (pointerPositions.size > 1) {
    const [a,b] = [...pointerPositions.values()];
    const distance = Math.hypot(a.x-b.x,a.y-b.y);
    cancelCameraTransition();
    if (pinchDistance && distance > 0) orbit.zoom = Math.max(7,Math.min(58,orbit.zoom * pinchDistance / distance));
    pinchDistance = distance; drag.moved = true;
    return;
  }
  if (e.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY) < 5) return;
  if (!drag.moved) {
    cancelCameraTransition(); autoRot = false; resumeAutoRotation = false;
    document.getElementById('btn-rot').classList.remove('active');
    document.getElementById('hint').classList.add('faded');
  }
  drag.moved = true;
  const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.type === 'orbit') {
    orbit.theta -= dx * 0.007;
    orbit.phi = Math.max(0.06,Math.min(Math.PI/2-0.02,orbit.phi-dy*0.005));
  } else {
    const speed = orbit._zoom * 0.0016;
    const right = new THREE.Vector3().crossVectors(camera.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(0,1,0)).normalize();
    const forward = new THREE.Vector3().crossVectors(right,new THREE.Vector3(0,1,0)).normalize();
    orbit.tx -= right.x*dx*speed-forward.x*dy*speed;
    orbit.tz -= right.z*dx*speed-forward.z*dy*speed;
  }
  if (!selectedNodeId) document.getElementById('mlbl').textContent = 'Free';
});
function endPointer(e) {
  const wasTap = drag && drag.id === e.pointerId && !drag.moved && drag.button === 0 && e.type !== 'pointercancel';
  pointerPositions.delete(e.pointerId);
  if (canvasHost.hasPointerCapture(e.pointerId)) canvasHost.releasePointerCapture(e.pointerId);
  if (wasTap) {
    const id = hitAt(e.clientX,e.clientY);
    if (id && id !== selectedNodeId) selectNode(id);
    else deselectNode();
  }
  if (!pointerPositions.size) { drag = null; pinchDistance = null; }
  else if (drag?.id === e.pointerId) {
    const [id,point] = pointerPositions.entries().next().value;
    drag = { id,type:'orbit',x:point.x,y:point.y,startX:point.x,startY:point.y,moved:true,button:0 };
    pinchDistance = null;
  }
}
canvasHost.addEventListener('pointerup',endPointer);
canvasHost.addEventListener('pointercancel',endPointer);
function changeZoom(delta) {
  cancelCameraTransition(); orbit.zoom = Math.max(7,Math.min(58,orbit.zoom+delta));
}
canvasHost.addEventListener('wheel',e => { e.preventDefault(); changeZoom(e.deltaY*0.022); },{passive:false});
document.getElementById('btn-zi').onclick = () => changeZoom(-4);
document.getElementById('btn-zo').onclick = () => changeZoom(4);
document.getElementById('btn-close').onclick = deselectNode;
document.getElementById('btn-deselect').onclick = deselectNode;
document.getElementById('fp-switch').onchange = e => selectNode(e.target.value);
document.getElementById('btn-iso').onclick = () => {
  deselectNode(); autoRot = false; resumeAutoRotation = false; savedView = null;
  document.getElementById('btn-rot').classList.remove('active');
  transitionCamera(ISO); document.getElementById('mlbl').textContent = 'Isometric';
};
document.getElementById('btn-rot').onclick = () => {
  cancelCameraTransition(); resumeAutoRotation = false;
  autoRot = !autoRot; autoAngle = orbit.theta;
  document.getElementById('btn-rot').classList.toggle('active',autoRot);
};
window.addEventListener('keydown',e => {
  if (e.key === 'Escape') { deselectNode(); return; }
  if (e.target !== canvasHost || !ARCH) return;
  if (['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)) {
    e.preventDefault();
    keyboardIndex = (keyboardIndex + (['ArrowLeft','ArrowUp'].includes(e.key) ? -1 : 1) + ARCH.nodes.length) % ARCH.nodes.length;
    selectNode(ARCH.nodes[keyboardIndex].id);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); selectNode(ARCH.nodes[Math.max(0,keyboardIndex)].id);
  }
});
window.addEventListener('resize',() => {
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setSize(W(),H()); focusRenderer.resize(); applyOrbit();
});

/* ── Animate loop ────────────────────────────────────────── */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05,clock.getDelta()), t = clock.elapsedTime;

  if (autoRot) { autoAngle += dt * 0.18; orbit.theta = autoAngle; }

  framing += ((selectedNodeId ? 1 : 0) - framing) * (1 - Math.exp(-dt * 6));
  if (cameraTransition) advanceCamera(dt);
  else {
    const ease = 1 - Math.exp(-dt * 9);
    ['theta','phi','zoom','tx','ty','tz'].forEach(key => { orbit['_' + key] += (orbit[key]-orbit['_' + key]) * ease; });
    if (resumeAutoRotation) {
      autoRot = true; autoAngle = orbit.theta; resumeAutoRotation = false;
      document.getElementById('btn-rot').classList.add('active');
    }
  }
  applyOrbit();
  scene.updateMatrixWorld(true);
  updateHover();
  tickSelection(t,dt);
  arrows.forEach(dot => {
    const packet = dot.userData.anim;
    if (!DFNEffects.reduced()) packet.t = (packet.t + dt * packet.speed) % 1;
    dot.position.lerpVectors(packet.a.group.position,packet.b.group.position,packet.t);
  });
  const activeId = hoveredNodeId || selectedNodeId;
  const cursorColor = activeId ? '#' + LC(nodes[activeId].group._layerKey).edge.toString(16).padStart(6,'0') : (theme === 'dark' ? '#00e5ff' : '#006472');
  techCursor.tick(dt,hoveredNodeId,cursorColor,!!drag?.moved);
  const focused = focusNodeId && nodes[focusNodeId].group;
  const focusedLabel = labelSprites.find(entry => entry.nodeId === focusNodeId)?.sprite;
  focusRenderer.render(selEnv.current,focused,focusedLabel,theme === 'dark' ? 0.22 : 0.015);
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
