(() => {
'use strict';
const DEFAULT_TEXT = window.NETWORK_CONFIG.text;
const STORE = 'text-network:' + document.title;
const $ = id => document.getElementById(id);

/* ------------------------------------------------------------------ state */
let nodes = [], edges = [];      // node: {id,label,kind,w,count,snips,mesh,glow,el,deg,r,pinned,v,born}
let selected = null, alpha = 1, edgesBorn = 0;
const byId = new Map();

const KIND = {
  core:  { name:'Central', color:0xfff3dc, glow:0xf2d27e, gop:1.0 },
  theme: { name:'Orbital', color:0x8cc4ee, glow:0x1d4a8c, gop:.35 },
  meta:  { name:'Meta',      color:0xd86c1a, glow:0xe57a24, gop:.85 }     // orange, shared with linked themes
};

/* ------------------------------------------------------------ three setup */
const BG = 0x05060a;
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
const PR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const dom = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.0026);
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 4000);
camera.position.set(0, 25, 150);

let composer = null, bloom = null;
if (THREE.EffectComposer && THREE.UnrealBloomPass) {
  composer = new THREE.EffectComposer(renderer);
  composer.setPixelRatio(PR);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.6, 0.18);
  composer.addPass(bloom);
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64,64,0,64,64,64);
  r.addColorStop(0,'rgba(255,255,255,1)');
  r.addColorStop(.16,'rgba(255,250,236,.85)');
  r.addColorStop(.38,'rgba(232,198,124,.26)');
  r.addColorStop(1,'rgba(217,182,106,0)');
  g.fillStyle = r; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
const SPHERE = new THREE.SphereGeometry(1, 24, 16);
// procedural earth-like skin. Blue orbitals: continents (about 47% of the surface), stretched, with fingers and sometimes a ring
// with ocean in the middle; green areas inside each continent: 1 or 2 large meandering ones, 3 to 8 small and up to 6 tiny meanders;
// pole regions (visible with 75% each) with holes, and rarely a light-grey meander on the rim. Hidden pole regions still keep the
// continents away. Red orbitals (meta-linked): smaller grey land (about 28%), no green, no ice. Continents never touch the poles or
// each other; the gap is measured between the real outlines. Each pixel is exactly one colour. Each orbital has its own layout
// (seeded by its id); maps are cached.
const BLUE_SEA = '#1d4c7e', RED_SEA = '#65231d';
const earthCache = new Map();
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function earthTexture(seedText, sea, red) {
  const key = seedText + '|' + sea;
  if (earthCache.has(key)) return earthCache.get(key);
  const W = 2560, H = 1280;
  let seed = 0; for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  seed = seed || 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mask = () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return g;
  };
  const landG = mask(), greenG = mask(), iceG = mask(), frostG = mask();
  // non-convex outline: stretched, with fingers
  const shape = (cx, cy, R) => {
    const N = 90 + Math.floor(rnd() * 40), p = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const theta = rnd() * Math.PI, aspect = 1 + rnd() * 1.2;
    const fingers = Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({ ph: rnd() * 6.28, f: 0.35 + 0.5 * rnd(), sg: 0.05 + 0.08 * rnd() }));
    const ct = Math.cos(theta), st = Math.sin(theta), sa = Math.sqrt(aspect);
    const pts = [];
    for (let j = 0; j < N; j++) {
      const ang = j * 2 * Math.PI / N;
      let rr = 1 + 0.16 * Math.sin(3 * ang + p[0]) + 0.1 * Math.sin(5 * ang + p[1]) + 0.08 * Math.sin(11 * ang + p[2]) + 0.12 * (rnd() - 0.5);
      for (const fg of fingers) { const d = Math.atan2(Math.sin(ang - fg.ph), Math.cos(ang - fg.ph)); rr += fg.f * Math.exp(-d * d / (2 * fg.sg * fg.sg)); }
      const u = Math.cos(ang) * rr * R * sa, v = Math.sin(ang) * rr * R / sa;   // stretched, area kept
      pts.push([cx + u * ct - v * st, cy + u * st + v * ct]);
    }
    return pts;
  };
  const fillPoly = (g, pts, col = '#fff') => {
    g.fillStyle = col;
    for (const dx of [-W, 0, W]) {                              // wrap around the seam
      g.beginPath();
      pts.forEach(([x, y], j) => (j ? g.lineTo(x + dx, y) : g.moveTo(x + dx, y)));
      g.closePath(); g.fill();
    }
  };
  const strokeLine = (g, pts, width, col = '#fff') => {        // a meandering strip
    g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const dx of [-W, 0, W]) {
      g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x + dx, y) : g.moveTo(x + dx, y))); g.stroke();
    }
  };
  const meander = (x0, y0, half, phi, waves, amp) => {         // a sinusoidal path through (x0, y0)
    const path = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28, along = (t - 0.5) * half * 2, across = amp * Math.sin(t * waves * 2 * Math.PI);
      path.push([x0 + along * Math.cos(phi) - across * Math.sin(phi), y0 + along * Math.sin(phi) + across * Math.cos(phi)]);
    }
    return path;
  };
  // smallest gap between two outlines (vertex to vertex, wrapping in longitude)
  const polyGap = (A, B) => {
    let best = Infinity;
    for (const [ax, ay] of A) for (const [bx, by] of B) {
      const dx = Math.min(Math.abs(ax - bx), W - Math.abs(ax - bx)), d = Math.hypot(dx, ay - by);
      if (d < best) best = d;
    }
    return best;
  };
  const placed = [];
  const apart = pts => placed.every(q => polyGap(pts, q.pts) > 22);
  const browns = red ? ['#434343', '#4c4c4c', '#3a3a3a'] : ['#4a3620', '#543e1d', '#413017'];
  const brown = hexRGB(browns[Math.floor(rnd() * browns.length)]), green = hexRGB('#0a4214'), seaRGB = hexRGB(sea), ice = hexRGB('#eef5fb'), frost = hexRGB('#c8d2dc');
  const masses = 2 + Math.floor(rnd() * 3);
  const area = (red ? 0.28 : 0.47) * W * H / masses;
  if (!red) {                                                    // both pole regions are placed; each is visible with 75%
    ['n', 's'].forEach(p => {
      const R = H * (0.22 + 0.1 * rnd()), cx = rnd() * W;
      const cy = p === 'n' ? H * 0.02 * rnd() : H - H * 0.02 * rnd();
      placed.push({ cx, cy, R, pts: shape(cx, cy, R) });
    });
    placed.forEach(q => {
      if (rnd() >= 0.75) return;                                 // hidden: placed, but not drawn
      fillPoly(iceG, q.pts);
      const holes = rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 3);   // 0 to 3 holes, ring-like
      for (let h = 0; h < holes; h++) fillPoly(iceG, shape(q.cx + (rnd() - 0.5) * q.R * 1.1, q.cy + (rnd() - 0.5) * q.R * 0.9, q.R * (0.12 + 0.1 * rnd())), '#000');
      if (rnd() < 0.2) {                                         // rarely: a light-grey meander on the rim, away from the pole
        const ang = rnd() * 6.28, dist = q.R * (0.9 + 0.3 * rnd());
        strokeLine(frostG, meander(q.cx + Math.cos(ang) * dist, q.cy + Math.sin(ang) * dist, q.R * (0.15 + 0.1 * rnd()), ang + Math.PI / 2, 1 + Math.floor(rnd() * 2), q.R * 0.06), q.R * 0.04, '#fff');
      }
    });
  }
  for (let m = 0; m < masses; m++) {
    let R = Math.sqrt(area / Math.PI) * (0.95 + 0.1 * rnd()), cx = 0, cy = 0, pts = null, ok = false;
    for (let tries = 0; tries < 240 && !ok; tries++) {
      if (tries % 40 === 39) R *= 0.95;                          // shrink only slightly when the space is crowded
      cx = rnd() * W; cy = H * (0.2 + 0.6 * rnd());
      pts = shape(cx, cy, R);
      ok = apart(pts);
    }
    if (!ok) continue;
    placed.push({ cx, cy, R, pts });
    fillPoly(landG, pts);
    if (rnd() < 0.35) {                                          // a ring: ocean shining in the middle
      const lr = R * (0.3 + 0.15 * rnd());
      fillPoly(landG, shape(cx + (rnd() - 0.5) * R * 0.2, cy + (rnd() - 0.5) * R * 0.2, lr), '#000');
    }
    if (red) continue;
    const specs = [];                                            // 1 or 2 large, 3 to 8 small, up to 6 tiny green meanders
    for (let i = 0, nb = 1 + Math.floor(rnd() * 2); i < nb; i++) specs.push('big');
    for (let i = 0, ns = 3 + Math.floor(rnd() * 6); i < ns; i++) specs.push('small');
    for (let i = 0, nt = Math.floor(rnd() * 7); i < nt; i++) specs.push('tiny');
    const gPlaced = [];
    for (const kind of specs) {
      const size = kind === 'big' ? R * (0.35 + 0.2 * rnd()) : kind === 'small' ? R * (0.12 + 0.1 * rnd()) : R * (0.05 + 0.05 * rnd());
      const width = kind === 'big' ? R * 0.22 : kind === 'small' ? R * 0.12 : R * 0.06;
      const rg = size + width;
      let gx = 0, gy = 0, gok = false;
      for (let tries = 0; tries < 60 && !gok; tries++) {
        gx = cx + (rnd() * 2 - 1) * R * 0.7; gy = cy + (rnd() * 2 - 1) * R * 0.7;
        gok = gPlaced.every(q => Math.hypot(gx - q.x, gy - q.y) > rg + q.r + 10);
      }
      if (!gok) continue;
      gPlaced.push({ x: gx, y: gy, r: rg });
      const waves = kind === 'big' ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);
      strokeLine(greenG, meander(gx, gy, size, rnd() * 6.28, waves, size * (kind === 'big' ? 0.3 : 0.2)), width);
    }
  }
  const L = landG.getImageData(0, 0, W, H).data, G = greenG.getImageData(0, 0, W, H).data, I = iceG.getImageData(0, 0, W, H).data, F = frostG.getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d'), img = og.createImageData(W, H), O = img.data;
  for (let p = 0; p < O.length; p += 4) {
    const col = F[p] > 127 ? frost : I[p] > 127 ? ice : L[p] > 127 ? (G[p] > 127 ? green : brown) : seaRGB;
    O[p] = col[0]; O[p + 1] = col[1]; O[p + 2] = col[2]; O[p + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out); tex.anisotropy = 4;
  earthCache.set(key, tex);
  return tex;
}
const EARTH_GEO = new THREE.SphereGeometry(1, 48, 32);   // finer geometry for the orbital skins
const OCTA = new THREE.OctahedronGeometry(1.25, 0);
const BAR_GEO = new THREE.CylinderGeometry(0.6, 0.6, 1, 8);   // unit-height cylinder, stretched to each link
const BAR_COLOR = 0xb3381a;                                    // Meta-Central links: thicker, closer to red

