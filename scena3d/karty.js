// Karty do Knihy kúziel, príklady podľa toho, čo dieťa vie, a mapa zóny. Bez grafiky – dá sa testovať v Node.
// Karty fungujú samy, keď počítaš (ako žolíky v Balatro) – v súboji sa nič nevyberá, len počíta.

export const CARDS = {
  mraz: { name: 'Mráz', color: '#5aa6e0', icon: 'snow', text: l => `Odpoveď do ${l > 1 ? 3 : 2} s zmrazí cieľ na ${l > 1 ? 5 : 3} s.` },
  retaz: { name: 'Reťaz', color: '#e8c840', icon: 'bolt', text: l => `Každá ${l > 1 ? 2 : 3}. správna v rade preskočí bleskom na ďalšieho.` },
  ohen: { name: 'Oheň', color: '#e0643a', icon: 'fire', text: l => `Zásah podpáli: nepriateľ ide ${l > 1 ? '60' : '40'} % pomalšie.` },
  stit: { name: 'Štít', color: '#9a9aa2', icon: 'shield', text: l => `${l > 1 ? 'Prvé dva údery' : 'Prvý úder'} v súboji ťa nebolí.` },
  ozvena: { name: 'Ozvena', color: '#b07ad8', icon: 'echo', text: l => `Výsledok ${l > 1 ? '4' : '6'} a viac vystrelí aj druhé kúzlo.` },
  zlato: { name: 'Zlatá ruka', color: '#e8b040', icon: 'coin', text: l => `Rýchla odpoveď = ${l > 1 ? 2 : 1} ${l > 1 ? 'mince' : 'minca'}.` },
  srdce: { name: 'Srdce', color: '#d43a3a', icon: 'heart', text: l => `+${l} ${l > 1 ? 'srdiečka' : 'srdiečko'} navyše.` },
  cas: { name: 'Pomalý čas', color: '#60be68', icon: 'clock', text: l => `Nepriatelia sú o ${l > 1 ? 35 : 20} % pomalší.` },
};
export const SLOTS = 4;
export const lvl = (run, id) => (run.cards.find(c => c.id === id) || { l: 0 }).l;

// tri karty na výber (karta, ktorú už máš na 2. úrovni, sa neponúka)
export function offer(run, rng, n = 3) {
  const pool = Object.keys(CARDS).filter(id => lvl(run, id) < 2);
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

// ---------- príklady (1. ročník: + a − do 5, 10, 20 bez prechodu cez desiatku) ----------
// run.ops = ['+'] alebo ['+','-'], run.range = 5 | 10 | 20
export function makeProblem(run, kind, rng = Math.random) {
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const R = run.range, minus = run.ops.includes('-') && rng() < 0.5;
  const top = kind === 'easy' ? Math.min(R, 5) : R;
  if (kind === 'missing') {
    if (!minus) { const c = ri(3, top), b = ri(1, c - 1); return { text: `?+${b}=${c}`, answer: c - b, op: '+' }; }
    const c = ri(3, top), a = ri(1, c - 1); return { text: `${c}-?=${a}`, answer: c - a, op: '-' };
  }
  if (kind === 'three' && top >= 4) {
    if (!minus) { const a = ri(1, Math.max(1, top - 3)), b = ri(1, Math.max(1, top - a - 1)), c = ri(1, Math.max(1, top - a - b)); return { text: `${a}+${b}+${c}`, answer: a + b + c, op: '+' }; }
    const a = ri(1, top - 2), b = ri(1, top - a), c = ri(1, a + b - 1); return { text: `${a}+${b}-${c}`, answer: a + b - c, op: '-' };
  }
  if (R >= 20 && kind !== 'easy' && rng() < 0.5) { // do 20 bez prechodu cez desiatku: 13+4, 17-5
    const u = ri(1, 8); if (!minus) { const b = ri(1, 9 - u); return { text: `1${u}+${b}`, answer: 10 + u + b, op: '+' }; }
    const b = ri(1, u); return { text: `1${u}-${b}`, answer: 10 + u - b, op: '-' };
  }
  if (!minus) { const a = ri(1, top - 1), b = ri(1, top - a); return { text: `${a}+${b}`, answer: a + b, op: '+' }; }
  const a = ri(2, top), b = ri(1, a - 1); return { text: `${a}-${b}`, answer: a - b, op: '-' };
}

// ---------- mapa zóny: 7 krokov, v strede sa vyberá z dvoch ciest ----------
// boj = banda, poklad = nájdi kľúč, zamok = vyskladaj číslo, elita = silný bojovník, obchod = krčma, boss = vodca
export const ROOM_INFO = {
  boj: { name: 'Banda', goal: 'Poraz bandu' },
  poklad: { name: 'Poklad', goal: 'Nájdi kľúč' },
  zamok: { name: 'Zámok', goal: 'Otvor zámok číslom' },
  elita: { name: 'Elita', goal: 'Poraz silného bojovníka' },
  obchod: { name: 'Krčma', goal: 'Krčma – obchod' },
  boss: { name: 'Vodca', goal: 'Poraz vodcu zbojníkov' },
};
export function makeMap(rng) {
  const pick = a => a[Math.floor(rng() * a.length)];
  const pair = (a, b) => { const x = pick(a); let y = pick(b); for (let k = 0; k < 9 && y === x; k++) y = pick(b); return [x, y]; };
  return [
    ['boj'],
    pair(['poklad', 'zamok'], ['boj', 'boj']),
    pair(['boj', 'elita'], ['poklad', 'zamok']),
    ['obchod'],
    pair(['elita', 'boj'], ['zamok', 'poklad']),
    pair(['boj', 'poklad'], ['elita', 'zamok']),
    ['boss'],
  ];
}
