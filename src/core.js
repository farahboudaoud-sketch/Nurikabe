// ---------------------------------------------------------------------------
// Noyau commun des jeux de la série (écrans, zoom, gestes, indices, records)
// ---------------------------------------------------------------------------
const S = 60, IDLE_MS = 120000;
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
function registerGame(m) { G = m; }
const dims = s => (G.dims ? G.dims(s) : { cols: s.W, rows: s.H, ox: 0, oy: 0 });

let G = null;              // current game module
let st = null;             // current game state (saved)
let inGame = false, undo = [], hint = null, flashWrong = null, won = false, fresh = null;


// ---------- small illustrations for the rules ----------
function ruleFig(inner, vw, vh, caption, mark, wide) {
  const tag = mark === 'ok' ? '<b class="rk ok">Correct</b>' : mark === 'no' ? '<b class="rk no">Interdit</b>' : '';
  return `<figure class="rfig${wide ? ' wide' : ''}"><svg viewBox="0 0 ${vw} ${vh}" aria-hidden="true">${inner}</svg><figcaption>${tag}${caption}</figcaption></figure>`;
}
function figGrid(W, H, s, x0, y0, bold) {
  x0 = x0 || 0; y0 = y0 || 0;
  let o = '';
  for (let r = 0; r <= H; r++) o += `<line class="${bold && bold(r, 'r') ? 'fb' : 'fl'}" x1="${x0}" y1="${y0 + r * s}" x2="${x0 + W * s}" y2="${y0 + r * s}"/>`;
  for (let c = 0; c <= W; c++) o += `<line class="${bold && bold(c, 'c') ? 'fb' : 'fl'}" x1="${x0 + c * s}" y1="${y0}" x2="${x0 + c * s}" y2="${y0 + H * s}"/>`;
  return o;
}
const figNum = (x, y, n, cls, size) => `<text class="ft ${cls || ''}" x="${x}" y="${y + (size || 14) * 0.36}" style="font-size:${size || 14}px">${n}</text>`;
const figFigs = (...f) => `<div class="rfigs">${f.join('')}</div>`;

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function plural(n, w) { return n + ' ' + w + (n > 1 ? 's' : ''); }

// ---------- state & storage ----------
const keyState = id => id + '-v1', keyBest = id => id + '-best', keyCustom = id => id + '-custom';
function save() { if (st && G) store.set(keyState(G.id), st); }
function levelOf(s) {
  if (s.level === 'perso') return G.customLevel(s.custom.W, s.custom.H, s.custom.hard);
  return G.levels[s.level];
}
function bestKey() { return st.level === 'perso' ? `perso-${st.W}x${st.H}${st.custom && st.custom.hard ? '-d' : ''}` : st.level; }

function newGame(level, custom) {
  if (level === 'perso') custom = custom || (st && st.custom) || store.get(keyCustom(G.id)) || G.customDefault;
  const L = level === 'perso' ? G.customLevel(custom.W, custom.H, custom.hard) : G.levels[level];
  $('loading').classList.add('on');
  setTimeout(() => {
    const data = G.generate(L);
    st = Object.assign({ level, custom: level === 'perso' ? custom : null, elapsed: 0, hints: 0, done: false,
      no: 1000 + Math.floor(Math.random() * 9000) }, data);
    st.x = G.emptyX(st);
    start();
    $('loading').classList.remove('on');
  }, 30);
}
function start() {
  G.prepare(st);
  undo = []; hint = null; flashWrong = null; won = st.done; fresh = null;
  st.lastProg = Date.now(); st.bestProg = G.progress(st);
  const L = levelOf(st);
  $('meta').textContent = G.arcade ? L.label + ' · ' + st.W + '×' + st.H : L.label + (st.custom && st.custom.hard ? ' difficile' : '') + ' · ' + st.W + '×' + st.H + ' · grille n° ' + st.no;
  const d = dims(st);
  $('board').setAttribute('viewBox', `0 0 ${d.cols * S} ${d.rows * S}`);
  $('pad').innerHTML = G.padHTML ? G.padHTML(st) : '';
  if (G.padBind) G.padBind(st);
  fitStage(true);
  $('win').classList.remove('on');
  showHintText('');
  render(); save(); updateStats();
  if (won) showWin(false);
}