function starLayer(count, rMin, rMax, size, opacity) {
  const pos = new Float32Array(count*3), col = new Float32Array(count*3);
  for (let i=0;i<count;i++){
    const u=Math.random()*2-1, t=Math.random()*Math.PI*2, s=Math.sqrt(1-u*u);
    const r=rMin+Math.random()*(rMax-rMin);
    pos.set([r*s*Math.cos(t), r*u, r*s*Math.sin(t)], i*3);
    const warm=Math.random()<.22, b=.45+Math.random()*.55;
    col.set(warm?[b,b*.86,b*.55]:[b,b,b*.96], i*3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    size, sizeAttenuation:false, vertexColors:true, transparent:true, opacity,
    depthWrite:false, fog:false, map:GLOW, blending:THREE.AdditiveBlending}));
}
const stars = [starLayer(1800, 500, 1400, 3.2, .55), starLayer(500, 400, 900, 6, .35)];
stars.forEach(s => scene.add(s));

/* ------------------------------------------------------------ graph objects */
const labelsEl = $('labels');
let lines = null;

function createNode(d, idx, pos) {
  const k = KIND[d.kind] || KIND.theme, core = !!d.core;
  const mesh = d.kind === 'theme'
    ? new THREE.Mesh(EARTH_GEO, new THREE.MeshBasicMaterial({ map: earthTexture(d.id, BLUE_SEA, false), transparent: true, opacity: 0.98 }))
    : new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: k.color, transparent: d.kind === 'core', opacity: d.kind === 'core' ? 0.4 : 1 }));
  if (d.kind === 'theme') { const inner = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: 0x1d4a8c, transparent: true, opacity: 0.2 })); inner.scale.setScalar(0.5); mesh.add(inner); mesh.userData.inner = inner; }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map:GLOW, color:k.glow, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:k.gop}));
  mesh.add(glow);
  if (d.kind === 'theme') mesh.userData.spin = { axis: new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize(), rate: (0.0015 + Math.random() * 0.002) * 0.2881 };
  mesh.position.copy(pos);
  const el = document.createElement('div'); el.className = 'label k-' + d.kind + (core ? ' core' : ''); el.textContent = d.label;
  labelsEl.appendChild(el);
  const n = {id:d.id, label:d.label, full:d.full||d.label, desc:d.desc||'', essay:d.essay||'', summary:d.summary||'', kind:d.kind, core, unknown:!!d.unknown, w:d.w ?? .5, count:d.count || 1, occ:d.occ || [],
             mesh, glow, el, r:1, m: core ? 2 : 1, cl:d.id, metaLinked:false, pinned:false, v:new THREE.Vector3(), v0:new THREE.Vector3(), born:performance.now() + idx*60};
  mesh.userData.node = n;
  scene.add(mesh); nodes.push(n); byId.set(n.id, n);
  return n;
}
function disposeNode(n) {
  scene.remove(n.mesh); n.mesh.material.dispose(); n.glow.material.dispose(); n.el.remove();
}
function refreshAppearance() {
  nodes.forEach(n => {
    const k = KIND[n.kind] || KIND.theme;
    n.r = n.core ? (2.91 + 1.64*n.w) * 0.6 : 1.32 + 1.21*n.w;   // Central/Meta at 60% of their former size
    n.rDraw = n.kind === 'core' ? n.r * 0.7 : n.core ? n.r : n.r * 0.4;   // Central at 70%, Meta as is, Orbital at 40%                          // Orbital sphere drawn at 40%; labels and forces keep n.r            // Core and Meta share one size; Themes are smaller
    const mo = n.kind === 'theme' && n.metaLinked;
    if (n.kind === 'theme') { n.mesh.material.map = earthTexture(n.id, mo ? RED_SEA : BLUE_SEA, mo); n.mesh.material.needsUpdate = true; n.mesh.userData.inner.material.color.set(mo ? 0x7a1c18 : 0x1d4a8c); }
    else n.mesh.material.color.set(k.color);
    n.glow.material.color.set(mo ? 0x7a1c18 : k.glow);   // selection changes no colours
    n.el.classList.toggle('mlink', !!mo);
    n.el.classList.toggle('sel', n === selected);
  });
}
function rebuildEdges() {
  if (lines) { scene.remove(lines); lines.geometry.dispose(); lines.material.dispose(); }
  const cap = Math.max(edges.length, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap*6), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap*6), 3));
  g.setDrawRange(0, edges.length*2);
  lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    vertexColors:true, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending}));
  lines.frustumCulled = false;
  scene.add(lines);
  recolorEdges();
}
function recolorEdges() {
  if (!lines) return;
  const c = lines.geometry.attributes.color.array;
  edges.forEach((e, i) => {
    const hot = false, bridge = e.type === 'bridge';
    const orange = e.a.kind === 'meta' || e.b.kind === 'meta';
    c.set(hot ? [1,.84,.5] : orange ? [.78,.43,.16] : bridge ? [.92,.92,.92] : [.50,.49,.46], i*6);      // near-white end
    c.set(hot ? [1,.76,.36] : orange ? [.78,.43,.16] : bridge ? [.92,.92,.92] : [.52,.47,.34], i*6+3);   // hint of gold at the other end
  });
  lines.geometry.attributes.color.needsUpdate = true;
}

