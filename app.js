import { corner, sideDoor, roomDoor } from './src/scene.js';
import { reachOf } from './src/plan.js';
import { makeView } from './src/view.js';

const $ = (s) => document.querySelector(s);
const BUILD = { corner, sideDoor, roomDoor };

// Fields for each kind of tight spot (values kept in cm). The letters match the diagram.
const FIELDS = {
  corner: [
    ['a', 'A', 'Hallway you come along', 'its width', 100],
    ['b', 'B', 'Hallway you turn into', 'its width', 100],
    ['ceiling', 'C', 'Ceiling height', 'at the corner', 240],
  ],
  sideDoor: [
    ['a', 'A', 'Hallway width', 'in front of the door', 100],
    ['b', 'B', 'Door opening', 'width, door open', 80],
    ['doorH', 'C', 'Door opening', 'height', 200],
    ['t', 'D', 'Wall thickness', 'frame to frame', 12],
    ['past', 'E', 'Hallway beyond the door', '0 if the door is at the end', 100],
    ['ceiling', 'F', 'Ceiling height', 'in the hallway', 240],
  ],
  roomDoor: [
    ['b', 'A', 'Door opening', 'width, door open', 80],
    ['doorH', 'B', 'Door opening', 'height', 200],
    ['t', 'C', 'Wall thickness', 'frame to frame', 12],
    ['ceiling', 'D', 'Ceiling height', 'the lower of the two', 240],
  ],
};
const NOTES = {
  corner: 'Measure each hallway at its narrowest, wall to wall (skirting boards, radiators and door frames stick out).',
  sideDoor: 'Measure the door opening with the door fully open, between the door stops (and the open door itself, if it sticks into the opening). It works the same in either direction: hallway into room, or room into hallway.',
  roomDoor: 'For a door between two rooms, or the front door from outside. Measure the opening with the door fully open, between the door stops.',
};

// ---- State, units ----
const DEFAULT = { unit: 'cm', L: 200, D: 90, H: 85, kind: 'corner', spot: {} };
let state = load();
const IN = 2.54;
const show = (cm) => (state.unit === 'in' ? +(cm / IN).toFixed(1) : +cm.toFixed(1));
const toCm = (v) => (state.unit === 'in' ? v * IN : v);
const unitWord = () => (state.unit === 'in' ? 'in' : 'cm');
const fmt = (cm) => (state.unit === 'in' ? `${(cm / IN).toFixed(1)} in` : `${Math.round(cm)} cm`);

