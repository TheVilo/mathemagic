import { makeSprite, buildSprite, A, hash } from './render.js';

// Zóna 1 – štyri obrazovky (20×11 dlaždíc po 16 px).
// T strom · b ker · 2 ker so skrytým číslom 2 · o kameň · W voda · = most (kým nie je postavený, voda)
// : cestička · f vlčie maky · SS stánok · F oheň · P podstavec s knihou · L pníček s lianou
// C truhlica · E Slizko · X boss Pňoko · 3 kameň s číslom 3 · H štart
export const SCREENS = {
  A: {
    name: 'Dedinka', exits: { e: 'B' }, map: [
      'TTTTTTTTTTTTTTTTTTTT',
      'T.....T......f.....T',
      'T..::::::::::::....T',
      'T..:SS......F.:..o.T',
      'T..:..........::::::',
      'T..:..H........:....',
      'T..:...........:::::',
      'T.b:...P.......:...T',
      'T..:::::::::::::...T',
      'T.f.....f....b.....T',
      'TTTTTTTTTTTTTTTTTTTT',
    ],
  },
  B: {
    name: 'Lúka', exits: { w: 'A', s: 'C' }, map: [
      'TTTTTTTTTTTTTTTTTTTT',
      'T...b....o.....b...T',
      'T.f....b.....f.....T',
      'T......:::::.....b.T',
      ':......:...:.......T',
      '::::::::...:..E....T',
      '.......:...:.......T',
      'T..E...:...:...C...T',
      'T.b....:...::....b2T',
      'T.....f.:::...f....T',
      'TTTTTTTTT...TTTTTTTT',
    ],
  },
  C: {
    name: 'Rieka', exits: { n: 'B', w: 'D' }, map: [
      'TTTTTTTTT...TTTTTTTT',
      'T........:........bT',
      'T..o.....:....f....T',
      'T........:..L......T',
      'WWWWWWWWW==WWWWWWWWW',
      'WWWWWWWWW==WWWWWWWWW',
      'T........:.........T',
      '.........:....E....T',
      '::::::::::.........T',
      '......f......3.....T',
      'TTTTTTTTTTTTTTTTTTTT',
    ],
  },
  D: {
    name: 'Starý les', exits: { e: 'C' }, map: [
      'TTTTTTTTTTTTTTTTTTTT',
      'TT..T.....TT...T..TT',
      'T......o.......T...T',
      'T..T....::::::.....T',
      'T......::....::..T.T',
      'T..b...:..X...:....T',
      'T......:......:....T',
      'T...T..::::::::::::.',
      'T........f........::',
      'TT....T........o....',
      'TTTTTTTTTTTTTTTTTTTT',
    ],
  },
};

// Čarodejník 14×19: klobúk s hviezdou, červený šál, plášť s tieňom. Palicu s kryštálom kreslí hra.
const heroTop = [
  '.......kk.....',
  '......khk.....',
  '.....khhk.....',
  '.....khYhk....',
  '....khhhhk....',
  '....khhhhhk...',
  '..kkkkkkkkkkk.',
  '...kdwwwwwdk..',
  '...kwkwwkwwk..',
  '...kwwwwwwwk..',
  '....kRRRRRk...',
  '...ksmmmmmsk..',
  '..ksmlmmmmmsk.',
  '..ksmlmmmmmsk.',
  '..ksmmmmmmmsk.',
  '...ksmmmmmsk..',
  '...kkkkkkkkk..',
];
const LEGS = [
  ['....kk..kk....', '....kk..kk....'],
  ['...kk....kk...', '..kk......kk..'],
  ['....kk..kk....', '.....kkkk.....'],
  ['.....kk.kk....', '....kk...kk...'],
];
export const HERO = LEGS.map(l => makeSprite([...heroTop, ...l]));

export const SLIME = makeSprite([
  '......kkkk......',
  '....kklllmkk....',
  '...klwwllmmmk...',
  '..klwwlmmmmmmk..',
  '.klllmmmmmmmmsk.',
  '.kmmmmmmmmmmmsk.',
  'kmmRRmmmmRRmmmsk',
  'kmmRwmmmmRwmmmsk',
  'kmmmmmmkkmmmmmsk',
  'kmmmmmmmmmmmmssk',
  '.ksmmmmmmmmmsssk',
  '..kkkkkkkkkkkkk.',
]);

export const NPC = makeSprite([
  '.....kk...',
  '....kRRk..',
  '...kRRYRk.',
  '..kRRRRRRk',
  '.kkkkkkkkk',
  '..kwwwwwk.',
  '..kwkwkwk.',
  '..kwwwwwk.',
  '.kddPPddk.',
]);