const VIEW_DIR = new THREE.Vector3(0.18, 0.28, 1).normalize();   // default viewing direction
function recentre() {                                           // keep the constellation's centre of mass at the origin
  if (!nodes.length) return;
  const c = new THREE.Vector3();
  nodes.forEach(n => c.add(n.mesh.position));
  c.multiplyScalar(1 / nodes.length);
  c.y = 0;                                                     // heights are kept: the Central plane stays put
  nodes.forEach(n => n.mesh.position.sub(c));
}
let viewZoom = 1;
let viewSpin = 0;
let viewShift = 0;                                       // horizontal view shift (fraction of the width); -0.1 puts the clicked node at 60%
const FOCUS_SHIFT = -0.1;
function applyViewShift() {
  if (Math.abs(viewShift) > 1e-6) camera.setViewOffset(innerWidth, innerHeight, viewShift * innerWidth, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
}                                        // start angle around the centre (as if spun before)
function spinBy(pos, centre, a) {                        // rotate a position around the vertical axis, in the Spin button's direction
  const sph = new THREE.Spherical().setFromVector3(pos.clone().sub(centre));
  sph.theta -= a;
  return centre.clone().add(new THREE.Vector3().setFromSpherical(sph));
}                                       // start-distance factor of the text being shown
let savedView = null;
let viewUnit = 1;                                           // reference distance: the start-view distance scale
const VIEW_ZOOM = 1.1 * 0.95;                               // zoom factor applied to every camera spot
const viewCentre = new THREE.Vector3();                     // the single centre of mass the camera orbits and looks at
let flight = null;                                          // active camera move to a clicked node                                 // node positions and camera as they were when the view was framed
function saveView() {
  savedView = nodes.map(n => ({ n, p: n.mesh.position.clone() }));
  controls.saveState();
}
function cancelFlight() {
  if (!flight) return;
  controls.autoRotate = flight.wasSpin;
  flight = null;
}
// Where the camera stands to look at a node: on the centre -> node line, behind the node, so the node
// is centred and most of the constellation is still visible (the same rule as the start view).
function spotFor(n) {
  const c = viewCentre;
  const off = n.mesh.position.clone().sub(c), m = off.length();
  const dir = m > 1e-3 ? off.clone().divideScalar(m) : VIEW_DIR.clone();
  const Dfocus = pickDistance(c, dir, m) * VIEW_ZOOM;
  const f = n.kind === 'theme' ? 0.15 : 0.5;                 // Orbital: much closer; Central and Meta: slightly further
  return c.clone().addScaledVector(dir, m + f * (Dfocus - m));
}
function focusNode(n) {
  if (!n) return;
  cancelFlight();
  const from = camera.position.clone(), to = spotFor(n);     // the destination is fixed when the flight starts
  const angle = from.clone().sub(viewCentre).angleTo(to.clone().sub(viewCentre));
  const omega = (2 * Math.PI / 60) * 5.24 * 1.4 * 0.85;             // flight speed: 140% of the previous, independent of the spin buttons
  const duration = Math.max(0.59, angle / omega);
  const fwd0 = controls.target.clone().sub(from).normalize();
  flight = { node: n, from, to, t0: performance.now(), duration, wasSpin: false, fwd0, shFrom: viewShift };
  applySpin('off');
}
function updateFlight(now) {
  if (!flight) return;
  const t = Math.min(1, (now - flight.t0) / (flight.duration * 1000));
  const s = t * t * t * (t * (6 * t - 15) + 10);              // smootherstep: no jerk at either end
  const to = flight.to;
  camera.position.lerpVectors(flight.from, to, s);
  // the view keeps its direction until 60% of the way, then turns: fast ramp-up to full rotation speed, then easing off
  const wv = Math.min(1, Math.max(0, (t - 0.4) / 0.55)), w = wv * wv * wv * (wv * (6 * wv - 15) + 10);   // smootherstep
  const fEnd = viewCentre.clone().sub(to).normalize();
  const f = flight.fwd0.clone().lerp(fEnd, w).normalize();
  viewShift = flight.shFrom + (FOCUS_SHIFT - flight.shFrom) * s;
  controls.target.copy(camera.position).addScaledVector(f, viewCentre.distanceTo(to));
  if (t >= 1) { controls.target.copy(viewCentre); controls.autoRotate = flight.wasSpin; flight = null; }
}
function resetView() {
  viewShift = 0;
  cancelFlight();
  if (!savedView) { fitView(); return; }
  savedView.forEach(({ n, p }) => { n.mesh.position.copy(p); n.v.set(0, 0, 0); n.pinned = false; });
  alpha = 0;                                                  // the layout is exactly as saved, so it stays still
  controls.reset();                                           // back to the saved camera position and target
  prevDir.copy(camera.position).sub(controls.target).normalize();
}
// Fraction of the nodes that a camera at 'eye' looking at 'look' can see.
function visibleShare(eye, look) {
  const savedPos = camera.position.clone(), savedQuat = camera.quaternion.clone();
  camera.position.copy(eye); camera.lookAt(look); camera.updateMatrixWorld();
  const p = new THREE.Vector3();
  let seen = 0;
  nodes.forEach(n => {
    p.copy(n.mesh.position).project(camera);
    if (p.z < 1 && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95) seen++;
  });
  camera.position.copy(savedPos); camera.quaternion.copy(savedQuat); camera.updateMatrixWorld();
  return seen / Math.max(1, nodes.length);
}
// Distance from the centre at which a camera stands on the ray 'dir' from the centre, behind a node
// that sits 'm' away from the centre. It starts at the start-view rule and only moves further back
// if too few nodes would be visible from there.
function pickDistance(c, dir, m) {
  const minD = controls.minDistance + 5;
  let D = Math.max(0.4 * viewUnit, m + 0.15 * viewUnit, minD);
  for (let k = 0; k < 12; k++) {
    if (visibleShare(c.clone().addScaledVector(dir, D), c) >= 0.8) break;
    D += 0.05 * viewUnit;
  }
  return D;
}
// Start camera: 80 degrees from the vertical apex (above the Meta node), looking at cm. Its azimuth follows the Meta
// node. If the Meta node would then sit above 80% of the screen height, the camera moves back just far enough.
function startPose(cm, M, Dc0) {
  const worldUp = new THREE.Vector3(0, 1, 0), polar = 80 * Math.PI / 180, target = 0.6;   // 0.6 = 80% up the screen
  const base = M.clone().sub(cm);
  const az = Math.hypot(base.x, base.z) > 1e-3 ? Math.atan2(base.z, base.x) : 0;
  const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const at = Dc => cm.clone().add(new THREE.Vector3(Math.sin(polar) * Math.cos(az), Math.cos(polar), Math.sin(polar) * Math.sin(az)).multiplyScalar(Dc));
  const ndcOf = P => {
    const f = cm.clone().sub(P).normalize();
    const up = worldUp.clone().addScaledVector(f, -worldUp.dot(f)).normalize();
    const w = M.clone().sub(P);
    if (w.dot(f) <= 0) return Infinity;                  // Meta behind the camera
    return Math.tan(Math.atan2(w.dot(up), w.dot(f))) / Math.tan(vHalf);
  };
  let Dc = Dc0;
  for (let k = 0; k < 200 && ndcOf(at(Dc)) > target; k++) Dc *= 1.01;
  return at(Dc);
}
function fitView() {
  viewShift = 0;
  if (!nodes.length) return;
  const c = new THREE.Vector3();                                // centre of mass of all nodes
  nodes.forEach(n => c.add(n.mesh.position));
  c.multiplyScalar(1 / nodes.length);
  let R = 0;                                                    // radius of the sphere that holds every node
  nodes.forEach(n => { R = Math.max(R, n.mesh.position.distanceTo(c) + n.r * 1.2); });
  const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const half = Math.min(vHalf, Math.atan(Math.tan(vHalf) * camera.aspect));
  viewUnit = Math.max(R * 1.04 / Math.sin(half), 40);          // the tight distance used before
  let dir = VIEW_DIR.clone(), m = 0;
  const meta = nodes.find(n => n.kind === 'meta');
  if (meta) {                                                    // start view: centre -> Meta line, Meta centred
    const off = meta.mesh.position.clone().sub(c);
    m = off.length();
    if (m > 1e-3) dir = off.normalize();
  }
  const D = pickDistance(c, dir, m) * VIEW_ZOOM;
  viewCentre.copy(c);
  // look point: centre of mass of the Central and Meta nodes; Meta appears 70% up the screen, horizontally centred
  const hubs = nodes.filter(n => n.core), cm = new THREE.Vector3();
  hubs.forEach(n => cm.add(n.mesh.position));
  if (hubs.length) cm.multiplyScalar(1 / hubs.length);
  const Dc = 1.15 * D * viewZoom;                 // viewZoom: per-text start distance (1.05 for the Addiction text)
  const pose = meta ? startPose(cm, meta.mesh.position, Dc) : cm.clone().addScaledVector(dir, Dc);
  controls.target.copy(cm);
  camera.position.copy(viewSpin ? spinBy(pose, cm, viewSpin) : pose);
  camera.lookAt(cm);
  controls.update();
  prevDir.copy(camera.position).sub(controls.target).normalize();
}

const HUB_REST = 27;
const BRIDGE_REST = 34;            // rest length of Central-Meta links, calibrated so their visible length is unchanged                 // typical distance of two linked Central/Meta nodes (70% of the old 38)
const HUB_PULL = 0.015;              // weak pull that keeps unlinked Central/Meta nodes in a compact group
const hubLinks = new Set();
let hubList = [];
const hubKey = (a, b) => a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
// Positions for K Central/Meta nodes: a point, a segment, a triangle or a tetrahedron, all with edge length d,
// so the group is as compact as possible and centred on the origin.
function hubLayout(K, d) {
  if (K <= 1) return [new THREE.Vector3()];
  if (K > 4) return Array.from({ length: K }, (_, k) => sphereDir(k, K).multiplyScalar(d * 0.9));
  if (K === 2) return [new THREE.Vector3(-d / 2, 0, 0), new THREE.Vector3(d / 2, 0, 0)];
  if (K === 3) {
    const r = d / Math.sqrt(3);
    return [0, 1, 2].map(i => new THREE.Vector3(r * Math.cos(i * 2 * Math.PI / 3), 0, r * Math.sin(i * 2 * Math.PI / 3)));
  }
  const k = d / (2 * Math.SQRT2);
  return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].slice(0, K)
    .map(([x, y, z]) => new THREE.Vector3(x * k, y * k, z * k));
}
// k-th of n directions spread evenly over a sphere (Fibonacci sphere)
function sphereDir(k, n) {
  const y = 1 - 2 * (k + 0.5) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), th = k * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(r * Math.cos(th), y, r * Math.sin(th));
}
// Central-to-Meta links much longer than the average are shortened a little (only those, and only partly).
function calibrateMetaLinks() {
  const ml = edges.filter(e => e.type === 'bridge' && (e.a.kind === 'meta' || e.b.kind === 'meta'));
  if (ml.length < 2) return;
  const len = e => e.a.mesh.position.distanceTo(e.b.mesh.position);
  const mean = ml.reduce((s, e) => s + len(e), 0) / ml.length;
  let changed = false;
  ml.forEach(e => { const L = len(e); if (L > 1.1 * mean) { e.rest -= 0.5 * (L - mean) / 0.74; changed = true; } });
  if (!changed) return;
  alpha = 1;
  for (let i = 0; i < 3000 && alpha > 0; i++) simulate();
}
function loadGraph(g) {
  nodes.forEach(disposeNode); nodes = []; edges = []; byId.clear(); selected = null;
  const hubs = g.nodes.filter(n => n.core), hubPos = new Map(), hubOf = new Map();
  const cents = hubs.filter(h => h.kind !== 'meta'), RING = 11, META_H = 12;   // Central ring in one plane, Meta above its centre
  cents.forEach((c, i) => {
    const a = cents.length === 1 ? 0 : i * 2 * Math.PI / cents.length + .4;
    hubPos.set(c.id, new THREE.Vector3(cents.length === 1 ? 0 : RING * Math.cos(a), 0, cents.length === 1 ? 0 : RING * Math.sin(a)));
  });
  hubs.filter(h => h.kind === 'meta').forEach(h => hubPos.set(h.id, new THREE.Vector3(0, META_H, 0)));
  g.edges.forEach(([a, b, type]) => { if (type === 'spoke') hubOf.set(a, b); });
  const sibSeen = new Map(), sibTotal = new Map();              // siblings of one centre, for an even spread
  g.edges.forEach(([a, b, type]) => { if (type === 'spoke') sibTotal.set(b, (sibTotal.get(b) || 0) + 1); });
  g.nodes.forEach((d, i) => {
    let pos;
    if (d.core) pos = hubPos.get(d.id).clone();
    else {
      const h = hubPos.get(hubOf.get(d.id)) || new THREE.Vector3();
      const t = Math.random()*Math.PI*2, u = Math.random()*2-1, s = Math.sqrt(1-u*u);
      const hid = hubOf.get(d.id), k = sibSeen.get(hid) || 0;
      sibSeen.set(hid, k + 1);
      pos = h.clone().add(sphereDir(k, sibTotal.get(hid) || 1).multiplyScalar(21));
    }
    const n = createNode(d, i, pos);
    if (!d.core) n.cl = hubOf.get(d.id);              // cluster = the centroid a theme belongs to
  });
  g.edges.forEach(([a, b, type]) => {
    const A = byId.get(a), B = byId.get(b); if (!A || !B || A === B) return;
    if (type === 'bridge') { const viaMeta = A.kind === 'meta' || B.kind === 'meta'; edges.push({a:A, b:B, type, rest:BRIDGE_REST, k:.5, hidden: !viaMeta, bar: false}); }          // very long: centroids stay far apart
    else { if (B.kind === 'meta') A.metaLinked = true; const sat = A.core ? B : A; edges.push({a:A, b:B, type:'spoke', rest:12, k:1.5}); }
  });                                                                               // less important = a bit farther out
  const metaLinked = new Set();                                   // centrals that have a link to the Meta node
  edges.forEach(e => { if (e.type === 'bridge' && (e.a.kind === 'meta' || e.b.kind === 'meta')) { metaLinked.add(e.a); metaLinked.add(e.b); } });
  edges.forEach(e => { if (e.type === 'bridge' && e.a.kind !== 'meta' && e.b.kind !== 'meta') e.hidden = metaLinked.has(e.a) && metaLinked.has(e.b); });
  hubList = nodes.filter(n => n.core);
  hubLinks.clear();
  edges.forEach(e => { if (e.type === 'bridge') hubLinks.add(hubKey(e.a, e.b)); });
  refreshAppearance(); rebuildEdges(); rebuildBars(); renderCard();
  edgesBorn = performance.now();
  alpha = 1;
  for (let i = 0; i < 400; i++) { simulate(); if (i < 260) alpha = Math.max(alpha, .8); }   // pre-settle
  for (let i = 0; i < 3000 && alpha > 0; i++) simulate();    // cool completely before framing
  calibrateMetaLinks();
  recentre();
  fitView();
  saveView();
}

