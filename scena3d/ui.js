import { ditImg } from './dither.js';
// 1-bit UI hry (podľa ui.html): farebné sú len karty kúziel, všetko ostatné čierne panely s bielou linkou.
import { pix, icon } from './svet.js';
import { CARDS } from './karty.js';

// 4 živly = základné kúzla podľa znamienka
export const ZIVLY = {   // živel podľa matematiky: + pridáva (zem), − uberá postupne (oheň), × znásobí silu (vzduch), ÷ delí na kvapky (voda)
  '+': { id: 'zem', name: 'Zem', color: '#b8823e', text: 'Zem popraská a nepriateľ sa zastaví – každé ďalšie + dlhšie.' },
  '-': { id: 'ohen-zivel', name: 'Oheň', color: '#ec6428', text: 'Odčítané číslo dohorí: 9 − 3 = 6 hneď a 3 horí postupne.' },
  '×': { id: 'vzduch', name: 'Vzduch', color: '#3ec6bc', text: 'Víchor odhodí nepriateľa – väčší činiteľ, ďalej.' },
  '÷': { id: 'voda', name: 'Voda', color: '#3a8fe0', text: 'Strela sa rozpadne na kvapky (12 ÷ 3 = 3 po 4) a spomalí.' },
};
const mix = (hex, t, to) => { const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16); const ch = s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
const tones = c => `--c:${c};--c2:${mix(c, .55, '#ffffff')};--c3:${mix(c, .62, '#0e0e10')}`;

export const dia = (n, cls = '') => `<span class="dia ${cls}">${icon(n)}</span>`;

// karta kúzla: id z CARDS alebo znamienko živlu ('+', '-', '×', '÷')
export function card(id, { l = 1, mini = false, count = 0, foot = '', locked = false, cls = '', data = '' } = {}) {
  const z = ZIVLY[id], c = z || CARDS[id];
  const img = z ? z.id : id;
  const art = z ? pix(id) : icon(c.icon, '#fff');
  const text = z ? c.text : c.text(l);
  return `<div class="card panel ${mini ? 'mini' : ''} ${locked ? 'locked' : ''} ${cls}" ${data} style="${tones(c.color)}">
    <span class="ptag">${locked ? '???' : c.name}</span>${count ? `<span class="count">${count} ×</span>` : ''}
    <div class="art">${art}${ditImg(`../zdroj/karty/${img}.jpg`, 'col')}${z && !mini ? `<span class="sign">${pix(id)}</span>` : ''}</div>
    <div class="meta">${z ? '<small>Živel</small>' : `<div class="pips"><i class="on"></i><i class="${l > 1 ? 'on' : ''}"></i></div>`}${mini ? '' : `<small>${z ? id.replace('-', '−') : 'Úr. ' + l}</small>`}</div>
    ${mini ? '' : `<p>${text}</p>`}${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
}
// malé farebné okienko karty (HUD, Kniha)
export const slot = (id, cls = '') => id ? `<div class="sl c ${cls}" style="--c:${CARDS[id].color}">${icon(CARDS[id].icon, '#fff')}${ditImg(`../zdroj/karty/${id}.jpg`, 'col')}</div>` : `<div class="sl empty ${cls}"></div>`;
// riadky menu s ikonkou v kosoštvorci
export const menu = items => items.map(([key, ic, t, off]) => `<div class="row ${off ? 'off' : ''}" data-k="${key}">${dia(ic)}${t}</div>`).join('');