export const CHEST = makeSprite([
  '..kkkkkkkkkk..',
  '.kllllllllllk.',
  'kmmmmmmmmmmmmk',
  'kmlmmmmmmmmlmk',
  'kkkkkkYYkkkkkk',
  'kmlmmmYYmmmlmk',
  'kmmmmmmmmmmmmk',
  'kmlmmmmmmmmlmk',
  'kddddddddddddk',
  '.kkkkkkkkkkkk.',
]);
export const CHEST_OPEN = makeSprite([
  '..kkkkkkkkkk..',
  '.kddddddddddk.',
  'kkkkkkkkkkkkkk',
  'kkYkYkkkkYkYkk',
  'kkkYkkkkkkYkkk',
  'kmlmmmmmmmmlmk',
  'kmmmmmmmmmmmmk',
  'kmlmmmmmmmmlmk',
  'kddddddddddddk',
  '.kkkkkkkkkkkk.',
]);

export const BOOK = makeSprite([
  '.kkkkkk.kkkkkk.',
  'kwwwwwwkwwwwwwk',
  'kwddddwkwddddwk',
  'kwwwwwwkwwwwwwk',
  'kwddddwkwdddwwk',
  'kwwwwwwkwwwwwwk',
  'kGGGGGGkGGGGGGk',
  '.kkkkkkkkkkkkk.',
]);

// Boss Pňoko – starý pník s machom a konármi (kreslený kódom).
export const BOSS = buildSprite(40, 40, set => {
  for (let i = 0; i < 5; i++) for (let t = 0; t < 8; t++) { // korene
    const x = 6 + i * 7 + (i - 2) * t * 0.8, y = 33 + t * 0.7;
    set(x, y, 0.16); set(x + 1, y, 0.24);
  }
  for (let y = 10; y < 36; y++) for (let x = 6; x < 34; x++) { // telo – valec
    const nx = (x - 20) / 14;
    if (Math.abs(nx) > 1) continue;
    let b = 0.14 + 0.5 * Math.max(0, -nx * 0.6 + Math.sqrt(1 - nx * nx) * 0.75);
    if (hash(x, Math.floor(y / 4), 2) > 0.8 || (x + Math.floor(y / 5)) % 6 === 0) b *= 0.55; // kôra
    set(x, y, Math.abs(nx) > 0.9 ? 0.03 : b);
  }
  for (let y = 4; y < 16; y++) for (let x = 6; x < 34; x++) { // vrch s letokruhmi
    const nx = (x - 20) / 14, ny = (y - 10) / 6, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const r = Math.sqrt(d);
    set(x, y, d > 0.82 ? 0.03 : (Math.floor(r * 5) % 2 ? 0.6 : 0.84));
  }
  for (let k = 0; k < 40; k++) { // mach
    const x = 7 + hash(k, 1, 4) * 26, y = 13 + hash(k, 2, 4) * 5;
    set(x, y, 0.5, A.GREEN); set(x + 1, y, 0.7, A.GREEN);
  }
  for (const [x, y] of [[29, 3], [30, 2], [31, 1], [28, 1], [32, 2], [30, 0]]) set(x, y, 0.7, A.GREEN); // výhonok
  for (let t = 0; t < 9; t++) { // konáre
    set(5 - t, 21 - t * 0.8, 0.12); set(5 - t, 22 - t * 0.8, 0.2);
    set(34 + t, 21 - t * 0.8, 0.12); set(34 + t, 22 - t * 0.8, 0.2);
  }
  set(-2, 13, 0.12); set(41, 13, 0.12);
  for (let x = 13; x < 28; x++) set(x, 28 + (x % 3 === 0 ? 1 : 0), 0.02); // ústa
  for (const ex of [13, 24]) for (let y = 19; y < 23; y++) for (let x = ex; x < ex + 4; x++) set(x, y, y === 19 || x === ex ? 1 : 0.7, A.RED); // oči
});

export const STRINGS = {
  goalBook: 'Vezmi si kúzelnú knihu z podstavca.',
  goalTwo: 'Choď na lúku vpravo. V kríkoch sa niečo blyští.',
  goalBridge: 'Pri rieke pod lúkou daj liane číslo 3.',
  goalThree: 'Za riekou leží ďalšie číslo.',
  goalBoss: 'Vľavo za riekou je Starý les. Čaká tam Pňoko.',
  goalDone: 'Zóna 1 je hotová!',
};