/* ------------------------------------------------------------ selection card */
function select(n) {
  selected = n; refreshAppearance(); recolorEdges(); renderCard();
}
function renderCard() {
  const c = $('card'); c.textContent = '';
  if (!selected) { c.classList.remove('open'); return; }
  c.classList.add('open');
  const k = document.createElement('div'); k.className = 'kind';
  const kn = (KIND[selected.kind] || KIND.theme).name;
  k.textContent = selected.kind === 'meta'
    ? kn + (selected.unknown ? ' · no clear idea found' : ' · the idea behind the text')
    : kn;
  const h = document.createElement('h3'); h.textContent = selected.full || selected.label;
  c.append(k, h);
  if (selected.summary) { const sp = document.createElement('p'); sp.textContent = selected.summary; c.appendChild(sp); }
  if (selected.essay) {                                      // hand-written reading, then an indirect marker
    const e = document.createElement('p'); e.textContent = selected.essay + ' ';
    const t = document.createElement('span'); t.className = 'ind'; t.textContent = '[indirect]'; e.appendChild(t); c.appendChild(e);
  }
  selected.occ.forEach(o => {                                // one paragraph per sentence, with its context sentence above when needed
    const p = document.createElement('p');
    if (o.ctx) { const q = document.createElement('span'); q.className = 'ctx'; o.ctx.forEach(g => q.appendChild(document.createTextNode(g.t))); p.appendChild(q); p.appendChild(document.createTextNode(' ')); }
    o.segs.forEach(g => {
      if (g.h) { const e = document.createElement('em'); e.className = 'hl'; e.textContent = g.t; p.appendChild(e); }
      else if (g.ind) { const e = document.createElement('span'); e.className = 'ind'; e.textContent = g.t; p.appendChild(e); }
      else p.appendChild(document.createTextNode(g.t));
    });
    if (o.tail) { const q = document.createElement('span'); q.className = 'ctx'; o.tail.forEach(g => q.appendChild(document.createTextNode(g.t))); p.appendChild(document.createTextNode(' ')); p.appendChild(q); }
    c.appendChild(p);
  });
  const linked = edges.filter(e => e.a === selected || e.b === selected).map(e => e.a === selected ? e.b : e.a);
  if (linked.length) {
    const r = document.createElement('div'); r.className = 'rel';
    linked.forEach(o => {
      const b = document.createElement('button'); b.textContent = o.label;
      b.onclick = () => { select(o); focusNode(o); }; r.appendChild(b);
    });
    c.appendChild(r);
  }
}