function load() {
  try {
    const m = location.hash.match(/^#c=(.+)$/);
    if (m) { const s = JSON.parse(decodeURIComponent(m[1])); if (s && s.kind in FIELDS) return { ...DEFAULT, ...s }; }
  } catch { /* ignore */ }
  try { const s = JSON.parse(localStorage.getItem('will-it-get-in')); if (s && s.kind in FIELDS) return { ...DEFAULT, ...s }; } catch { /* ignore */ }
  return structuredClone(DEFAULT);
}
const save = () => { try { localStorage.setItem('will-it-get-in', JSON.stringify(state)); } catch { /* private mode */ } };
const spotVal = (k, key) => state.spot[k]?.[key] ?? FIELDS[k].find((f) => f[0] === key)[4];

// ---- Form ----
function renderForm() {
  $('#unit').value = state.unit;
  for (const id of ['L', 'D', 'H']) $('#' + id).value = show(state[id]);
  document.querySelectorAll('input[name=kind]').forEach((r) => { r.checked = r.value === state.kind; });
  $('#spotFields').innerHTML = FIELDS[state.kind].map(([key, letter, label, hint]) =>
    `<label><span><b class="tag">${letter}</b> ${label}</span><span class="hint">${hint}</span><input id="f-${key}" data-key="${key}" type="number" inputmode="decimal" min="1" step="any" required value="${show(spotVal(state.kind, key))}"></label>`).join('');
  $('#spotNote').textContent = NOTES[state.kind];
  $('#diagram').innerHTML = DIAGRAM[state.kind];
}

function readForm() {
  const errs = [];
  const num = (el) => { const v = parseFloat(el.value); if (!(v > 0)) { errs.push(el); return NaN; } return toCm(v); };
  const dims = ['L', 'D', 'H'].map((id) => num($('#' + id)));
  const params = {};
  for (const el of document.querySelectorAll('#spotFields input')) params[el.dataset.key] = el.dataset.key === 'past' ? Math.max(0, toCm(parseFloat(el.value) || 0)) : num(el);
  return { dims, params, errs };
}

$('#unit').addEventListener('change', () => {
  const { dims, params } = readForm();
  state.unit = $('#unit').value;
  if (dims.every(Number.isFinite)) [state.L, state.D, state.H] = dims;
  state.spot[state.kind] = { ...state.spot[state.kind], ...params };
  renderForm(); save();
});
document.querySelectorAll('input[name=kind]').forEach((r) => r.addEventListener('change', () => {
  const { params } = readForm();
  state.spot[state.kind] = { ...state.spot[state.kind], ...params };
  state.kind = r.value; renderForm(); save();
}));

// ---- Checking ----
let worker = null, runId = 0, timer = null;
$('#form').addEventListener('submit', (e) => { e.preventDefault(); check(); });

function check() {
  const { dims, params, errs } = readForm();
  for (const el of document.querySelectorAll('#form input[type=number]')) el.setAttribute('aria-invalid', errs.includes(el) ? 'true' : 'false');
  if (errs.length) { $('#status').textContent = 'Please fill in every size (numbers above zero).'; errs[0].focus(); return; }
  if (params.doorH && params.doorH > params.ceiling) params.doorH = params.ceiling;
  [state.L, state.D, state.H] = dims; state.spot[state.kind] = params; save();
  if (worker) worker.terminate();
  worker = new Worker('worker.js', { type: 'module' });
  const id = ++runId, t0 = performance.now(), kind = state.kind;
  $('#go').disabled = true;
  const tick = () => { $('#status').textContent = `Checking… ${((performance.now() - t0) / 1000).toFixed(0)} s`; };
  $('#status').textContent = 'Checking…'; clearInterval(timer); timer = setInterval(tick, 1000);
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.id !== id) return;
    if (m.type === 'result') { $('#go').disabled = false; showResult(m, dims, kind, params); $('#status').textContent = 'Now working out the longest that would get through…'; }
    else if (m.type === 'longest') { clearInterval(timer); $('#status').textContent = ''; showLongest(m, dims); }
    else if (m.type === 'error') { clearInterval(timer); $('#go').disabled = false; $('#status').textContent = 'Something went wrong: ' + m.message; }
  };
  worker.postMessage({ id, dims, kind, params });
}

