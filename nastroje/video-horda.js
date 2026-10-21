// Video na kontrolu: Majster v pokročilom štádiu (zóna 5, veľa hôrd naraz), aby bolo vidno životy a damage pri dave nepriateľov.
// Spusti (server mathemagic na :8815): node nastroje/video-horda.js <priečinok>   → webm v priečinku, potom ffmpeg na mp4
const { chromium } = require('/Users/thevilo/Projects/rodinne-hry/node_modules/playwright');
const OUT = process.argv[2] || 'video-out', W = 1280, H = 720, LEN = +(process.argv[3] || 45);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8815/scena3d/', { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-meta', JSON.stringify({ seen: [], tutDone: true, unlock: {} })); sessionStorage.setItem('mm-alive', '1'); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.evaluate(() => { const r = __h.run; r.mode = 'pokrocily'; r.tut = 99; localStorage.setItem('mm-run', JSON.stringify(r)); sessionStorage.setItem('mm-skip', '1'); });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  // pokročilý beh: zóna 5, úroveň 20, Vedecká palica, dve kúzla (9★² × 8 a 7 × 6 + 5)
  await p.evaluate(() => {
    const r = __h.run; r.zone = 5; r.lvl = 20; r.hearts = 99; r.ops = ['+', '-', '×', '÷']; r.range = 9;
    const P = r.pack; P.kind = 'vedecka'; P.staff = 2; P.slots = 7; P.unlock = { p: true, s: true, q: true, c: true }; P.stars = { 9: 1 };
    P.inv = [{ id: 1, t: 'n', v: 9 }, { id: 2, t: 'o', v: '×' }, { id: 3, t: 'n', v: 8 }, { id: 4, t: 'n', v: 7 }, { id: 5, t: 'o', v: '×' }, { id: 6, t: 'n', v: 6 }, { id: 7, t: 'o', v: '+' }, { id: 8, t: 'n', v: 5 }];
    P.rows = [[1, -4, 2, 3], [4, 5, 6, 7, 8]]; P.next = 9; r.energy = 99;
  });
  // auto hráč: chodí v kruhu, strieľa na najbližšieho (energia rozhoduje, kedy to ide)
  await p.evaluate(async () => {
    const S = await import('/scena3d/suboj.js'); const h = __h, o = h.hero.position.clone(); let a = 0;
    setInterval(() => { a += 0.9; h.walk(o.x + Math.cos(a) * 4, o.z + Math.sin(a) * 4); }, 1600);
    setInterval(() => { const al = h.fight.enemies.filter(e => e.state !== 'dead'); if (!al.length) return; al.sort((x, y) => x.g.position.distanceTo(h.hero.position) - y.g.position.distanceTo(h.hero.position)); S.fireAt(al[0]); }, 250);
    // viac hôrd za sebou (6, 7, 8, 9 → vyše 40 nepriateľov naraz)
    let n = 5; h.setHorde(n); const t = setInterval(() => { n++; h.setHorde(n); if (n >= 8) clearInterval(t); }, 5000);
  });
  await p.waitForTimeout(LEN * 1000);
  console.log('nepriatelia', await p.evaluate(() => __h.fight.enemies.filter(e => e.state !== 'dead').length), 'chyby', errs.slice(0, 3));
  await ctx.close(); await b.close();
})();