/* ------------------------------------------------------------ text overlay */
const editor = $('editor'), src = $('src'), TM = window.TinyModel;
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function showMsg(m) { $('msg').textContent = m || ''; }
function updateCount() {
  const w = TM.countWords(src.value), ok = w >= TM.MIN_WORDS && w <= TM.MAX_WORDS;
  const c = $('count');
  c.textContent = `${w.toLocaleString('en')} words · needs ${TM.MIN_WORDS}–${TM.MAX_WORDS.toLocaleString('en')}`;
  c.classList.toggle('ok', ok);
  updateSampleHighlight();
}
function updateSampleHighlight() {                       // a cached text is highlighted while it is loaded unedited
  const now = src.value.trim(), samples = window.NETWORK_CONFIG.samples || [];
  document.querySelectorAll('.sample-btn').forEach((btn, i) => {
    const s = samples[i];
    btn.classList.toggle('on', !!s && !!s.text && s.text.trim() === now);
  });
}
function openEditor(open) {
  editor.classList.toggle('open', open);
  editor.setAttribute('aria-hidden', String(!open));
  $('bText').setAttribute('aria-expanded', String(open));
  $('bText').classList.toggle('on', open);
  if (open) { updateCount(); showMsg(''); setTimeout(() => src.focus(), 60); }
  else if (document.activeElement === src) $('bText').focus();
}
function generate(text, fromUser) {
  const sample = (window.NETWORK_CONFIG.samples || []).find(sp => sp.text && sp.text.trim() === text.trim());
  viewZoom = sample && sample.zoom ? sample.zoom : 1;
  viewSpin = sample && sample.spin ? sample.spin : 0;
  const v = TM.validate(text);
  if (!v.ok) { if (fromUser) showMsg(v.msg); return false; }
  let res;
  try { res = TM.analyse(text); } catch (err) { console.error(err); res = {ok:false, msg:'Something went wrong while reading this text.'}; }
  if (!res.ok) { if (fromUser) showMsg(res.msg); return false; }
  loadGraph(res);
  try { localStorage.setItem(STORE, text); } catch (e) {}
  if (fromUser) applySpin('normal');                       // every new text starts with the normal spin
  if (fromUser) { showMsg(''); openEditor(false); toast(`Network updated: ${res.nodes.length} nodes, ${res.edges.length} connections`); }
  return true;
}
$('bText').onclick = () => openEditor(!editor.classList.contains('open'));
$('close').onclick = () => openEditor(false);
$('update').onclick = () => generate(src.value, true);
// cached texts: one small button each, filling the text field
(window.NETWORK_CONFIG.samples || []).forEach(sample => {
  const b = document.createElement('button');
  b.className = 'sample-btn';
  b.textContent = sample.label;
  if (sample.text) b.onclick = () => { src.value = sample.text; updateCount(); showMsg(''); src.focus(); };
  else { b.disabled = true; b.title = 'placeholder'; }
  $('samples').appendChild(b);
});
src.addEventListener('input', () => { updateCount(); showMsg(''); });
src.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(src.value, true); } });

