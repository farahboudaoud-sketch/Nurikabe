// Nurikabe 塗 : moteur (générateur, solveur, raisonnements)
// Cases : -1 inconnue, 0 mer (noire), 1 île (blanche).
const NuriEngine = (function () {
  function makeBoard(W, H, clues) {         // clues: [{r,c,n}]
    const N = W * H, clueAt = new Int16Array(N);
    clues.forEach(q => (clueAt[q.r * W + q.c] = q.n));
    const nb = [];
    for (let i = 0; i < N; i++) {
      const r = (i / W) | 0, c = i % W, l = [];
      if (r > 0) l.push(i - W); if (r < H - 1) l.push(i + W);
      if (c > 0) l.push(i - 1); if (c < W - 1) l.push(i + 1);
      nb.push(l);
    }
    const total = clues.reduce((a, q) => a + q.n, 0);
    return { W, H, N, clues, clueAt, nb, whiteTotal: total, blackTotal: N - total };
  }
  function initial(B) {
    const v = new Int8Array(B.N).fill(-1);
    for (let i = 0; i < B.N; i++) if (B.clueAt[i]) v[i] = 1;
    return v;
  }
  // white components: comp[i] = id, info[id] = {cells, clue, clueCell}
  function whiteComps(B, v) {
    const comp = new Int32Array(B.N).fill(-1), info = [];
    for (let i = 0; i < B.N; i++) if (v[i] === 1 && comp[i] < 0) {
      const id = info.length, cells = [i]; comp[i] = id;
      let clue = 0, clueCell = -1, clues = 0;
      for (let k = 0; k < cells.length; k++) {
        const a = cells[k];
        if (B.clueAt[a]) { clue = B.clueAt[a]; clueCell = a; clues++; }
        for (const b of B.nb[a]) if (v[b] === 1 && comp[b] < 0) { comp[b] = id; cells.push(b); }
      }
      info.push({ cells, clue, clueCell, clues });
    }
    return { comp, info };
  }
  function blackComps(B, v) {
    const comp = new Int32Array(B.N).fill(-1), info = [];
    for (let i = 0; i < B.N; i++) if (v[i] === 0 && comp[i] < 0) {
      const id = info.length, cells = [i]; comp[i] = id;
      for (let k = 0; k < cells.length; k++) for (const b of B.nb[cells[k]]) if (v[b] === 0 && comp[b] < 0) { comp[b] = id; cells.push(b); }
      info.push({ cells });
    }
    return { comp, info };
  }
  const REASON = {
    full: n => `Cette île de ${n} est complète : les cases qui la touchent sont forcément de la mer.`,
    between: () => `Cette case toucherait deux îles numérotées à la fois, qui se retrouveraient soudées : c'est forcément de la mer.`,
    toobig: n => `Si cette case était de la terre, l'île de ${n} deviendrait trop grande : c'est forcément de la mer.`,
    far: () => `Aucune île numérotée ne peut s'étendre jusqu'ici avec sa taille : cette case est forcément de la mer.`,
    grow: n => `L'île de ${n} doit encore grandir et n'a plus qu'une seule sortie : cette case en fait partie.`,
    escape: () => `Ces cases de terre doivent rejoindre une île numérotée, et il ne reste qu'un seul passage : cette case est de la terre.`,
    pool: () => `Sinon, quatre cases de mer formeraient un carré 2×2, ce qui est interdit : cette case est de la terre.`,
    sea: () => `Cette zone de mer doit rejoindre le reste de la mer, et ce passage est le seul possible : c'est de la mer.`,
    countB: () => `Toutes les cases de mer sont déjà placées : les cases restantes sont de la terre.`,
    countW: () => `Toutes les îles ont déjà leur taille : les cases restantes sont de la mer.`
  };
  // note(i, val, reasonText, focusCell) -> true to stop
  function propagate(B, v, note) {
    const set = (i, val, why, focus) => {
      if (v[i] === val) return 0;
      if (v[i] !== -1) return -1;
      v[i] = val;
      if (note && note(i, val, why, focus)) return 2;
      return 1;
    };
    let changed = true;
    while (changed) {
      changed = false;
      const { comp, info } = whiteComps(B, v);
      for (const w of info) {
        if (w.clues > 1) return false;
        if (w.clue && w.cells.length > w.clue) return false;
      }
      // A. complete islands, merges that would join two clues or exceed a size
      for (let i = 0; i < B.N; i++) {
        if (v[i] !== -1) continue;
        const ids = [];
        for (const b of B.nb[i]) if (v[b] === 1 && !ids.includes(comp[b])) ids.push(comp[b]);
        if (!ids.length) continue;
        let clues = 0, size = 1, clue = 0, cc = -1;
        for (const id of ids) { clues += info[id].clues; size += info[id].cells.length; if (info[id].clue) { clue = info[id].clue; cc = info[id].clueCell; } }
        let why = null;
        if (clues > 1) why = REASON.between();
        else if (clue && size > clue) {
          const full = ids.some(id => info[id].clue && info[id].cells.length === info[id].clue);
          why = full ? REASON.full(clue) : REASON.toobig(clue);
        }
        if (why) {
          const r = set(i, 0, why, cc >= 0 ? cc : i);
          if (r < 0) return false; if (r === 2) return 'stop'; if (r) changed = true;
        }
      }
      if (changed) continue;
      // B. 2x2 pools
      for (let r = 0; r < B.H - 1; r++) for (let c = 0; c < B.W - 1; c++) {
        const q = [r * B.W + c, r * B.W + c + 1, (r + 1) * B.W + c, (r + 1) * B.W + c + 1];
        let blacks = 0, unk = -1, nu = 0;
        for (const i of q) { if (v[i] === 0) blacks++; else if (v[i] === -1) { nu++; unk = i; } }
        if (blacks === 4) return false;
        if (blacks === 3 && nu === 1) {
          const rr = set(unk, 1, REASON.pool(), unk);
          if (rr < 0) return false; if (rr === 2) return 'stop'; changed = true;
        }
      }
      if (changed) continue;
      // C. reachability from numbered islands
      const reach = new Uint8Array(B.N);
      const blocked = i => { for (const b of B.nb[i]) if (v[b] === 1) return true; return false; };
      for (const w of info) {
        if (!w.clue) continue;
        w.cells.forEach(i => (reach[i] = 1));
        const budget = w.clue - w.cells.length;
        if (budget <= 0) continue;
        const dist = new Int16Array(B.N).fill(-1), qq = [];
        w.cells.forEach(i => { dist[i] = 0; qq.push(i); });
        for (let k = 0; k < qq.length; k++) {
          const a = qq[k];
          if (dist[a] >= budget) continue;
          for (const b of B.nb[a]) {
            if (dist[b] >= 0 || v[b] === 0) continue;
            if (v[b] === -1) {
              // can't step next to another numbered island
              let bad = false;
              for (const x of B.nb[b]) if (v[x] === 1 && comp[x] !== comp[w.cells[0]] && info[comp[x]].clue) { bad = true; break; }
              if (bad) continue;
            } else if (info[comp[b]].clue) continue;
            dist[b] = dist[a] + 1; reach[b] = 1; qq.push(b);
          }
        }
      }
      for (const w of info) if (!w.clue && !w.cells.some(i => reach[i])) return false;
      for (let i = 0; i < B.N; i++) if (v[i] === -1 && !reach[i]) {
        const r = set(i, 0, REASON.far(), i);
        if (r < 0) return false; if (r === 2) return 'stop'; changed = true;
      }
      if (changed) continue;
      // D. islands that must grow through a single exit
      for (const w of info) {
        if (w.clue && w.cells.length === w.clue) continue;
        const exits = new Set();
        for (const a of w.cells) for (const b of B.nb[a]) if (v[b] === -1) exits.add(b);
        if (!exits.size) return false;
        if (exits.size === 1) {
          const [e] = exits;
          const r = set(e, 1, w.clue ? REASON.grow(w.clue) : REASON.escape(), w.clue ? w.clueCell : w.cells[0]);
          if (r < 0) return false; if (r === 2) return 'stop'; changed = true;
          break;
        }
      }
      if (changed) continue;
      // E. sea connectivity and counts
      const bc = blackComps(B, v);
      let blacks = 0, whites = 0;
      for (let i = 0; i < B.N; i++) { if (v[i] === 0) blacks++; else if (v[i] === 1) whites++; }
      if (blacks > B.blackTotal || whites > B.whiteTotal) return false;
      if (bc.info.length > 1 || blacks < B.blackTotal) {
        for (const b of bc.info) {
          const exits = new Set();
          for (const a of b.cells) for (const x of B.nb[a]) if (v[x] === -1) exits.add(x);
          if (!exits.size) { if (bc.info.length > 1 || blacks < B.blackTotal) return false; }
          if (exits.size === 1 && bc.info.length > 1) {
            const [e] = exits;
            const r = set(e, 0, REASON.sea(), e);
            if (r < 0) return false; if (r === 2) return 'stop'; changed = true;
            break;
          }
        }
      }
      if (changed) continue;
      if (blacks === B.blackTotal || whites === B.whiteTotal) {
        const val = blacks === B.blackTotal ? 1 : 0;
        for (let i = 0; i < B.N; i++) if (v[i] === -1) {
          const r = set(i, val, val ? REASON.countB() : REASON.countW(), i);
          if (r < 0) return false; if (r === 2) return 'stop'; changed = true;
        }
      }
    }
    return true;
  }
  function solvedValid(B, v) {
    for (let i = 0; i < B.N; i++) if (v[i] === -1) return false;
    const { info } = whiteComps(B, v);
    for (const w of info) if (w.clues !== 1 || w.cells.length !== w.clue) return false;
    const bc = blackComps(B, v);
    if (bc.info.length > 1) return false;
    for (let r = 0; r < B.H - 1; r++) for (let c = 0; c < B.W - 1; c++) {
      const i = r * B.W + c;
      if (!v[i] && !v[i + 1] && !v[i + B.W] && !v[i + B.W + 1]) return false;
    }
    return true;
  }
  function count(B, limit, maxNodes) {
    let n = 0, nodes = 0, sol = null; const sols = [];
    maxNodes = maxNodes || 20000;
    const rec = v => {
      if (n >= limit || nodes > maxNodes) return;
      nodes++;
      if (propagate(B, v) === false) return;
      let pick = -1;
      for (let i = 0; i < B.N; i++) if (v[i] === -1) {
        for (const b of B.nb[i]) if (v[b] === 1) { pick = i; break; }
        if (pick >= 0) break;
      }
      if (pick < 0) for (let i = 0; i < B.N; i++) if (v[i] === -1) { pick = i; break; }
      if (pick < 0) { if (solvedValid(B, v)) { n++; sol = Array.from(v); sols.push(sol); } return; }
      for (const val of [1, 0]) { const v2 = v.slice(); v2[pick] = val; rec(v2); if (n >= limit) return; }
    };
    rec(initial(B));
    return { count: n, sol, sols, aborted: nodes > maxNodes };
  }
  // Difficulty: simple propagation, then proofs by contradiction.
  function rate(B) {
    const v = initial(B);
    if (propagate(B, v) === false) return { level: -1 };
    const open = () => { let k = 0; for (let i = 0; i < B.N; i++) if (v[i] === -1) k++; return k; };
    const u0 = open();
    let look = 0;
    while (open()) {
      let progress = false;
      for (let i = 0; i < B.N && !progress; i++) {
        if (v[i] !== -1) continue;
        for (const val of [1, 0]) {
          const v2 = v.slice(); v2[i] = val;
          if (propagate(B, v2) === false) {
            v[i] = 1 - val; look++; progress = true;
            if (propagate(B, v) === false) return { level: -1 };
            break;
          }
        }
      }
      if (!progress) return { level: 2, u0, look, stuck: v };
    }
    if (!solvedValid(B, v)) return { level: -1 };
    return { level: u0 ? 1 : 0, u0, look };
  }
  // ---- generator ----
  function blackConnected(W, H, sol) {
    const N = W * H; let start = -1, total = 0;
    for (let i = 0; i < N; i++) if (!sol[i]) { total++; if (start < 0) start = i; }
    if (!total) return true;
    const seen = new Uint8Array(N), q = [start]; seen[start] = 1; let k = 0, cnt = 1;
    while (k < q.length) {
      const a = q[k++], r = (a / W) | 0, c = a % W;
      const ns = [];
      if (r > 0) ns.push(a - W); if (r < H - 1) ns.push(a + W); if (c > 0) ns.push(a - 1); if (c < W - 1) ns.push(a + 1);
      for (const b of ns) if (!sol[b] && !seen[b]) { seen[b] = 1; cnt++; q.push(b); }
    }
    return cnt === total;
  }
  function genOnce(L) {
    const { W, H } = L, N = W * H;
    const sol = new Int8Array(N), own = new Int32Array(N).fill(-1);
    const nbs = i => { const r = (i / W) | 0, c = i % W, l = []; if (r > 0) l.push(i - W); if (r < H - 1) l.push(i + W); if (c > 0) l.push(i - 1); if (c < W - 1) l.push(i + 1); return l; };
    const islands = [];
    const rnd = n => Math.floor(Math.random() * n);
    const sizeDraw = () => { const m = L.maxIsl; const a = 1 + rnd(m), b = 1 + rnd(m); return Math.max(1, Math.round((a + b) / 2)); };
    const canOwn = (i, id) => { if (sol[i]) return false; for (const b of nbs(i)) if (sol[b] && own[b] !== id) return false; return true; };
    const tryAdd = (i, id) => {
      sol[i] = 1; own[i] = id;
      if (!blackConnected(W, H, sol)) { sol[i] = 0; own[i] = -1; return false; }
      return true;
    };
    let fails = 0;
    while (fails < N * 3) {
      let white = 0; for (let i = 0; i < N; i++) white += sol[i];
      if (white / N >= L.white) break;
      const seed = rnd(N), id = islands.length;
      if (!canOwn(seed, id) || !tryAdd(seed, id)) { fails++; continue; }
      const cells = [seed], t = sizeDraw();
      while (cells.length < t) {
        const cand = [];
        for (const a of cells) for (const b of nbs(a)) if (canOwn(b, id) && !cand.includes(b)) cand.push(b);
        let ok = false;
        while (cand.length) { const b = cand.splice(rnd(cand.length), 1)[0]; if (tryAdd(b, id)) { cells.push(b); ok = true; break; } }
        if (!ok) break;
      }
      islands.push(cells);
    }
    // break 2x2 pools
    for (let pass = 0; pass < 4; pass++) {
      let pools = 0;
      for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
        const q = [r * W + c, r * W + c + 1, (r + 1) * W + c, (r + 1) * W + c + 1];
        if (q.some(i => sol[i])) continue;
        pools++;
        const order = q.slice().sort(() => Math.random() - 0.5);
        let fixed = false;
        for (const i of order) {
          const ids = [...new Set(nbs(i).filter(b => sol[b]).map(b => own[b]))];
          if (ids.length > 1) continue;
          if (ids.length === 1) {
            if (islands[ids[0]].length >= L.maxIsl + 2) continue;
            if (tryAdd(i, ids[0])) { islands[ids[0]].push(i); fixed = true; break; }
          } else {
            const id = islands.length;
            if (tryAdd(i, id)) { islands.push([i]); fixed = true; break; }
          }
        }
      }
      if (!pools) break;
    }
    for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
      const i = r * W + c;
      if (!sol[i] && !sol[i + 1] && !sol[i + W] && !sol[i + W + 1]) return null;
    }
    const clues = islands.map(cells => { const i = cells[rnd(cells.length)]; return { r: (i / W) | 0, c: i % W, n: cells.length }; });
    return { W, H, clues, sol: Array.from(sol) };
  }
  // Make the grid unique: while another solution exists, change the clues where it disagrees with ours.
  function repair(g, maxFix) {
    const { W, H } = g, N = W * H, sol = g.sol.slice();
    const nbs = i => { const r = (i / W) | 0, c = i % W, l = []; if (r > 0) l.push(i - W); if (r < H - 1) l.push(i + W); if (c > 0) l.push(i - 1); if (c < W - 1) l.push(i + 1); return l; };
    let clues = g.clues.map(q => ({ ...q }));
    for (let fix = 0; fix <= maxFix; fix++) {
      const B = makeBoard(W, H, clues);
      const c = count(B, 2, 30000);
      if (c.aborted) return null;
      if (c.count === 1) return { W, H, clues, sol };
      if (fix === maxFix) return null;
      const other = c.sols.find(s => s.some((x, i) => x !== sol[i]));
      if (!other) return null;
      // island of each of our white cells
      const own = new Int32Array(N).fill(-1);
      clues.forEach((q, k) => {
        const st = [q.r * W + q.c]; own[st[0]] = k;
        for (let a = 0; a < st.length; a++) for (const b of nbs(st[a])) if (sol[b] && own[b] < 0) { own[b] = k; st.push(b); }
      });
      const opts = [];
      for (let i = 0; i < N; i++) {
        if (other[i] === sol[i]) continue;
        if (sol[i] && !B.clueAt[i]) opts.push(() => { const q = clues[own[i]]; q.r = (i / W) | 0; q.c = i % W; });
        if (!sol[i] && !nbs(i).some(b => sol[b])) opts.push(() => {
          sol[i] = 1;
          if (!blackConnected(W, H, sol)) { sol[i] = 0; return false; }
          clues.push({ r: (i / W) | 0, c: i % W, n: 1 });
        });
      }
      if (!opts.length) return null;
      let done = false;
      for (let k = 0; k < 6 && !done; k++) done = opts[Math.floor(Math.random() * opts.length)]() !== false;
      if (!done) return null;
    }
    return null;
  }
  // Make the grid solvable by plain reasoning: where it gets stuck, give a clue right there
  // (a new island of 1 on a sea cell, or move the clue of an island onto one of its cells).
  function repairFast(g, maxFix) {
    const { W, H } = g, N = W * H, sol = g.sol.slice();
    const nbs = i => { const r = (i / W) | 0, c = i % W, l = []; if (r > 0) l.push(i - W); if (r < H - 1) l.push(i + W); if (c > 0) l.push(i - 1); if (c < W - 1) l.push(i + 1); return l; };
    const clues = g.clues.map(q => ({ ...q }));
    for (let fix = 0; fix <= maxFix; fix++) {
      const B = makeBoard(W, H, clues);
      const v = initial(B);
      const r = propagate(B, v);
      if (r === false) { repairFast.why = 'contra'; return null; }
      const unk = []; for (let i = 0; i < N; i++) if (v[i] === -1) unk.push(i);
      if (!unk.length) { if (!solvedValid(B, v)) repairFast.why = 'invalid'; return solvedValid(B, v) ? { W, H, clues, sol, added: g.added || 0 } : null; }
      // prefer the frontier: unknown cells next to a decided one
      const front = unk.filter(i => nbs(i).some(b => v[b] !== -1));
      const pool = front.length ? front : unk;
      const own = new Int32Array(N).fill(-1);
      clues.forEach((q, k) => {
        const st = [q.r * W + q.c]; own[st[0]] = k;
        for (let a = 0; a < st.length; a++) for (const b of nbs(st[a])) if (sol[b] && own[b] < 0) { own[b] = k; st.push(b); }
      });
      let done = false;
      const blackPool = pool.filter(i => !sol[i]), blackAll = unk.filter(i => !sol[i]);
      for (let k = 0; k < 60 && !done; k++) {
        const from = k < 20 && blackPool.length ? blackPool : k < 45 && blackAll.length ? blackAll : unk;
        const i = from[Math.floor(Math.random() * from.length)];
        if (sol[i]) {
          if (B.clueAt[i] || k < 45) continue;
          const q = clues[own[i]]; q.r = (i / W) | 0; q.c = i % W; done = true;
          continue;
        }
        const ids = [...new Set(nbs(i).filter(b => sol[b]).map(b => own[b]))];
        if (ids.length === 0) {
          sol[i] = 1;
          if (!blackConnected(W, H, sol)) { sol[i] = 0; continue; }
          clues.push({ r: (i / W) | 0, c: i % W, n: 1 }); done = true;
        } else if (ids.length === 1 && clues[ids[0]].n < (g.maxIsl || 9) + 3) {
          // grow the neighbouring island onto this cell, and move its clue here
          sol[i] = 1;
          if (!blackConnected(W, H, sol)) { sol[i] = 0; continue; }
          const q = clues[ids[0]]; q.n += 1;
          if (Math.random() < 0.5) { q.r = (i / W) | 0; q.c = i % W; }
          done = true;
        }
      }
      if (!done) { repairFast.why = 'nofix'; return null; }
    }
    repairFast.why = 'max'; return null;
  }
  // Make it harder: take away given information while the grid stays solvable (with proofs by contradiction allowed).
  function harden(g, maxTries) {
    const { W, H } = g, N = W * H;
    let clues = g.clues.map(q => ({ ...q })), sol = g.sol.slice(), best = null;
    const nbs = i => { const r = (i / W) | 0, c = i % W, l = []; if (r > 0) l.push(i - W); if (r < H - 1) l.push(i + W); if (c > 0) l.push(i - 1); if (c < W - 1) l.push(i + 1); return l; };
    const ones = clues.filter(q => q.n === 1).sort(() => Math.random() - 0.5);
    let rating = rate(makeBoard(W, H, clues));
    for (const q of ones.slice(0, maxTries)) {
      const i = q.r * W + q.c;
      const s2 = sol.slice(); s2[i] = 0;
      // no 2x2 sea around it
      let pool = false;
      const r = q.r, c = q.c;
      for (const [dr, dc] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const r0 = r + dr, c0 = c + dc;
        if (r0 < 0 || c0 < 0 || r0 >= H - 1 || c0 >= W - 1) continue;
        const a = r0 * W + c0;
        if (!s2[a] && !s2[a + 1] && !s2[a + W] && !s2[a + W + 1]) pool = true;
      }
      if (pool) continue;
      const c2 = clues.filter(x => x !== q);
      const rt = rate(makeBoard(W, H, c2));
      if (rt.level === 0 || rt.level === 1) { clues = c2; sol = s2; rating = rt; }
    }
    return { W, H, clues, sol, rating };
  }
  function generate(L) {
    const t0 = Date.now();
    let best = null;
    for (let a = 0; a < 3000; a++) {
      if (Date.now() - t0 > 6000 && best) break;
      const g0 = genOnce(L);
      if (!g0) continue;
      g0.maxIsl = L.maxIsl;
      let g = repairFast(g0, Math.round(g0.W * g0.H / 2));
      if (!g) continue;
      if (L.simple) return { ...g, rating: { level: 0, look: 0 } };
      g = harden(g, L.hardenTries || 12);
      const look = g.rating.look || 0;
      if (!L.hard || look >= L.hard.look) return g;
      if (!best || look > best.rating.look) best = g;
    }
    return best || genFallback(L);
  }
  function genFallback(L) {      // always ends with a valid (maybe not unique) grid
    for (;;) { const g = genOnce(L); if (g) return g; }
  }
  return { repair, repairFast, harden, makeBoard, initial, propagate, solvedValid, count, rate, generate, whiteComps, blackComps, genOnce };
})();
if (typeof module !== 'undefined') module.exports = NuriEngine;