// ---------- moves (used by the game modules) ----------
let stroke = false;
function snapshot() { undo.push(st.x.slice()); if (undo.length > 400) undo.shift(); }
function commit(mutator) {            // one complete move
  if (won) return;
  snapshot();
  mutator();
  afterMove();
}
function beginStroke() { if (won) return false; snapshot(); stroke = true; return true; }
function strokeChanged() { hint = null; flashWrong = null; render(); }
function endStroke(changed) {
  if (!stroke) return;
  stroke = false;
  if (!changed) { undo.pop(); return; }
  afterMove();
}
function afterMove() {
  hint = null; flashWrong = null; showHintText('');
  updateStats();
  const p = G.progress(st);
  if (p > st.bestProg) { st.bestProg = p; st.lastProg = Date.now(); }
  render(); save(); checkWin();
}
function say(msg, warn) { showHintText(msg, warn !== false); }

function checkWin() {
  const r = G.check(st);
  if (r !== true) { if (typeof r === 'string') showHintText(r, true); return; }
  st.done = true; won = true; save();
  const bests = store.get(keyBest(G.id)) || {};
  const prev = bests[bestKey()];
  const val = G.recordValue ? G.recordValue(st) : st.elapsed;
  const record = G.recordHigh ? (val > 0 && (!prev || val > prev)) : (st.hints === 0 && (!prev || val < prev));
  if (record) { bests[bestKey()] = val; store.set(keyBest(G.id), bests); }
  showWin(record);
}
function showWin(record) {
  $('winTitle').textContent = G.winText || 'Grille résolue';
  if (G.winLineText) $('winLine').textContent = G.winLineText(st);
  else $('winLine').innerHTML = `Temps : <span id="winTime">${fmt(st.elapsed)}</span> · <span id="winHints">${st.hints === 0 ? 'sans indice' : plural(st.hints, 'indice')}</span>`;
  $('winRecord').style.display = record ? 'block' : 'none';
  fitStage(true);
  $('win').classList.toggle('reveal', !!G.revealWin);
  $('win').classList.add('on');
  render();
}