function showResult(m, dims, kind, params) {
  $('#out').hidden = false;
  const v = $('#verdict');
  $('#longest').textContent = '';
  stop();
  if (m.found) {
    v.className = 'verdict good';
    v.innerHTML = `Yes, it gets through.<span class="sub">With at least 1 cm to spare all round. Here's how to carry it:</span>`;
    $('#steps').innerHTML = m.steps.map((s) => `<li>${esc(s)}</li>`).join('');
    $('#showhow').hidden = false;
    setupAnimation(m, dims, kind, params);
  } else {
    v.className = 'verdict bad';
    $('#showhow').hidden = true;
    if (m.doorTooSmall) {
      const s = Math.min(...dims);
      v.innerHTML = `No, it can't go through this door.<span class="sub">Its shortest side (${fmt(s)}) is wider than the opening less 1 cm each side (${fmt(params.b - 2)}). However you turn it, the line through its middle, across the doorway, is at least that long.</span>`;
    } else if (m.capped) {
      v.innerHTML = `I couldn't settle this one.<span class="sub">The search grew too big for a browser before it found a way or ran out of options. It's close either way: measure again carefully.</span>`;
    } else {
      v.innerHTML = `No: I found no way to get it through.<span class="sub">The search tried every way of sliding, turning, tilting and standing it on end, in small steps, keeping 1 cm from everything. A way that needs less room to spare than that could still exist, so if it's close, measure again.</span>`;
    }
  }
  v.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function showLongest(m, dims) {
  const what = `with this depth (${fmt(dims[1])}) and height (${fmt(dims[2])})`;
  let t;
  if (m.value) t = `The longest box ${what} that gets through here: <b>${fmt(m.value)}</b>.`;
  else if (m.atLeast) t = `Anything ${what} gets through here up to at least <b>${fmt(m.atLeast)}</b> long.`;
  else if (m.between) t = `The longest box ${what} that gets through here is between ${fmt(m.between[0])} and ${fmt(m.between[1])} (the search got too big to narrow it down).`;
  else if (m.none) t = `At this depth and height, no length gets through: not even ${fmt(m.floor)}. It's the depth or height that has to give.`;
  else t = 'I couldn\'t work out the longest that would get through (the search got too big).';
  $('#longest').innerHTML = t;
}

// ---- Animation ----
let view = null, frames = [], total = 0, playing = false, tNow = 0, raf = 0, lastTs = 0;

function setupAnimation(m, dims, kind, params) {
  const scene = BUILD[kind]({ ...params, reach: reachOf(dims) });
  view = makeView($('#view'), scene, dims);
  view.setMode($('#vAbove').getAttribute('aria-pressed') === 'true' ? 'above' : 'angled');
  // Frames: one segment per move, lasting in proportion to how far the box travels.
  const P = m.path, reach = reachOf(dims);
  frames = []; total = 0;
  for (let i = 1; i < P.length; i++) {
    const A = P[i - 1], B = P[i];
    let dy = B.yaw - A.yaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    const len = A.hold === B.hold ? Math.hypot(B.x - A.x, B.y - A.y) + reach * (Math.abs(dy) + Math.abs(B.pitch - A.pitch)) : 0;
    frames.push({ A, B, dy, t0: total, len });
    total += len;
  }
  tNow = 0; draw();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) play();
}

function poseAt(t) {
  if (!frames.length) return null;
  for (const f of frames) {
    if (t <= f.t0 + f.len || f === frames.at(-1)) {
      if (f.len === 0) return f.B;
      const u = Math.min(1, Math.max(0, (t - f.t0) / f.len));
      return { hold: f.A.hold, x: f.A.x + u * (f.B.x - f.A.x), y: f.A.y + u * (f.B.y - f.A.y), yaw: f.A.yaw + u * f.dy, pitch: f.A.pitch + u * (f.B.pitch - f.A.pitch) };
    }
  }
  return frames.at(-1).B;
}
function draw() { if (view) view.draw(poseAt(tNow)); $('#scrub').value = total ? Math.round((tNow / total) * 1000) : 0; }
const SPEED = 60; // cm (of box travel) per second
function stepAnim(ts) {
  if (!playing) return;
  const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
  tNow += dt * SPEED;
  if (tNow >= total) { tNow = total; draw(); stop(); return; }
  draw(); raf = requestAnimationFrame(stepAnim);
}
function play() { if (tNow >= total) tNow = 0; playing = true; lastTs = 0; $('#play').textContent = 'Pause'; raf = requestAnimationFrame(stepAnim); }
function stop() { playing = false; cancelAnimationFrame(raf); $('#play').textContent = tNow >= total && total > 0 ? 'Play again' : 'Play'; }
$('#play').addEventListener('click', () => (playing ? stop() : play()));
$('#scrub').addEventListener('input', () => { stop(); tNow = (+$('#scrub').value / 1000) * total; draw(); });
for (const [id, mode] of [['#vAngled', 'angled'], ['#vAbove', 'above']]) {
  $(id).addEventListener('click', () => {
    $('#vAngled').setAttribute('aria-pressed', String(mode === 'angled')); $('#vAbove').setAttribute('aria-pressed', String(mode === 'above'));
    if (view) { view.setMode(mode); draw(); }
  });
}
addEventListener('resize', () => draw());