$('bReset').onclick = () => resetView();
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (editor.classList.contains('open')) openEditor(false); else if (selected) select(null);
});

/* --------------------------------------------------- pointer: pick & drag */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const plane = new THREE.Plane(), hitPt = new THREE.Vector3(), offset = new THREE.Vector3(), tmp = new THREE.Vector3();
let press = null;

function pick(e) {
  const r = dom.getBoundingClientRect();
  mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(nodes.map(n => n.mesh), false);
  if (hits.length) return hits[0].object.userData.node;
  let best = null, bd = 16;                      // forgiving hit area for small nodes
  nodes.forEach(n => {
    tmp.copy(n.mesh.position).project(camera);
    if (tmp.z > 1) return;
    const d = Math.hypot((tmp.x*.5+.5)*r.width - (e.clientX-r.left), (-tmp.y*.5+.5)*r.height - (e.clientY-r.top));
    if (d < bd) { bd = d; best = n; }
  });
  return best;
}
// registered BEFORE OrbitControls so we can stop it when a node is grabbed
dom.addEventListener('pointerdown', e => {
  cancelFlight();                                           // the user takes over the camera
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const hit = pick(e);
  press = {x:e.clientX, y:e.clientY, moved:false, hit};
  if (hit) {
    controls.enabled = false;
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(tmp), hit.mesh.position);
    ray.ray.intersectPlane(plane, hitPt);
    offset.copy(hit.mesh.position).sub(hitPt);
    dom.setPointerCapture(e.pointerId);
  }
});
dom.addEventListener('pointermove', e => {
  if (press && press.hit) {
    if (!press.moved && Math.hypot(e.clientX-press.x, e.clientY-press.y) > 4) press.moved = true;
    if (press.moved) {
      const r = dom.getBoundingClientRect();
      mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
      ray.setFromCamera(mouse, camera);
      if (ray.ray.intersectPlane(plane, hitPt)) {
        press.hit.mesh.position.copy(hitPt).add(offset);
        press.hit.v.set(0,0,0); press.hit.pinned = true; alpha = Math.max(alpha, .35);
      }
    }
  } else if (!press) dom.style.cursor = pick(e) ? 'pointer' : 'grab';
});
function release() {
  if (!press) return;
  const {hit, moved} = press; press = null;
  controls.enabled = true;
  if (hit) hit.pinned = false;
  if (!moved) { select(hit); focusNode(hit); }
}
dom.addEventListener('pointerup', release);
dom.addEventListener('pointercancel', release);