// ---------------------------------------------------------------------------
// Interface Nurikabe. st.x : 0 inconnu, 1 mer (noircie), 2 terre (point).
// ---------------------------------------------------------------------------
(function () {
  if (typeof registerGame === 'undefined') return;
  const E = NuriEngine;
  let B = null, paint = null;
  const LV = {
    facile:    { W: 6, H: 6, maxIsl: 4, white: .45, simple: true, label: 'Facile',    kanji: '易' },
    moyen:     { W: 7, H: 7, maxIsl: 5, white: .45, simple: true, label: 'Moyen',     kanji: '中' },
    difficile: { W: 8, H: 8, maxIsl: 6, white: .45, simple: true, label: 'Difficile', kanji: '難' },
    expert:    { W: 9, H: 9, maxIsl: 6, white: .45, simple: true, label: 'Expert',    kanji: '極' },
    maitre:    { W: 9, H: 9, maxIsl: 8, white: .44, label: 'Maître', kanji: '鬼', sizeLabel: '9×9 · grandes îles' }
  };
  const customLevel = (W, H, hard) => ({ W, H, maxIsl: hard ? 8 : 5, white: .45, simple: !hard, label: 'Personnalisé', kanji: '自' });
  function known(s) {
    const v = E.initial(B);
    for (let i = 0; i < B.N; i++) {
      if (B.clueAt[i]) continue;
      if (s.x[i] === 1 && !s.sol[i]) v[i] = 0;
      else if (s.x[i] === 2 && s.sol[i]) v[i] = 1;
    }
    return v;
  }
  function findHint(s) {
    for (let i = 0; i < B.N; i++) {
      if (B.clueAt[i]) continue;
      if (s.x[i] === 1 && s.sol[i]) return { type: 'wrong', i, val: 1, text: 'Cette case fait partie d\'une île : elle ne doit pas être de la mer.' };
      if (s.x[i] === 2 && !s.sol[i]) return { type: 'wrong', i, val: 0, text: 'Cette case est de la mer, pas de la terre.' };
    }
    let found = null;
    // sea first (that's what the player paints), land marks second
    for (const want of [0, 1]) {
      const v = known(s);
      E.propagate(B, v, (i, val, why, focus) => {
        if (val !== want) return false;
        if ((val === 0 && s.x[i] === 1) || (val === 1 && s.x[i] === 2)) return false;
        found = { i, val, text: why + (val === 1 ? ' Marque-la d\'un point.' : ''), focus }; return true;
      });
      if (found) break;
    }
    if (!found) {
      const v = known(s); E.propagate(B, v);
      for (let i = 0; i < B.N && !found; i++) {
        if (v[i] !== -1) continue;
        for (const val of [1, 0]) {
          const v2 = v.slice(); v2[i] = val;
          if (E.propagate(B, v2) === false) {
            found = { i, val: 1 - val, focus: i, text: val === 1
              ? 'Raisonnement par l\'absurde : si cette case était de la terre, une île deviendrait impossible (trop grande, soudée à une autre ou coupant la mer). C\'est donc de la mer.'
              : 'Raisonnement par l\'absurde : si cette case était de la mer, la mer formerait un bloc 2×2 ou une île ne pourrait plus atteindre sa taille. C\'est donc de la terre.' };
            break;
          }
        }
      }
    }
    if (!found) for (let i = 0; i < B.N; i++) if (!B.clueAt[i] && !s.sol[i] && s.x[i] !== 1) { found = { i, val: 0, focus: i, text: 'Déduction avancée : cette case est de la mer.' }; break; }
    return found;
  }
  const FIGS = (() => {
    const s = 18;
    const draw = (W, H, g, bad) => {   // g: rows of chars : '#' mer, 'o' terre, chiffre = île
      let o = '';
      g.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') o += `<rect class="${bad && bad.includes(r * W + c) ? 'fr' : 'fi'}" x="${c * s + 1}" y="${r * s + 1}" width="${s - 2}" height="${s - 2}" rx="2" style="fill-opacity:.85"/>`; }));
      o += figGrid(W, H, s);
      g.forEach((row, r) => [...row].forEach((ch, c) => {
        if (/[0-9]/.test(ch)) o += `<circle cx="${c * s + s / 2}" cy="${r * s + s / 2}" r="7" style="fill:var(--navy2);stroke:var(--ink);stroke-width:1.5"/>` + figNum(c * s + s / 2, r * s + s / 2, ch, '', 10);
        else if (ch === 'o') o += `<circle cx="${c * s + s / 2}" cy="${r * s + s / 2}" r="2" class="fi" style="fill:var(--ink2)"/>`;
      }));
      return o;
    };
    const f1 = draw(4, 4, ['2o#1', '####', '#3o#', '##o#']);
    const f2 = draw(4, 4, ['1###', '#o##', '#2##', '####'], [2, 3, 6, 7]);
    const f3 = draw(4, 3, ['2o##', '#1##', '####'], []) + `<rect class="frs" x="${s * .1}" y="${s * .1}" width="${s * 2.8}" height="${s * 1.8}" rx="4"/>`;
    return figFigs(
      ruleFig(f1, 4 * s, 4 * s, 'Chaque île a la taille de son nombre, et toute la mer est reliée.', 'ok'),
      ruleFig(f2, 4 * s, 4 * s, 'Un carré 2×2 de mer.', 'no'),
      ruleFig(f3, 4 * s, 3 * s, 'Deux îles qui se touchent par un côté.', 'no'));
  })();
  registerGame({
    id: 'nurikabe', name: 'Nurikabe', kanji: '塗', winText: 'Mer et îles tracées',
    levels: LV, customLevel, customDefault: { W: 8, H: 8, hard: false }, customRange: { W: [5, 9], H: [5, 9] },
    customInfo: (W, H, hard) => `${W * H} cases · ${hard ? 'grandes îles' : 'îles moyennes'}`,
    rules: `<h3 style="margin-top:0">Nurikabe 塗 : les règles</h3><ul>
      <li>Chaque nombre est une <b>île</b> : il donne le nombre de cases de terre de cette île (le nombre compris).</li>
      <li>Chaque île contient <b>un seul nombre</b>, et deux îles ne se touchent jamais par un côté.</li>
      <li>Toutes les autres cases sont de la <b>mer</b>, qui forme <b>un seul bloc</b> relié.</li>
      <li>La mer ne contient <b>aucun carré 2×2</b>.</li></ul>${FIGS}
      <h3>Commandes</h3><ul>
      <li>Touche une case : <b>mer</b>, puis <b>terre</b> (·), puis vide.</li>
      <li>Glisse le doigt pour peindre plusieurs cases de la même façon.</li></ul>`,
    valid: s => !!s.clues && !!s.sol,
    generate: L => { const g = E.generate(L); return { W: g.W, H: g.H, clues: g.clues, sol: g.sol }; },
    emptyX: s => s.sol.map(() => 0),
    prepare: s => { B = E.makeBoard(s.W, s.H, s.clues); },
    progress: s => { let p = 0; for (let i = 0; i < B.N; i++) if (!B.clueAt[i] && ((s.x[i] === 1 && !s.sol[i]) || (s.x[i] === 2 && s.sol[i]))) p++; return p; },
    check: s => {
      const v = new Int8Array(B.N);
      for (let i = 0; i < B.N; i++) v[i] = B.clueAt[i] ? 1 : (s.x[i] === 1 ? 0 : 1);
      let blacks = 0; for (let i = 0; i < B.N; i++) if (!v[i]) blacks++;
      if (blacks !== B.blackTotal) return false;
      return E.solvedValid(B, v) ? true : false;
    },
    wrong: s => { const b = new Set(); for (let i = 0; i < B.N; i++) if (!B.clueAt[i] && ((s.x[i] === 1 && s.sol[i]) || (s.x[i] === 2 && !s.sol[i]))) b.add(i); return b; },
    wrongText: n => `${plural(n, 'case')} incorrecte${n > 1 ? 's' : ''}, en rouge.`,
    findHint: s => {
      const h = findHint(s);
      if (!h) return null;
      const f = h.focus !== undefined ? h.focus : h.i;
      h.r = (f / s.W) | 0; h.c = f % s.W;
      h.focusText = B.clueAt[f] ? `Regarde cette île de ${B.clueAt[f]}.` : 'Regarde cette case et ce qui l\'entoure.';
      h.apply = st => { st.x[h.i] = h.val === 0 ? 1 : 2; };
      return h;
    },
    render: (s, ctx) => {
      const out = [], W = s.W, H = s.H, h = ctx.hint;
      for (let i = 0; i < B.N; i++) {
        const r = (i / W) | 0, c = i % W, x = c * S, y = r * S;
        const bad = ctx.flash && ctx.flash.has(i);
        if (!B.clueAt[i] && s.x[i] === 1) out.push(`<rect class="nk-sea${bad ? ' bad' : ''}" x="${x + 1.5}" y="${y + 1.5}" width="${S - 3}" height="${S - 3}" rx="4"/>`);
      }
      for (let r = 0; r <= H; r++) out.push(`<line class="gl" x1="0" y1="${r * S}" x2="${W * S}" y2="${r * S}"/>`);
      for (let c = 0; c <= W; c++) out.push(`<line class="gl" x1="${c * S}" y1="0" x2="${c * S}" y2="${H * S}"/>`);
      // complete islands: closed by sea or edges, right size
      const v = new Int8Array(B.N); for (let i = 0; i < B.N; i++) v[i] = B.clueAt[i] || s.x[i] === 2 ? 1 : (s.x[i] === 1 ? 0 : -1);
      const { info } = E.whiteComps(B, v);
      const complete = new Set();
      for (const w of info) if (w.clue && w.cells.length === w.clue && w.cells.every(a => B.nb[a].every(b => v[b] !== -1))) complete.add(w.clueCell);
      for (let i = 0; i < B.N; i++) {
        const r = (i / W) | 0, c = i % W, cx = c * S + S / 2, cy = r * S + S / 2;
        const bad = ctx.flash && ctx.flash.has(i);
        if (B.clueAt[i]) out.push(`<g class="nk-isl${complete.has(i) ? ' full' : ''}"><circle cx="${cx}" cy="${cy}" r="21"/><text x="${cx}" y="${cy + 9}">${B.clueAt[i]}</text></g>`);
        else if (s.x[i] === 2) out.push(`<circle class="nk-dot${bad ? ' bad' : ''}" cx="${cx}" cy="${cy}" r="5"/>`);
      }
      if (h && h.level >= 2) {
        const f = h.focus !== undefined ? h.focus : h.i, fr = (f / W) | 0, fc = f % W;
        out.push(`<rect class="hcell" x="${fc * S + 3}" y="${fr * S + 3}" width="${S - 6}" height="${S - 6}" rx="5"/>`);
      }
      if (h && h.level >= 3) {
        const r = (h.i / W) | 0, c = h.i % W;
        out.push(h.val === 0 && h.type !== 'wrong' ? `<rect class="nk-ghost" x="${c * S + 6}" y="${r * S + 6}" width="${S - 12}" height="${S - 12}" rx="4"/>` : `<rect class="hcell" x="${c * S + 3}" y="${r * S + 3}" width="${S - 6}" height="${S - 6}" rx="5"/>`);
      }
      return out.join('');
    },
    pointerDown: (s, pt) => {
      const cell = cellAt(pt);
      if (!cell) return { pan: true };
      const i = cell.r * s.W + cell.c;
      if (B.clueAt[i]) return { pan: true };
      const from = s.x[i], to = (from + 1) % 3;
      beginStroke();
      s.x[i] = to;
      paint = { from, to, done: new Set([i]) };
      strokeChanged();
      return { pan: false };
    },
    pointerMove: (s, g, pt) => {
      if (!paint) return;
      const cell = cellAt(pt);
      if (!cell) return;
      const i = cell.r * s.W + cell.c;
      if (paint.done.has(i) || B.clueAt[i] || s.x[i] !== paint.from) return;
      paint.done.add(i); s.x[i] = paint.to; strokeChanged();
    },
    pointerUp: () => { if (paint) { paint = null; endStroke(true); } },
    pointerCancel: () => { if (paint) { paint = null; endStroke(true); } }
  });
})();