// ---------- rendering ----------
function render() {
  if (!st) return;
  const parts = [];
  const d = dims(st);
  if (hint && hint.level >= 1 && hint.r !== undefined) {
    const r0 = Math.max(0, hint.r - 2), r1 = Math.min(st.H - 1, hint.r + 2), c0 = Math.max(0, hint.c - 2), c1 = Math.min(st.W - 1, hint.c + 2);
    parts.push(`<rect class="zone" x="${(c0 + d.ox) * S + 4}" y="${(r0 + d.oy) * S + 4}" width="${(c1 - c0 + 1) * S - 8}" height="${(r1 - r0 + 1) * S - 8}" rx="14"/>`);
  }
  parts.push(G.render(st, { hint, flash: flashWrong, fresh, won }));
  $('board').innerHTML = parts.join('');
  if (G.afterRender) G.afterRender(st, { hint, won });
  fresh = null;
}
function svgPoint(ev) {
  const svg = $('board'), p = svg.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function cellAt(pt) {
  const d = dims(st);
  const c = Math.floor(pt.x / S - d.ox), r = Math.floor(pt.y / S - d.oy);
  if (r < 0 || c < 0 || r >= st.H || c >= st.W) return null;
  return { r, c };
}

// ---------- zoom ----------
const Z = { s: 1, tx: 0, ty: 0, w: 0, h: 0, cell: 1, maxS: 3 };
function areaSize() { const a = $('area'); return { aw: a.clientWidth, ah: a.clientHeight }; }
function fitStage(reset) {
  if (!st) return;
  const { aw, ah } = areaSize(), pad = 6;
  const d = dims(st);
  const cell = Math.max(1, Math.min((aw - pad * 2) / d.cols, (ah - pad * 2) / d.rows));
  Z.cell = cell; Z.w = cell * d.cols; Z.h = cell * d.rows;
  Z.maxS = G.noZoom ? 1 : Math.max(2.5, 56 / cell);
  if (reset) Z.s = 1;
  applyZ();
}
function applyZ() {
  const { aw, ah } = areaSize();
  Z.s = Math.min(Z.maxS, Math.max(1, Z.s));
  const sw = Z.w * Z.s, sh = Z.h * Z.s;
  Z.tx = sw <= aw ? (aw - sw) / 2 : Math.min(0, Math.max(aw - sw, Z.tx));
  Z.ty = sh <= ah ? (ah - sh) / 2 : Math.min(0, Math.max(ah - sh, Z.ty));
  const stg = $('stage');
  stg.style.width = sw + 'px'; stg.style.height = sh + 'px';
  stg.style.transform = `translate(${Z.tx}px,${Z.ty}px)`;
}
function zoomAt(f, px, py) {
  const cx = (px - Z.tx) / Z.s, cy = (py - Z.ty) / Z.s;
  Z.s = Math.min(Z.maxS, Math.max(1, Z.s * f));
  Z.tx = px - cx * Z.s; Z.ty = py - cy * Z.s;
  applyZ();
}
function focusCell(r, c) {
  if (Z.s <= 1.01 || r === undefined) return;
  const { aw, ah } = areaSize(), d = dims(st);
  r += d.oy; c += d.ox;
  Z.tx = aw / 2 - (c + .5) * Z.cell * Z.s;
  Z.ty = ah / 2 - (r + .5) * Z.cell * Z.s;
  applyZ();
}

// ---------- gestures ----------
// One finger: the game decides (draw, paint, tap). Where the game allows it (pan: true), a drag pans once zoomed.
// Two fingers: pinch zoom and pan.
function areaXY(ev) { const r = $('area').getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
const ptrs = new Map();
let gest = null;
function onDown(ev) {
  if (!st || ev.target.closest('#win')) return;
  ev.preventDefault();
  try { $('area').setPointerCapture(ev.pointerId); } catch (e) {}
  const p = areaXY(ev);
  ptrs.set(ev.pointerId, p);
  if (ptrs.size === 1) {
    const pt = svgPoint(ev);
    const g = won ? { pan: true } : (G.pointerDown(st, pt) || { pan: true });
    gest = { mode: 'game', start: p, pt, g, tx0: Z.tx, ty0: Z.ty };
  } else if (ptrs.size === 2) {
    if (gest && gest.mode === 'game' && G.pointerCancel) G.pointerCancel(st, gest.g);
    const [a, b] = [...ptrs.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    gest = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: Z.s, cx: (mx - Z.tx) / Z.s, cy: (my - Z.ty) / Z.s };
  }
}
function onMove(ev) {
  if (!ptrs.has(ev.pointerId) || !gest) return;
  const p = areaXY(ev);
  ptrs.set(ev.pointerId, p);
  if (gest.mode === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    Z.s = Math.min(Z.maxS, Math.max(1, gest.s0 * d / gest.d0));
    Z.tx = mx - gest.cx * Z.s; Z.ty = my - gest.cy * Z.s;
    applyZ();
    return;
  }
  if (gest.mode === 'game') {
    const moved = Math.hypot(p.x - gest.start.x, p.y - gest.start.y);
    if (gest.g.pan && moved > 8) { gest.mode = Z.s > 1.01 ? 'pan' : 'none'; }
    else if (!won && G.pointerMove) G.pointerMove(st, gest.g, svgPoint(ev));
  }
  if (gest.mode === 'pan') {
    Z.tx = gest.tx0 + (p.x - gest.start.x); Z.ty = gest.ty0 + (p.y - gest.start.y);
    applyZ();
  }
}
function onEnd(ev) {
  if (!ptrs.has(ev.pointerId)) return;
  ptrs.delete(ev.pointerId);
  const g = gest;
  if (g && g.mode === 'game' && !won) {
    if (ev.type === 'pointerup') G.pointerUp(st, g.g, svgPoint(ev), g.pt);
    else if (G.pointerCancel) G.pointerCancel(st, g.g);
  }
  if (ptrs.size === 0) gest = null;
  else if (g && g.mode === 'pinch') gest = { mode: 'none' };
}
function onWheel(ev) {
  if (!st) return;
  ev.preventDefault();
  const p = areaXY(ev);
  zoomAt(Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
}

// ---------- hints ----------
function askHint() {
  if (!st || won) return;
  if (!hint) {
    hint = G.findHint(st);
    if (!hint) return;
    hint.level = 0;
    st.hints++; save(); updateStats();
  }
  hint.level = Math.min(3, hint.level + 1);
  const msgs = {
    1: hint.type === 'wrong' ? 'Il y a une erreur quelque part dans cette zone.' : 'Regarde dans cette zone : une déduction t\'y attend.',
    2: hint.focusText || 'Concentre-toi sur cet endroit.',
    3: hint.text
  };
  showHintText(msgs[hint.level], false, hint.level === 3 && !!hint.apply);
  $('hintBtn').classList.remove('pulse');
  $('hintBtn').querySelector('span').textContent = hint.level < 3 ? 'Suite' : 'Indice';
  st.lastProg = Date.now();
  render();
  focusCell(hint.r, hint.c);
}
function applyHint() {
  if (!hint || hint.level < 3 || !hint.apply) return;
  const h = hint;
  snapshot();
  const ok = h.apply(st);
  if (ok === false) { undo.pop(); return; }
  fresh = h.fresh || null;
  $('hintBtn').querySelector('span').textContent = 'Indice';
  afterMove();
}
function showHintText(t, warn, withApply) {
  $('hintText').textContent = t;
  $('hintBox').classList.toggle('on', !!t);
  $('hintBox').classList.toggle('warn', !!warn);
  $('applyBtn').style.display = withApply ? 'inline-flex' : 'none';
  if (!t) $('hintBtn').querySelector('span').textContent = 'Indice';
}
function verify() {
  if (!st || won) return;
  const bad = G.wrong(st);
  flashWrong = bad;
  showHintText(bad.size ? G.wrongText(bad.size) : 'Aucune erreur pour l\'instant. Continue.', bad.size > 0);
  render();
  setTimeout(() => { flashWrong = null; render(); }, 2500);
}
function doUndo() {
  if (!undo.length || won) return;
  st.x = undo.pop();
  hint = null; showHintText(''); render(); save();
}
function reset() {
  if (!st) return;
  snapshot();
  st.x = G.emptyX(st); st.done = false; won = false; hint = null;
  $('win').classList.remove('on'); showHintText(''); render(); save();
}
function updateStats() {
  if (!st) return;
  $('timer').textContent = G.statValue ? G.statValue(st) : fmt(st.elapsed);
  $('hintCount').textContent = st.hints;
  const b = (store.get(keyBest(G.id)) || {})[bestKey()];
  $('best').textContent = b ? (G.bestFmt ? G.bestFmt(b) : fmt(b)) : '—';
}
function tick() {
  if (!st || won || document.hidden || !inGame) return;
  st.elapsed += 1000; updateStats();
  if (!G.noHints && Date.now() - st.lastProg > IDLE_MS && !hint) {
    if (!$('hintBtn').classList.contains('pulse')) {
      $('hintBtn').classList.add('pulse');
      showHintText('Tu bloques ? Un indice t\'attend.');
    }
  }
  if (st.elapsed % 5000 === 0) save();
}

// ---------- screens ----------
function showView(v) {              // 'home' | 'game'
  inGame = v === 'game';
  $('home').classList.toggle('hidden', v === 'game');
  if (v === 'game' && st) { st.lastProg = Date.now(); fitStage(false); }
  if (v !== 'game') $('home').scrollTop = 0;
}
function loadSaved() {
  const saved = store.get(keyState(G.id));
  if (saved && saved.W && G.valid(saved) && (saved.level === 'perso' ? saved.custom && G.customLevel : G.levels[saved.level])) {
    st = saved;
    try { start(); } catch (e) { console.error(e); st = null; }
  }
}
function renderLevels() {
  const bests = store.get(keyBest(G.id)) || {};
  $('levelsList').innerHTML = Object.keys(G.levels).map(k => {
    const L = G.levels[k], b = bests[k];
    const size = L.sizeLabel || (L.W + '×' + L.H);
    return `<button class="hl" data-l="${k}"><b>${L.kanji}</b><span><strong>${L.label}</strong><i>${size}</i></span><em>${b ? (G.bestLabel ? G.bestLabel(b) : 'record ' + fmt(b)) : ''}</em></button>`;
  }).join('');
  document.querySelectorAll('#levelsList [data-l]').forEach(b => b.addEventListener('click', () => { showView('game'); newGame(b.dataset.l); }));
  const rb = $('resumeBtn');
  if (st && !st.done) {
    const L = levelOf(st);
    $('resumeInfo').textContent = L.label + (st.custom && st.custom.hard ? ' difficile' : '') + ' · ' + (L.sizeLabel || st.W + '×' + st.H) + ' · ' + (G.resumeLabel ? G.resumeLabel(st) : fmt(st.elapsed));
    rb.classList.add('on');
  } else rb.classList.remove('on');
  $('customBtn').style.display = G.customLevel ? '' : 'none';
  if (G.customLevel) {
    const c = store.get(keyCustom(G.id)) || G.customDefault;
    $('cw').min = G.customRange.W[0]; $('cw').max = G.customRange.W[1];
    $('ch').min = G.customRange.H[0]; $('ch').max = G.customRange.H[1];
    $('cw').value = c.W; $('ch').value = c.H;
    $('cHard').classList.toggle('on', !!c.hard); $('cClassic').classList.toggle('on', !c.hard);
  }
  $('customPanel').classList.remove('on');
  syncCustom();
}
function syncCustom() {
  if (!G || !G.customLevel) return;
  $('cwV').textContent = $('cw').value; $('chV').textContent = $('ch').value;
  $('cInfo').textContent = G.customInfo(+$('cw').value, +$('ch').value, $('cHard').classList.contains('on'));
}
function backFromGame() { if (st) save(); renderLevels(); showView('home'); }

// ---------- theme ----------
function applyTheme(light) {
  document.body.classList.toggle('light', light);
  document.querySelectorAll('[data-theme-btn]').forEach(b => {
    b.textContent = light ? '暗' : '明';
    b.setAttribute('aria-label', light ? 'Mode sombre' : 'Mode clair');
  });
  try {
    const SB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SystemBars;
    if (SB && SB.setStyle) SB.setStyle({ style: light ? 'LIGHT' : 'DARK' });
  } catch (e) {}
}

function init() {
  applyTheme(store.get('theme') === 'light');
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.addEventListener('click', () => {
    const light = !document.body.classList.contains('light');
    store.set('theme', light ? 'light' : 'dark');
    applyTheme(light);
  }));
  ['cw', 'ch'].forEach(id => $(id).addEventListener('input', syncCustom));
  $('cClassic').addEventListener('click', () => { $('cClassic').classList.add('on'); $('cHard').classList.remove('on'); syncCustom(); });
  $('cHard').addEventListener('click', () => { $('cHard').classList.add('on'); $('cClassic').classList.remove('on'); syncCustom(); });
  $('customBtn').addEventListener('click', () => { const on = $('customPanel').classList.toggle('on'); syncCustom(); if (on) setTimeout(() => $('customPanel').scrollIntoView({ behavior: 'smooth', block: 'end' }), 50); });
  $('cPlay').addEventListener('click', () => {
    const c = { W: +$('cw').value, H: +$('ch').value, hard: $('cHard').classList.contains('on') };
    store.set(keyCustom(G.id), c);
    showView('game'); newGame('perso', c);
  });
  $('resumeBtn').addEventListener('click', () => showView('game'));
  $('backBtn').addEventListener('click', backFromGame);
  $('winHome').addEventListener('click', backFromGame);
  $('rulesBtn2').addEventListener('click', () => $('rules').classList.add('on'));
  const area = $('area');
  area.addEventListener('pointerdown', onDown);
  area.addEventListener('pointermove', onMove);
  area.addEventListener('pointerup', onEnd);
  area.addEventListener('pointercancel', onEnd);
  area.addEventListener('wheel', onWheel, { passive: false });
  $('hintBtn').addEventListener('click', askHint);
  $('applyBtn').addEventListener('click', applyHint);
  $('verifyBtn').addEventListener('click', verify);
  $('undoBtn').addEventListener('click', doUndo);
  $('resetBtn').addEventListener('click', reset);
  $('newBtn').addEventListener('click', () => newGame(st ? st.level : Object.keys(G.levels)[0]));
  $('winNew').addEventListener('click', () => newGame(st.level));
  window.addEventListener('resize', () => fitStage(false));
  $('rulesBtn').addEventListener('click', () => $('rules').classList.add('on'));
  $('rulesClose').addEventListener('click', () => $('rules').classList.remove('on'));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo(); return; }
    if (inGame && st && !won && G.onKey) G.onKey(st, e);
  });
  if (G.noHints) document.body.classList.add('nohints');
  if (G.arcade) document.body.classList.add('arcade');
  if (G.statLabel) $('stat1L').textContent = G.statLabel;
  if (G.newText) $('winNew').textContent = G.newText;
  $('rulesBody').innerHTML = G.rules;
  loadSaved();
  renderLevels();
  showView('home');
  setInterval(tick, 1000);
  const intro = $('intro');
  const hideIntro = () => { if (intro.classList.contains('out')) return; intro.classList.add('out'); setTimeout(() => intro.remove(), 700); };
  intro.addEventListener('pointerdown', hideIntro);
  setTimeout(hideIntro, 2700);
}