/* ------------------------------------------------------------ controls */
const controls = new THREE.OrbitControls(camera, dom);
controls.enableDamping = true; controls.dampingFactor = 0.055;      // glide / inertia
controls.rotateSpeed = 0.35; controls.zoomSpeed = 0.2;   // zoom half as sensitive again
controls.minDistance = 25; controls.maxDistance = 1000;
const SPIN_NORMAL = 0.08384;                    // Spin speed (160% of the previous 0.0524)
// Spin modes: 'off', 'normal' (the Spin button) or 'fast' (Spin 20x). At most one is active.
const SPIN_FAST = SPIN_NORMAL * 20;             // exactly 20 times the normal spin (about 32x the previous normal)
function setSpin(mode) {
  const current = !controls.autoRotate ? 'off' : (controls.autoRotateSpeed === SPIN_FAST ? 'fast' : 'normal');
  applySpin(current === mode ? 'off' : mode);      // clicking the active button stops the spin
}
function applySpin(next) {
  controls.autoRotate = next !== 'off';
  controls.autoRotateSpeed = next === 'fast' ? SPIN_FAST : SPIN_NORMAL;
  $('bRotate').classList.toggle('on', next === 'normal');
  $('bFast').classList.toggle('on', next === 'fast');
}
$('bRotate').onclick = () => setSpin('normal');
$('bFast').onclick = () => setSpin('fast');
controls.autoRotate = true; controls.autoRotateSpeed = SPIN_NORMAL;
dom.style.cursor = 'grab';

/* ------------------------------------------------------------ force simulation */
const REP = 400, GRAVITY = 0.002, DAMP = 0.84, VMAX = 5;
const FOREIGN_PUSH = 1.8;      // outward push of Orbital nodes away from other centres (was 50)     // themes are pushed away from every centroid that is not their own (applied to the theme only)
const THEME_HOME = 0.004;    // themes are pulled back toward their own centroid, not toward the origin
let SIM_DT = 1;                                       // time step: 1 when loading, 0.2 while running (motion five times slower)
const CENTRAL_SLOW = 0.2;                             // Central and Meta nodes move five times slower again while running
const nodeDt = n => SIM_DT * (n.core && SIM_DT < 1 ? CENTRAL_SLOW : 1);
function simulate() {
  for (const n of nodes) n.v0.copy(n.v);
  alpha = alpha * Math.pow(0.985, SIM_DT);
  if (alpha < 0.003) alpha = 0;                       // settled: the layout freezes
  const N = nodes.length;
  for (let i = 0; i < N; i++) {                       // repulsion: strong between themes, so small nodes keep their distance
    const a = nodes[i], pa = a.mesh.position;
    for (let j = i+1; j < N; j++) {
      const b = nodes[j], pb = b.mesh.position;
      if (a.core && b.core && hubLinks.has(hubKey(a, b))) continue;
      let dx = pa.x-pb.x, dy = pa.y-pb.y, dz = pa.z-pb.z;
      let d2 = dx*dx+dy*dy+dz*dz; if (d2 < 1) { dx = Math.random()-.5; dy = Math.random()-.5; dz = Math.random()-.5; d2 = 1; }
      let mult = 1, wa = 1, wb = 1;                                       // wa / wb: how much each side feels the force
      if (!a.core && !b.core) mult = a.cl === b.cl ? 6.3 : 12;   // sibling repulsion, raised about 30%   // sibling repulsion +50%  // siblings of one centre push each other hard, spreading over the sphere              // theme vs theme (own / foreign cluster)
      else if (a.core !== b.core) {
        const th = a.core ? b : a, c = a.core ? a : b;
        if (th.cl === c.id) mult = 0.5;
        else { mult = FOREIGN_PUSH; if (c.core) { if (a.core) wa = 0; else wb = 0; } }   // foreign: theme moves, centroid does not
      }
      const d = Math.sqrt(d2), f = REP * a.m * b.m * mult / d2 * alpha / d;
      a.v.x += dx*f*wa; a.v.y += dy*f*wa; a.v.z += dz*f*wa;
      b.v.x -= dx*f*wb; b.v.y -= dy*f*wb; b.v.z -= dz*f*wb;
    }
  }
  for (const e of edges) {                            // short springs inside a cluster, very long soft ones between centroids
    const pa = e.a.mesh.position, pb = e.b.mesh.position;
    const dx = pb.x-pa.x, dy = pb.y-pa.y, dz = pb.z-pa.z, d = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
    const f = (d - e.rest) * e.k * alpha / d;
    e.a.v.x += dx*f; e.a.v.y += dy*f; e.a.v.z += dz*f;
    e.b.v.x -= dx*f; e.b.v.y -= dy*f; e.b.v.z -= dz*f;
  }
  for (let i = 0; i < hubList.length; i++) for (let j = i + 1; j < hubList.length; j++) {
    const A = hubList[i], B = hubList[j];                         // unlinked centrals/meta: weak pull toward a compact group
    if (hubLinks.has(hubKey(A, B))) continue;
    const pa = A.mesh.position, pb = B.mesh.position;
    const dx = pb.x-pa.x, dy = pb.y-pa.y, dz = pb.z-pa.z, d = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
    const f = (d - HUB_REST) * HUB_PULL * alpha / d;
    A.v.x += dx*f; A.v.y += dy*f; A.v.z += dz*f;
    B.v.x -= dx*f; B.v.y -= dy*f; B.v.z -= dz*f;
  }
  for (const n of nodes) n.v.sub(n.v0).multiplyScalar(nodeDt(n)).add(n.v0);   // forces act over the time step
  for (const n of nodes) {
    const p = n.mesh.position, dt = nodeDt(n), ga = alpha * dt;
    if (n.core) { const g = GRAVITY*ga; n.v.x -= p.x*g; n.v.y -= p.y*g; n.v.z -= p.z*g; }
    else {
      const h = byId.get(n.cl);
      if (h) { const q = h.mesh.position, g = THEME_HOME*ga; n.v.x -= (p.x-q.x)*g; n.v.y -= (p.y-q.y)*g; n.v.z -= (p.z-q.z)*g; }
    }
    n.v.multiplyScalar(Math.pow(DAMP, dt));
    const s = n.v.length(); if (s > VMAX) n.v.multiplyScalar(VMAX / s);
    if (n.core && n.kind !== 'meta') n.v.y -= p.y * 3 * ga;                  // centrals: flattened onto one plane
    if (n.kind === 'meta') n.v.y -= (p.y - 12) * 0.3 * ga;                   // meta: held above the plane
    if (!n.pinned) p.addScaledVector(n.v, dt);
  }
}
/* camera motion -> small swirl impulse on nodes (inertia when you rotate the view) */
const prevDir = new THREE.Vector3(), curDir = new THREE.Vector3(), axis = new THREE.Vector3(), swirl = new THREE.Vector3();
function cameraInertia() {
  curDir.copy(camera.position).sub(controls.target).normalize();
  axis.crossVectors(prevDir, curDir);
  const ang = Math.asin(Math.min(1, axis.length()));
  prevDir.copy(curDir);
  if (ang < 1e-4) return;
  axis.normalize().multiplyScalar(Math.min(ang, .08) * 0.06);
  for (const n of nodes) { swirl.crossVectors(axis, n.mesh.position); n.v.add(swirl); }
  if (ang > 0.02) alpha = Math.max(alpha, .08);
}