$('#share').addEventListener('click', async () => {
  const url = location.href.split('#')[0] + '#c=' + encodeURIComponent(JSON.stringify({ unit: state.unit, L: state.L, D: state.D, H: state.H, kind: state.kind, spot: { [state.kind]: state.spot[state.kind] } }));
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); $('#share').textContent = 'Link copied'; } catch { $('#share').textContent = 'Link is in the address bar'; }
  setTimeout(() => { $('#share').textContent = 'Copy a link to this check'; }, 2500);
});

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- Diagrams (floor plans, from above) ----
const W = '#b9ad96', T = 'font: 600 14px Inter, system-ui, sans-serif; fill: #1f2430';
const tag = (x, y, s) => `<circle cx="${x}" cy="${y}" r="10" fill="#1f2430"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" style="${T}; fill:#fff; font-size:12px">${s}</text>`;
const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1f2430" stroke-width="1.5" marker-start="url(#ah)" marker-end="url(#ah)"/>`;
const DEFS = '<defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" fill="#1f2430"/></marker><marker id="ahb" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 1 L9 5 L0 9 z" fill="#2f6aa8"/></marker></defs>';
const DIAGRAM = {
  corner: `${DEFS}<path d="M20 170 V10 H310 V20 H30 V170 Z M100 170 V90 H310 V100 H110 V170 Z" fill="${W}"/>
    <path d="M30 170 V20 H310 V90 H100 V170 Z" fill="#fff"/>
    ${arrow(32, 140, 98, 140)}${tag(65, 125, 'A')}${arrow(250, 22, 250, 88)}${tag(268, 55, 'B')}
    <text x="40" y="60" style="${T}; font-weight:400; font-size:12px; fill:#5f6673">C: ceiling height</text>
    <path d="M65 168 v-18" stroke="#2f6aa8" stroke-width="2.5" marker-end="url(#ahb)"/><text x="72" y="166" style="${T}; font-weight:400; font-size:12px; fill:#2f6aa8">you come in</text>`,
  sideDoor: `${DEFS}<rect x="40" y="0" width="10" height="170" fill="${W}"/><rect x="130" y="0" width="16" height="70" fill="${W}"/><rect x="130" y="130" width="16" height="40" fill="${W}"/>
    <rect x="50" y="0" width="80" height="170" fill="#fff"/><rect x="146" y="20" width="160" height="150" fill="#fff"/>
    <rect x="40" y="0" width="106" height="8" fill="${W}"/>
    ${arrow(52, 150, 128, 150)}${tag(90, 135, 'A')}${arrow(160, 72, 160, 128)}${tag(178, 100, 'B')}
    ${arrow(130, 60, 146, 60)}${tag(138, 44, 'D')}${arrow(115, 10, 115, 68)}${tag(100, 40, 'E')}
    <text x="190" y="160" style="${T}; font-weight:400; font-size:12px; fill:#5f6673">room</text>
    <text x="170" y="40" style="${T}; font-weight:400; font-size:12px; fill:#5f6673">C: door height, F: ceiling</text>`,
  roomDoor: `${DEFS}<rect x="150" y="0" width="18" height="55" fill="${W}"/><rect x="150" y="125" width="18" height="45" fill="${W}"/>
    ${arrow(185, 57, 185, 123)}${tag(203, 90, 'A')}${arrow(150, 40, 168, 40)}${tag(159, 22, 'C')}
    <text x="40" y="95" style="${T}; font-weight:400; font-size:12px; fill:#5f6673">this side</text>
    <text x="225" y="150" style="${T}; font-weight:400; font-size:12px; fill:#5f6673">B: door height, D: ceiling</text>`,
};

renderForm();
check();
