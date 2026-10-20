// Generátor príkladov + adaptívna obtiažnosť. Čisté funkcie, bez závislosti na hre.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHOW = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Vlastný parser s poradím operácií (× ÷ pred + −), bez eval().
export function evaluate(operands, ops) {
  const vals = [operands[0]], rest = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i], b = operands[i + 1];
    if (o === '*') vals[vals.length - 1] *= b;
    else if (o === '/') vals[vals.length - 1] /= b;
    else { rest.push(o); vals.push(b); }
  }
  let r = vals[0];
  rest.forEach((o, i) => { r = o === '+' ? r + vals[i + 1] : r - vals[i + 1]; });
  return r;
}

function makeProblem(operands, ops) {
  const text = operands.map((n, i) => (i ? ` ${SHOW[ops[i - 1]]} ` : '') + n).join('');
  const lastOp = ops.includes('*') || ops.includes('/') ? ops.filter(o => o === '*' || o === '/').pop() : ops[ops.length - 1];
  return { text, answer: evaluate(operands, ops), operands, ops, operation: lastOp, tier: operands.length };
}

function termCount(difficulty, rng) {
  if (difficulty <= 30) return 2;
  if (difficulty <= 60) return rng() < 0.5 ? 2 : 3;
  return rng() < 0.5 ? 3 : 4;
}

function valid(p, opts, state) {
  if (!Number.isInteger(p.answer)) return false;
  if (p.answer < 0 && !state.negatives) return false;
  if (p.answer > opts.cap) return false;
  return true;
}

// state = { unlockedNumbers, unlockedOperations, retry }, opts = { cap, last }
export function generateProblem(state, difficulty, rng, opts = {}) {
  const o = { cap: 20, last: '', ...opts };
  const nums = state.unlockedNumbers, opsAll = state.unlockedOperations;

  // Opakovanie chýb: splatný príklad s vyššou pravdepodobnosťou.
  const due = (state.retry || []).filter(r => r.due <= 0);
  if (due.length && rng() < 0.6) {
    const r = pick(due, rng), p = makeProblem(r.operands, r.ops);
    if (p.text !== o.last) return p;
  }

  let fallback = null;
  for (let tries = 0; tries < 80; tries++) {
    const n = termCount(difficulty, rng);
    const mixed = difficulty > 60 && opsAll.length > 1;
    const single = pick(opsAll, rng);
    const ops = Array.from({ length: n - 1 }, () => (mixed ? pick(opsAll, rng) : single));
    const operands = Array.from({ length: n }, () => pick(nums, rng));
    // Násobenie pri nízkej obtiažnosti len malá násobilka.
    if (difficulty < 40) ops.forEach((op, i) => { if (op === '*') { operands[i] = Math.min(operands[i], 5); } });
    // Delenie: deliteľ ≠ 0, delenec dopočítaný, aby vyšlo celé číslo.
    for (let i = 0; i < ops.length; i++) if (ops[i] === '/') {
      const divs = nums.filter(x => x > 0); if (!divs.length) continue;
      operands[i + 1] = pick(divs, rng);
      if (i === 0 || (ops[i - 1] !== '*' && ops[i - 1] !== '/')) operands[i] = operands[i + 1] * pick(divs, rng);
    }
    const p = makeProblem(operands, ops);
    if (!valid(p, o, state)) continue;
    if (!fallback) fallback = p;
    if (p.text === o.last) continue;
    return p;
  }
  if (fallback) return fallback;
  const m = Math.min(...nums);
  return makeProblem([m, m], ['+']);
}

// ---------- adaptívna obtiažnosť ----------
const TARGET = { '+': 4000, '-': 5000, '*': 8000, '/': 8000 };
export function createMathState() {
  return { difficulty: 0, history: [], retry: [], stats: {}, since: 0 };
}
export function recordAnswer(ms, p, correct, timeMs) {
  const target = TARGET[p.operation] * (1 + (p.operands.length - 2) * 0.6);
  ms.history.push({ c: correct, t: timeMs, target });
  if (ms.history.length > 10) ms.history.shift();

  const st = ms.stats[p.operation] || (ms.stats[p.operation] = { ok: 0, bad: 0, time: 0 });
  correct ? st.ok++ : st.bad++;
  st.time += timeMs;

  ms.retry.forEach(r => r.due--);
  const key = p.text, ex = ms.retry.find(r => r.text === key);
  if (!correct) {
    if (ex) { ex.streak = 0; ex.due = 3; }
    else ms.retry.push({ text: key, operands: p.operands, ops: p.ops, streak: 0, due: 3 });
  } else if (ex) {
    ex.streak++; ex.due = 2;
    if (ex.streak >= 2) ms.retry.splice(ms.retry.indexOf(ex), 1);
  }

  if (++ms.since >= 5) {
    ms.since = 0;
    const h = ms.history, acc = h.filter(x => x.c).length / h.length;
    const fast = h.reduce((s, x) => s + x.t, 0) < h.reduce((s, x) => s + x.target, 0);
    if (acc >= 0.85 && fast) ms.difficulty = Math.min(100, ms.difficulty + 5);
    else if (acc < 0.6) ms.difficulty = Math.max(0, ms.difficulty - 5);
  }
}