/* ------------------------------------------------------------ render loop */
const ease = k => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
let bars = [];                                                 // one cylinder per Meta-Central link
function rebuildBars() {
  bars.forEach(b => { scene.remove(b); b.material.dispose(); });
  bars = edges.filter(e => e.bar).map(e => {
    const mesh = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: BAR_COLOR, transparent: true, opacity: 0, depthWrite: false }));
    mesh.userData.edge = e;
    scene.add(mesh);
    return mesh;
  });
}
function updateBars(now) {
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  bars.forEach(b => {
    const e = b.userData.edge, p = e.a.mesh.position, q = e.b.mesh.position;
    dir.copy(q).sub(p);
    const len = dir.length() || 1e-3;
    b.position.copy(p).add(q).multiplyScalar(0.5);
    b.quaternion.setFromUnitVectors(up, dir.divideScalar(len));
    b.scale.set(1, len, 1);
    b.material.opacity = 0.92 * ease((now - edgesBorn - 500) / 900);
  });
}
function updateEdgeGeometry(now) {
  if (!lines) return;
  const a = lines.geometry.attributes.position.array;
  edges.forEach((e, i) => {
    const p = e.a.mesh.position, q = e.hidden ? e.a.mesh.position : e.b.mesh.position;   // hidden links collapse to a point
    a[i*6]=p.x; a[i*6+1]=p.y; a[i*6+2]=p.z; a[i*6+3]=q.x; a[i*6+4]=q.y; a[i*6+5]=q.z;
  });
  lines.geometry.attributes.position.needsUpdate = true;
  lines.material.opacity = .8 * ease((now - edgesBorn - 500) / 900);
}
function updateNodes(now) {
  const W = innerWidth, H = innerHeight, t = now * 0.001;
  for (const n of nodes) {
    if (n.mesh.userData.spin) n.mesh.rotateOnAxis(n.mesh.userData.spin.axis, n.mesh.userData.spin.rate);
    const k = ease((now - n.born) / 900);
    n.mesh.scale.setScalar(Math.max(n.rDraw * k, 0.001));
    n.glow.scale.setScalar(n.core ? (n.kind === 'core' ? (n === selected ? 6.36 : 4.86) : (n === selected ? 10.2 : 7.8)) : (n === selected ? 18.36 : 13.57));   // Central/Meta aurora at 60%, Orbital at 40%
    const base = (KIND[n.kind] || KIND.theme).gop;
    n.glow.material.opacity = (base + Math.sin(t*1.3 + n.mesh.position.x*.05) * .06) * k;
    tmp.copy(n.mesh.position).project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { n.el.style.display = 'none'; continue; }
    const dist = camera.position.distanceTo(n.mesh.position);
    const far = Math.min(1, Math.max(.25, 1.3 - dist/300));
    const op = (n === selected || n.core ? 1 : 1 - 0.7*(1 - far)) * k;     // fade softened by 30%
    const x = (tmp.x*.5+.5)*W, y = (-tmp.y*.5+.5)*H + 8 + n.r * 4.5;
    n.el.style.display = 'block';
    n.el.style.opacity = op.toFixed(2);
    n.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translateX(-50%)`;
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!press) recentre();
  updateFlight(now);
  controls.update();
  applyViewShift();
  if (!flight && !controls.autoRotate) cameraInertia();   // only a manual camera move nudges the nodes
  if (controls.autoRotate) alpha = Math.max(alpha, 0.06);   // keep the springs active while spinning, so nodes stay at their distance
  SIM_DT = 0.2; simulate(); SIM_DT = 1;
  updateEdgeGeometry(now); updateBars(now); updateNodes(now);
  stars[0].rotation.y += 0.00007; stars[1].rotation.y -= 0.00004;
  composer ? composer.render() : renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight); }
});

/* ------------------------------------------------------------ boot */
let initial = DEFAULT_TEXT;
try { const s = localStorage.getItem(STORE); if (s && TM.validate(s).ok) initial = s; } catch (e) {}
src.value = initial;
updateCount();
if (!generate(initial, false)) { src.value = DEFAULT_TEXT; generate(DEFAULT_TEXT, false); }
requestAnimationFrame(frame);
})();
