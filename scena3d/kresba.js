// Kresba sveta zo znamienok a čísel (schválený vzhľad, 20. 10. 2026).
// Scéna sa vykreslí niekoľkokrát (farba, bez slnka, maska postáv, maska zeme, vrstva kúzla s hĺbkou) a shader z toho
// poskladá obraz z drobných znamienok · − + a číslic 1–8 podľa tmy; postavy tmavšie a podľa farby častí; tiene v kútoch,
// hmla do hĺbky; kúzlo sa kreslí svojím znamienkom (+ − × ÷) vo svojej farbe. Vrstvy: 1 postavy, 2 zem, 4 kúzlo.
import { THREE, renderer, scene, camera, hemi, sun, U } from './svet.js';

// atlas: znamienka a číslice 3×5 zoradené od najmenej po najviac atramentu
const FONT = { '·': '000000010000000', '-': '000000111000000', '+': '000010111010000', '1': '010110010010111', '7': '111001010010010', '4': '101101111001001',
  '2': '111001111100111', '3': '111001111001111', '5': '111100111001111', '9': '111101111001111', '6': '111100111101111', '0': '111101101101111', '8': '111101111101111', '■': '111111111111111' };
const RAMP = Object.keys(FONT).sort((a, b) => FONT[a].split('1').length - FONT[b].split('1').length);
const cv = document.createElement('canvas'); cv.width = RAMP.length * 4; cv.height = 5;
{ const g = cv.getContext('2d'); g.fillStyle = '#fff'; RAMP.forEach((ch, k) => { const b = FONT[ch]; for (let i = 0; i < 15; i++) if (b[i] === '1') g.fillRect(k * 4 + (i % 3), (i / 3) | 0, 1, 1); }); }
const atlas = new THREE.CanvasTexture(cv); atlas.magFilter = atlas.minFilter = THREE.NearestFilter; atlas.generateMipmaps = false; atlas.flipY = false;

const RT = () => new THREE.WebGLRenderTarget(16, 16, { depthTexture: new THREE.DepthTexture(16, 16) });
const lampRT = new THREE.WebGLRenderTarget(16, 16);   // obraz LEN so svetlom palice (s tieňmi) – skutočné svetlo čarodejníka na predmetoch
const fine = RT(), amb = new THREE.WebGLRenderTarget(16, 16), mask = new THREE.WebGLRenderTarget(16, 16), maskG = RT(), maskS = RT();
const glyphRT = new THREE.WebGLRenderTarget(16, 16, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const kresbaMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: fine.texture }, tDepth: { value: fine.depthTexture }, tAmb: { value: amb.texture }, tMask: { value: mask.texture }, tGround: { value: maskG.texture }, tGDepth: { value: maskG.depthTexture },
    tSpellM: { value: maskS.texture }, tSpellD: { value: maskS.depthTexture }, tAtlas: { value: atlas }, uGlyphN: { value: RAMP.length }, uGlyph: { value: new THREE.Vector2(3, 5) }, uScale: { value: 1 },
    uRes: { value: new THREE.Vector2() }, uDepth: { value: new THREE.Vector2((20.9 - 9) / 199.9, (20.9 + 14) / 199.9) }, uSymCol: { value: 1 }, uAO: { value: 1 },
    uSpellG: { value: 3 }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, uHurt: { value: 0 }, uFade: { value: 0 }, uDark: { value: 0 }, uLit: { value: new THREE.Vector2(1.0, 3.6) }, uOne: { value: 1 }, uDbg: { value: 0 }, uNight: { value: 0 }, uGlow: { value: new THREE.Vector4(0.5, 0.5, 0.1, 0) }, uGlowC: { value: new THREE.Color(0xc8923a) }, uInvVP: { value: new THREE.Matrix4() }, uHero: { value: new THREE.Vector3() }, uLamp: { value: new THREE.Vector3(4.5, 16, 0.0) }, uNightR: { value: new THREE.Vector2(5, 12) }, uOrbs: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uOneBit: { value: 1 }, uGrey: { value: 1 }, tLamp: { value: lampRT.texture }, uLampK: { value: 0.28 }, uLsK: { value: 1.6 }, uLsR: { value: new THREE.Vector2(0.2, 0.42) } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tAmb; uniform sampler2D tMask; uniform sampler2D tGround; uniform sampler2D tGDepth;
    uniform sampler2D tSpellM; uniform sampler2D tSpellD; uniform sampler2D tAtlas; uniform float uGlyphN; uniform vec2 uGlyph; uniform float uScale;
    uniform vec2 uRes; uniform vec2 uDepth; uniform float uSymCol; uniform float uAO; uniform int uSpellG; uniform vec4 uFlash; uniform float uHurt; uniform float uFade; uniform float uDark; uniform vec2 uLit; uniform float uOne; uniform float uDbg; uniform float uNight; uniform vec4 uGlow; uniform vec3 uGlowC; uniform mat4 uInvVP; uniform vec3 uHero; uniform vec3 uLamp; uniform vec2 uNightR; uniform vec4 uOrbs[4]; uniform float uOneBit; uniform float uGrey; uniform sampler2D tLamp; uniform float uLampK; uniform float uLsK; uniform vec2 uLsR; varying vec2 vUv;
    float bayer(vec2 p){ vec2 q = mod(p, 4.0); int i = int(q.x) + int(q.y) * 4; float b = 0.0;
      if (i==0) b=0.; else if (i==1) b=8.; else if (i==2) b=2.; else if (i==3) b=10.; else if (i==4) b=12.; else if (i==5) b=4.; else if (i==6) b=14.; else if (i==7) b=6.;
      else if (i==8) b=3.; else if (i==9) b=11.; else if (i==10) b=1.; else if (i==11) b=9.; else if (i==12) b=15.; else if (i==13) b=7.; else if (i==14) b=13.; else b=5.;
      return (b + 0.5) / 16.0; }
    float bar(vec2 p, float w, float len){ vec2 d = abs(p) - vec2(len, w); return max(d.x, d.y); }
    // znamienko g v bunke (p od -0.5 do 0.5), w = polovica hrúbky čiary; vracia vzdialenosť (< 0 = vnútri)
    float glyph(int g, vec2 p, float w, float L){
      if (g == 1) return length(p) - w * 1.25;                                             // ·
      if (g == 2) return bar(p, w, L);                                                      // −
      if (g == 3) return min(bar(p, w, L), bar(p.yx, w, L));                                // +
      if (g == 4) { vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071; return min(bar(r, w, L), bar(r.yx, w, L)); } // ×
      if (g == 5) return min(bar(p, w, L), min(length(p - vec2(0.0, 0.27)) - max(w * 1.6, 0.09), length(p + vec2(0.0, 0.27)) - max(w * 1.6, 0.09))); // ÷ (výraznejšie bodky)
      if (g == 7) return min(bar(p - vec2(0.0, 0.16), w, L), bar(p + vec2(0.0, 0.16), w, L)); // =
      if (g == 8) return bar(p, 0.4, 0.4);                                                   // ■
      if (g == 9) return min(min(bar(p - vec2(0.0, 0.15), w, L), bar(p + vec2(0.0, 0.15), w, L)), min(bar(p.yx - vec2(0.0, 0.15), w, L), bar(p.yx + vec2(0.0, 0.15), w, L))); // #
      if (g == 10) return abs(p.x) + abs(p.y) - 0.34;                                        // ✦ (kosoštvorec)
      if (g == 6) { vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071; return min(min(bar(p, w, L), bar(p.yx, w, L)), min(bar(r, w, L), bar(r.yx, w, L))); } // ✳ (+ a × naraz) – najtmavšie
      return 1.0;
    }
    vec3 lin2srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
    float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 frag = gl_FragCoord.xy;
      { // ZNAMIENKA A ČÍSLA na papieri: stupnica · − + 1 7 4 2 3 5 9 6 0 8 podľa tmy, čierna len na oddelenie častí
        vec2 cs = (uGlyph + 1.0) * uScale;
        vec2 cell = floor(frag / cs), px = floor(mod(frag, cs) / uScale);
        vec2 uv6 = (cell + 0.5) * cs / uRes;
        vec3 c = lin2srgb(texture2D(tScene, uv6).rgb);
        float l = smoothstep(0.12, 0.95, luma(c));
        float k = clamp(pow(1.0 - l, 1.1) * 1.4, 0.0, 1.0);
        k = smoothstep(0.1, 0.88, k);                                    // silnejší gradient svetlo → tieň
        bool isChar6 = texture2D(tMask, uv6).r > 0.5;
        bool isGround6 = !isChar6 && texture2D(tGround, uv6).r > 0.5 && abs(texture2D(tGDepth, uv6).r - texture2D(tDepth, uv6).r) < 0.0004;
        // JEDNO PRAVIDLO PRE VŠETKO (uOne): tmavosť = len svetlo (pomer obrazu so slnkom a bez neho), nie farba materiálu.
        // Odvrátená strana a vrhnutý tieň = čierna na kameni, strome, stane aj kúzelníkovi; materiál dá len jemný tón na svetlej strane.
        if (uDbg > 0.5) { vec3 ca0 = texture2D(tAmb, uv6).rgb; gl_FragColor = vec4(luma(texture2D(tScene, uv6).rgb) / max(luma(ca0), 0.002) / 8.0, luma(ca0), isGround6 ? 1.0 : isChar6 ? 0.5 : 0.0, 1.0); return; }
        if (uOne > 0.5 && (!isGround6 || uNight > 0.5)) {
          vec3 ca = texture2D(tAmb, uv6).rgb;
          // pomer = 1 + (slnko/obloha)·cos(uhol)·viditeľnosť → svetlo L = (pomer − 1) / (pomer_max − 1) = čistý kosínus dopadu (namerané: plné slnko 3,6, tieň 1,0)
          float L = clamp((luma(texture2D(tScene, uv6).rgb) / max(luma(ca), 0.002) - uLit.x) / (uLit.y - uLit.x), 0.0, 1.0);
          float tone = smoothstep(0.15, 0.85, 1.0 - luma(lin2srgb(ca)));
          k = mix(0.96, 0.08 + tone * (uGrey > 0.5 ? 0.62 : 0.2), pow(L, 0.6));   // sivý režim: farba materiálu váži viac (tmavé stromy, svetlé kamene)                  // L^0,6: stredné tóny svetlejšie, čierna len kam slnko nedopadá
          if (uNight > 0.5 && isGround6) k = mix(0.97, 0.35, pow(L, 0.7)); // NOC: aj zem len zo svetla (mesiac, palica, ohne)
          if (isChar6) k = max(k, (1.0 - smoothstep(0.06, 0.5, luma(lin2srgb(ca)))) * 0.92);   // postava: tmavé časti (klobúk, plášť) ostanú tmavé aj na slnku; svieti len to, kam dosvieti palica
        }
        // JASOVÁ HIERARCHIA: postavy tmavšie ako tieň, tieň na zemi svetlý
        if (isChar6 && uOne < 0.5) {                                       // postava: svetlo + farba časti (klobúk hustý, tvár riedka) → vidno, kde čo končí
          float ad = 1.0 - smoothstep(0.08, 0.55, luma(lin2srgb(texture2D(tAmb, uv6).rgb)));
          k = clamp(0.06 + k * 0.38 + ad * 0.62, 0.0, 1.0);             // väčší rozdiel: svetlá časť riedka, tmavá hustá
        }
        else if (isGround6 && uNight < 0.5) k = min(k, 0.42);
        // SVETLO PALICE (napevno okolo čarodejníka vo svete, nie podľa kamery): pri ňom svetlejšie, ďalej tmavšie
        // uLamp = (polomer svetla palice, kde je už plná tma, sila tmy)
        if (uOne > 0.5 && uNight < 0.5) {
          vec4 wp = uInvVP * vec4(uv6 * 2.0 - 1.0, texture2D(tDepth, uv6).r * 2.0 - 1.0, 1.0); wp /= wp.w;
          float dist = length(wp.xz - uHero.xz);
          float lamp = 1.0 - smoothstep(0.0, uLamp.x, dist), dark = smoothstep(uLamp.x * 0.6, uLamp.y, dist);
          k = isGround6 ? max(k, dark * uLamp.z * 0.5) : mix(k, 0.96, dark * uLamp.z);
          if (!isChar6) k *= 1.0 - lamp * 0.5;          // palica svieti na okolie, nie na samotného čarodejníka – ten má rovnaké slnko ako všetko
        }
        float d0 = texture2D(tDepth, uv6).r;
        float far = smoothstep(uDepth.x, uDepth.y, d0);                    // 0 = vpredu, 1 = vzadu
        k *= mix(1.0, uOne > 0.5 ? 1.0 : 0.45, far);   // pri jednom pravidle svetla bez blednutia – vec nesmie stmavnúť, keď k nej prídeš                                          // OD ZADU DOPREDU: vzadu bledšie a redšie
        float d06 = texture2D(tDepth, uv6).r;
        float far6 = smoothstep(uDepth.x, uDepth.y, d06);
        // AMBIENT OCCLUSION: kúty a záhyby (päta stromu pri zemi, spoj strechy so stenou, okraj klobúka) stmavnú – bez obrysov
        if (uAO > 0.5 && uNight < 0.5) {                                 // v noci bez tieňov v kútoch – robili tmavý lem (stroke) okolo malých vecí
          float ao = 0.0;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996, rr = (1.5 + mod(float(i), 3.0) * 1.6);
            float dn = texture2D(tDepth, uv6 + vec2(cos(a), sin(a)) * rr * cs / uRes).r;
            float df = d06 - dn;                                            // sused je bližšie = zakrýva
            ao += df > 0.0004 && df < 0.01 ? 1.0 : 0.0;                    // len blízke záhyby (nie veľký skok = žiadny obrys)
          }
          k = clamp(k + ao / 12.0 * 0.45, 0.0, 1.0);
        }
        if (!isChar6) k *= mix(1.0, uOne > 0.5 ? 1.0 : 0.25, far6 * far6);                     // HMLA: čo je ďalej, bledne do papiera
        // ČO SAMO SVIETI (častice, kúzlo, kryštál) nie je tieň: pod ním je pozadie, znamienko kúzla sa nakreslí nižšie
        { vec3 sm = texture2D(tSpellM, uv6).rgb; bool vis = texture2D(tSpellD, uv6).r <= texture2D(tDepth, uv6).r + 0.0015;   // len keď ho nič nezakrýva (napr. kryštál pod klobúkom)
          if (vis && max(sm.r, max(sm.g, sm.b)) > 0.08) k = mix(0.0, 0.15, uDark); }   // čo svieti: v noci svetlé, cez deň papier
        // TMAVÝ REŽIM (interiér): znaky = svetlo na čiernom, postava ostáva čitateľná
        k = mix(k, clamp(1.0 - k, 0.0, 1.0), uDark);                         // deň → noc plynulo (uDark 0–1, výber režimu)
        float nightL = 1.0;
        // NOC BEZ ŠUMU (Lukáš 21. 10.): čísla len vo svetle palice – za okruhom plynulo do čiernej; postavy ostanú tlmene viditeľné,
        // slabé znaky (k < 0,14) sa nekreslia vôbec → tma je tma, nie zrnitý sivý koberec
        if (uNight > 0.5) {
          vec4 wpN = uInvVP * vec4(uv6 * 2.0 - 1.0, texture2D(tDepth, uv6).r * 2.0 - 1.0, 1.0); wpN /= wpN.w;
          float distN = length(wpN.xz - uHero.xz), lightN = 1.0 - smoothstep(uNightR.x, uNightR.y, distN);
          for (int o = 0; o < 4; o++) if (uOrbs[o].w > 0.0) lightN = max(lightN, 1.0 - smoothstep(uOrbs[o].w * 0.35, uOrbs[o].w, length(wpN.xz - uOrbs[o].xz)));   // KÚZLO SVIETI: let aj dopad osvetlia okolie
          k *= isChar6 ? max(lightN, 0.55) : mix(0.55, 1.0, lightN);
          nightL = isChar6 ? 1.0 : lightN;
        }
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float v = k * (uGlyphN - 1.0); float b = floor(v);
        float gi = clamp(b + (v - b > bayer(cell) ? 1.0 : 0.0), 0.0, uGlyphN - 1.0);   // usporiadaný dithering = plynulý gradient
        float ink = px.x < uGlyph.x && px.y < uGlyph.y ? texture2D(tAtlas, vec2((gi * (uGlyph.x + 1.0) + px.x + 0.5) / (uGlyphN * (uGlyph.x + 1.0)), (uGlyph.y - 1.0 - px.y + 0.5) / uGlyph.y)).r : 0.0;
        if (k < (uNight > 0.5 ? 0.12 : 0.04)) ink = 0.0;
        if (nightL < 1.0 && nightL * nightL < bayer(cell)) ink = 0.0;   // okraj svetla sa rozpadá ditheringom, nie ostrou hranou
        vec3 inkC = mix(vec3(0.025, 0.025, 0.03), vec3(0.93, 0.91, 0.86), uDark), bg = mix(vec3(0.87, 0.855, 0.82), vec3(0.045, 0.045, 0.055), uDark);
        vec3 fg = mix(vec3(0.42), inkC, smoothstep(0.2, 0.6, k));         // svetlé tóny sivým, tmavé čiernym (plný rozsah až po čiernu)
        if (isGround6) fg = mix(fg, vec3(0.55), 0.7);                      // tieň na zemi je sivší
        fg = mix(fg, bg, far * (uOne > 0.5 ? 0.0 : 0.45));
        if (uSymCol > 0.5) { float mx = max(c.r, max(c.g, c.b)); fg = mix(fg, c / max(mx, 0.05) * mix(0.75, 0.3, k), 0.55 * (1.0 - smoothstep(0.45, 0.8, k))); }   // farba len v svetlých tónoch, tmavé ostávajú čierne
        if (k > (isChar6 ? 0.74 : 0.86)) bg = mix(bg, inkC, smoothstep(isChar6 ? 0.74 : 0.86, isChar6 ? 0.9 : 1.0, k) * 0.92 * (1.0 - uDark));   // najtmavšie miesta = plná čierna   // jemná farba toho, čo znak kreslí
        float spellPx = 0.0;
        { // KÚZLO ZO ZNAMIENOK: čo žiari (kúzlo, plamene, iskry, blesk), sa kreslí znamienkom kúzla (+ − × ÷) vo farbe kúzla, väčším písmom
          vec2 cs2 = cs * 3.0, cell2 = floor(frag / cs2), p2 = (frag - (cell2 + 0.5) * cs2) / cs2;   // väčšie znamienka kúzla
          vec2 uvs = (cell2 + 0.5) * cs2 / uRes;
          vec3 c2 = lin2srgb(texture2D(tSpellM, uvs).rgb); float m2 = max(c2.r, max(c2.g, c2.b));
          bool behind = texture2D(tSpellD, uvs).r > texture2D(tDepth, uvs).r + 0.0015;   // HĹBKA: čo je pred kúzlom, ho zakryje
          if (m2 > 0.12 && !behind) {                                       // len to, čo patrí kúzlu (vrstva 4)
            float inten = clamp((m2 - 0.12) * 1.6, 0.0, 1.0);
            float dg = glyph(uSpellG, p2, 0.045 + inten * 0.05, 0.34 + inten * 0.06);   // tenšia čiara = znamienko čitateľné aj na mobile
            vec3 sc = c2 / max(m2, 0.01);
            bg = mix(mix(bg, sc, inten * 0.06), bg + sc * inten * 0.12, uDark);   // v noci jemná žiara, nie tmavý štvorec
            float sInk = clamp(0.5 - dg * cs2.y, 0.0, 1.0);                                // znamienko len cez svoju čiaru, okolité znaky ostanú
            fg = mix(fg, mix(sc * 0.95, vec3(1.0), inten * 0.25), sInk); ink = max(ink * (1.0 - sInk), sInk); spellPx = max(spellPx, sInk * step(0.2, inten));
          }
        }
        bg = mix(bg, uFlash.rgb, uFlash.a); fg = mix(fg, uFlash.rgb, uFlash.a * 0.5);   // záblesk (blesk, výbuch)
        vec2 q = vUv - 0.5; float vig = smoothstep(0.32, 0.62, length(q));
        if (uHurt > 0.0 && vig * uHurt > bayer(cell)) { bg = mix(bg, vec3(0.8, 0.25, 0.2), 0.35); }   // len okraje   // zranenie: červené okraje
        if (uFade > 0.0 && bayer(cell) < uFade) { ink = 0.0; bg = vec3(0.87, 0.855, 0.82); }             // prechod: rozpad do papiera
        vec3 outC = mix(bg, fg, ink);
        // ŽIARA PALICE: mäkký kruh vo farbe živlu okolo kryštálu (v noci silná, cez deň jemná)
        if (uGlow.w > 0.0) { vec2 gq = (vUv - uGlow.xy) * vec2(uRes.x / uRes.y, 1.0); float gl = uGlow.w * exp(-dot(gq, gq) / (uGlow.z * uGlow.z)); outC = mix(mix(outC, uGlowC, gl * 0.5), outC + uGlowC * gl, uDark); }
        // SIVÝ DITHER (Lukáš 26. 10., predloha petitjus): 5 teplých sivých tónov, medzi nimi usporiadaný dither po 2 px;
        // deň svetlý, noc o stupeň tmavšia, ale NIKDY čierna – svetlá (palica, kúzla) prerážajú; obrysy len jemne z hĺbky
        if (uGrey > 0.5) {
          float tone = uDark > 0.5 ? 0.3 + 0.7 * k : 0.86 - 0.7 * smoothstep(0.02, 0.92, k);   // deň: zem svetlosivá (nie biela), predmety stredné a tmavé
          vec2 uvg = frag / uRes, tg = 3.0 / uRes;
          float dg = texture2D(tDepth, uvg).r, mg = texture2D(tMask, uvg).r, eg = 0.0;
          for (int q = 0; q < 4; q++) {
            vec2 o = q == 0 ? vec2(tg.x, 0.0) : q == 1 ? vec2(-tg.x, 0.0) : q == 2 ? vec2(0.0, tg.y) : vec2(0.0, -tg.y);
            if (texture2D(tDepth, uvg + o).r - dg > 0.0025) eg = 1.0;
            if (mg > 0.5 && texture2D(tMask, uvg + o).r < 0.5) eg = 1.0;
          }
          // ČARODEJNÍK STÁLE SVIETI (Lukáš 26. 10., predloha petitjus): svetlý kruh okolo neho cez deň aj v tme, okraj sa rozpadá ditherom
          if (dg < 0.9999) {
            vec4 wpq = uInvVP * vec4(uvg * 2.0 - 1.0, dg * 2.0 - 1.0, 1.0); wpq /= wpq.w;
            // SKUTOČNÉ SVETLO PALICE: osobitný obraz len so svetlom palice (a kúziel) – svieti na stranu predmetov k čarodejníkovi, za nimi tieň
            float irr = luma(texture2D(tLamp, uvg).rgb) / max(luma(texture2D(tAmb, uvg).rgb), 0.002) * uLampK;
            float pool = smoothstep(0.015, 0.16, irr);
            float orb = 0.0; for (int o = 0; o < 4; o++) if (uOrbs[o].w > 0.0) orb = max(orb, 1.0 - smoothstep(uOrbs[o].w * 0.45, uOrbs[o].w * 1.3, length(wpq.xz - uOrbs[o].xz)));   // kúzla svietia naplno
            if (mg < 0.5) tone = mix(tone, max(tone, 1.02 - (1.0 - tone) * 0.25), pool * (uDark > 0.5 ? 0.95 : 0.75));
            tone = mix(tone, 1.05, orb);   // svetlo kúzla = čisté, aj na postavách
          }
          if (mg > 0.5) tone *= 0.6;                                            // postavy tmavšie ako svet (čitateľné)
          if (eg > 0.5 && dg < 0.9999) tone *= 0.62;                             // jemný obrys
          float fgD = smoothstep(uDepth.x, uDepth.y, dg);
          tone = mix(tone, uDark > 0.5 ? 0.3 : 0.8, fgD * 0.12);                // hmla do diaľky len jemne (Lukáš: hore bol prechod)
          tone = clamp(tone, 0.0, 1.0) * 4.0;
          float tb = floor(min(tone, 3.999)), tf = tone - tb;
          // VZORY AKO PREDLOHA: prechod medzi tónmi nie je šum, ale rad vzorov – riedka bodka → 2 bodky → mriežka X → obrátené X → plný tón
          vec2 c2 = floor(frag / 2.0), p4 = mod(c2, 4.0);
          bool xd = abs(p4.x - p4.y) < 0.5 || abs(p4.x + p4.y - 3.0) < 0.5;
          bool d1 = p4.x < 0.5 && p4.y < 0.5, d2 = d1 || (abs(p4.x - 2.0) < 0.5 && abs(p4.y - 2.0) < 0.5);
          float up = tf < 0.12 ? 0.0 : tf < 0.3 ? (d1 ? 1.0 : 0.0) : tf < 0.45 ? (d2 ? 1.0 : 0.0) : tf < 0.62 ? (xd ? 1.0 : 0.0) : tf < 0.85 ? (xd ? 0.0 : 1.0) : 1.0;
          float ti = tb + up;
          if (tone > 3.6) ti = 4.0;                                               // SVETLO = čistá plocha bez bodiek (Lukáš 26. 10.)
          vec3 g0 = vec3(0.22, 0.18, 0.22), g1 = vec3(0.41, 0.36, 0.41), g2 = vec3(0.6, 0.55, 0.58), g3 = vec3(0.79, 0.76, 0.76), g4 = vec3(0.96, 0.94, 0.87);   // sivé do fialova (predloha petitjus)
          if (uDark > 0.5) { g3 = vec3(0.72, 0.66, 0.56); g4 = vec3(0.97, 0.91, 0.74); }   // v tme svetlo teplé ako sviečka, nie čisto biele
          vec3 gc = ti < 0.5 ? g0 : ti < 1.5 ? g1 : ti < 2.5 ? g2 : ti < 3.5 ? g3 : g4;
          gl_FragColor = vec4(mix(gc, outC, spellPx), 1.0); return;
        }
        // 1-BIT (noc, inšpirácia Glagstone): len čierna a kostená biela, farebné ostanú iba kúzla.
        // Obrysy vecí z hĺbky a masky postáv – v tme biele čiary (vidno všetko), na svetle čierne; tma má jemnú mriežku bodiek.
        if (uNight > 0.5 && uOneBit > 0.5) {
          vec3 bone = vec3(0.93, 0.91, 0.86);
          vec2 uvp = frag / uRes, tx = 3.0 / uRes;
          // ČISTÉ SVETLO (ako Glagstone): žiadne znaky vo svete – tón z bunky sa vykreslí pixelovým ditheringom:
          // plné svetlo = čistá biela plocha, prechod = riedke bodky, tma = čierna; znamienka kreslí len kúzlo
          // TÓN = skutočné svetlo na povrchu (palica, kúzla): strana k svetlu biela, odvrátená tmavá → predmety majú tvar a tieň
          float Ls = luma(lin2srgb(texture2D(tScene, uvp).rgb)) * uLsK;   // v noci scénu svieti len palica, kúzla a mesiac → jas = svetlo na povrchu
          vec4 wpT = uInvVP * vec4(uvp * 2.0 - 1.0, texture2D(tDepth, uvp).r * 2.0 - 1.0, 1.0); wpT /= wpT.w;
          float dT = length(wpT.xz - uHero.xz);
          bool objP = texture2D(tGround, uvp).r < 0.5 && texture2D(tMask, uvp).r < 0.5;   // predmet (kameň, strom, stena), nie zem ani postava
          // DVA SVETY CEZ MASKU: zem je osvetlená len v kruhu palice, predmety, ktoré svetlo zasiahne, svietia ďalej
          float poolT = 1.0 - smoothstep(uNightR.x * (objP ? 1.5 : 1.0), uNightR.y * (objP ? 1.5 : 1.0), dT);
          for (int o2 = 0; o2 < 4; o2++) if (uOrbs[o2].w > 0.0) poolT = max(poolT, 1.0 - smoothstep(uOrbs[o2].w * 0.35, uOrbs[o2].w, length(wpT.xz - uOrbs[o2].xz)));
          float T = smoothstep(uLsR.x, uLsR.y, Ls) * poolT;
          float Lm = T;
          vec3 mono = bone * (T > 0.96 ? 1.0 : step(bayer(floor(frag / 2.0)), T));
          float d0 = texture2D(tDepth, uvp).r, m0 = texture2D(tMask, uvp).r, e = 0.0;
          for (int q = 0; q < 4; q++) {
            vec2 o = q == 0 ? vec2(tx.x, 0.0) : q == 1 ? vec2(-tx.x, 0.0) : q == 2 ? vec2(0.0, tx.y) : vec2(0.0, -tx.y);
            float dn = texture2D(tDepth, uvp + o).r, mn = texture2D(tMask, uvp + o).r;
            if (dn - d0 > 0.0025) e = 1.0;                     // hrana bližšieho predmetu (len z jednej strany = tenká čiara)
            if (m0 > 0.5 && mn < 0.5) e = 1.0;                 // obrys postavy
            if (m0 > 0.5 && mn > 0.5 && abs(luma(texture2D(tAmb, uvp).rgb) - luma(texture2D(tAmb, uvp + o).rgb)) > 0.035) e = 1.0;   // kresba vnútri postavy: hrany farieb (klobúk, plášť, tvár)
          }
          vec4 wpO = uInvVP * vec4(uvp * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0); wpO /= wpO.w;
          float distO = length(wpO.xz - uHero.xz), reach = 1.0 - smoothstep(uNightR.y, uNightR.y + 10.0, distO);   // obrysy dovidia ďalej ako svetlo, potom zmiznú
          // POSTAVY: vo svetle svetlá výplň s čiernymi čiarami (čitateľné ako v Glagstone), v tme len biely obrys
          bool chP = m0 > 0.5; float litC = 1.0 - smoothstep(uNightR.x, uNightR.y, distO);
          if (chP) mono = bone * 0.07;   // POSTAVY TMAVÉ (Lukáš): čierna výplň, biely obrys a biele čiary medzi časťami (klobúk oddelený)
          if (max(max(texture2D(tSpellM, uvp).r, texture2D(tSpellM, uvp).g), texture2D(tSpellM, uvp).b) > 0.06) e = 0.0;   // kúzlo a iskry: bez obrysov (robili čierne štvorčeky)
          if (e > 0.5 && d0 < 0.9999) mono = chP ? bone * mix(0.6, 1.0, litC) : Lm > 0.45 ? vec3(0.05) : mix(mono, bone * 0.85, reach);
          else if (T < 0.04 && mod(frag.x, 6.0) < 1.5 && mod(frag.y, 6.0) < 1.5) mono = bone * 0.16;   // tma: riedka mriežka bodiek
          outC = mix(mono, outC, spellPx);
        }
        // 1-BIT DEŇ (Učeň): obrátene – kostený papier, čierny atrament ditheringom po pixeloch, čierne obrysy; farebné len kúzla
        if (uNight < 0.5 && uOneBit > 0.5) {
          vec3 paperC = vec3(0.93, 0.91, 0.86), inkD = vec3(0.06, 0.06, 0.07);
          vec2 uvq = frag / uRes, tq = 3.0 / uRes;
          float D = smoothstep(0.24, 0.95, k);                                 // tma = hustota atramentu (riedšia – svetlý deň, tmavé len tiene a predmety)
          vec3 monoD = step(bayer(floor(frag / 2.0)), D) > 0.5 ? inkD : paperC;
          float dq = texture2D(tDepth, uvq).r, mq = texture2D(tMask, uvq).r, eq = 0.0;
          for (int q = 0; q < 4; q++) {
            vec2 o = q == 0 ? vec2(tq.x, 0.0) : q == 1 ? vec2(-tq.x, 0.0) : q == 2 ? vec2(0.0, tq.y) : vec2(0.0, -tq.y);
            if (texture2D(tDepth, uvq + o).r - dq > 0.0025) eq = 1.0;
            if (mq > 0.5 && texture2D(tMask, uvq + o).r < 0.5) eq = 1.0;
          }
          if (mq > 0.5) monoD = mix(monoD, inkD, 0.75);                         // postavy tmavé
          if (eq > 0.5 && dq < 0.9999) monoD = inkD;
          outC = mix(monoD, outC, spellPx);
        }
        gl_FragColor = vec4(outC, 1.0); return;
      }
    }`,
  depthTest: false, depthWrite: false,
});
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tImg: { value: glyphRT.texture }, uRes: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uBand: { value: 0.06 }, uCell: { value: 7 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tImg; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uCell; varying vec2 vUv;
    void main(){
      float dy = abs(vUv.y - uFocus); vec2 q = vUv - 0.5;
      float r = (smoothstep(uBand, uBand + 0.28, dy) * 3.6 + dot(q, q) * 2.5) * uCell;   // TILT-SHIFT: ostrý pás okolo čarodejníka, hore a dole silne rozmazané (svet pôsobí ako malá maketa)
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 20; i++) { float fi = float(i), a = fi * 2.39996; acc += texture2D(tImg, vUv + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 20.0) * r / uRes).rgb; }
      float vr = length(q * vec2(uRes.x / uRes.y, 1.0)) / (0.5 * max(uRes.x / uRes.y, 1.0));   // 0 stred … 1 roh
      gl_FragColor = vec4(mix(acc / 20.0, vec3(0.07, 0.06, 0.07), smoothstep(0.62, 1.05, vr)), 1.0);   // GUĽATÁ VINETÁCIA ako šošovka (predloha petitjus)
    }`,
  depthTest: false, depthWrite: false,
});
export const kresbaBlur = blurMat;
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), kresbaMat);
quadScene.add(quad);
const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
// kontrasvetlo zozadu-zboku: okraje častí postáv
const rim = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(rim, rim.target);

// svetlo a farby, s ktorými bol vzhľad schválený
const points = []; let frameN = 0;
// NOC (Pokročilý): slabá modrastá obloha, mesiac ~ ako obloha, svieti palica, ohne a kúzla; obraz = svetlé znaky na čiernom
// DEŇ ↔ NOC plynulo, t = 0 deň (Učeň) … 1 noc (Majster): svetlá aj kresba sa zmiešajú
const cDay = new THREE.Color(0xffffff), cSky = new THREE.Color(0x9fb0ff), cMoon = new THREE.Color(0xb8c8ff);
export function svetloDenNoc(t) {
  const L = (a, b) => a + (b - a) * t;
  hemi.intensity = L(1.7, 0.14); hemi.color.copy(cDay).lerp(cSky, t); sun.intensity = L(4.0, 0.1);   // deň svetlejší (Lukáš 26. 10.: celý deň svetlý ako predloha) sun.color.copy(cDay).lerp(cMoon, t); rim.intensity = L(1.6, 0);
  U.gray.value = 0; U.desat.value = 0.35; U.tex.value = 0;
  kresbaMat.uniforms.uDark.value = t; kresbaMat.uniforms.uNight.value = t > 0.5 ? 1 : 0;
}
export function svetloNoc() { svetloDenNoc(1); }
export function svetloDen() { svetloDenNoc(0); }
export const VRSTVA = { postava: 1, zem: 2, kuzlo: 4 };
export function naVrstvu(obj, v) { obj.traverse(o => o.layers.enable(v)); }

export function resizeKresba() {
  const dpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(3.4e6 / (innerWidth * innerHeight)));   // strop ~3,4 mil. pixelov (veľké Retina okno inak spomalí)
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  sprCam.right = innerWidth; sprCam.bottom = innerHeight; sprCam.updateProjectionMatrix();
  for (const t of [fine, amb, mask, maskG, maskS, lampRT]) t.setSize(Math.ceil(innerWidth / 2), Math.ceil(innerHeight / 2));   // scéna v 1/2 rozlíšenia (Lukáš 26. 10.: viac detailu ako predloha)
  glyphRT.setSize(W, H);
  kresbaMat.uniforms.uRes.value.set(W, H); blurMat.uniforms.uRes.value.set(W, H);
}
// focusY = výška čarodejníka na obrazovke (0–1) – pásmo ostrosti
export function renderKresba(focusY = 0.5, rimFrom = null) {
  kresbaMat.uniforms.uInvVP.value.copy(camera.matrixWorld).multiply(camera.projectionMatrixInverse);
  if (rimFrom) kresbaMat.uniforms.uHero.value.copy(rimFrom);
  if (rimFrom) { rim.position.set(rimFrom.x + 8, rimFrom.y + 6, rimFrom.z - 14); rim.target.position.copy(rimFrom); }
  blurMat.uniforms.uFocus.value = focusY;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;   // tiene len raz za snímok (nie v každom z 5 prechodov)
  renderer.setRenderTarget(fine); renderer.render(scene, camera);
  const si = sun.intensity, gc = hemi.groundColor.getHex(), ri = rim.intensity;
  // obraz BEZ svetiel (len obloha): palica, ohne a kúzlá sa tak nevykrátia a ich svetlo je vidno
  if (!(frameN++ % 30)) { points.length = 0; scene.traverse(o => { if (o.isPointLight) points.push(o); }); }
  const pi = points.map(l => l.intensity); points.forEach(l => { l.intensity = 0; });
  sun.intensity = 0; rim.intensity = 0; hemi.groundColor.set(0xffffff); renderer.setRenderTarget(amb); renderer.render(scene, camera);
  sun.intensity = si; rim.intensity = ri; hemi.groundColor.set(gc); points.forEach((l, i) => { l.intensity = pi[i]; });
  if (lampLight) {   // PRECHOD LEN SO SVETLOM PALICE (tiene od predmetov), obloha a slnko vypnuté
    const hi = hemi.intensity, li = lampLight.intensity, bg0 = scene.background.clone(), fg0 = scene.fog;
    hemi.intensity = 0; sun.intensity = 0; rim.intensity = 0; lampLight.intensity = 6; scene.background.set(0x000000); scene.fog = null;
    renderer.setRenderTarget(lampRT); renderer.render(scene, camera);
    kresbaMat.uniforms.uLampK.value = hi / 6;
    hemi.intensity = hi; sun.intensity = si; rim.intensity = ri; lampLight.intensity = li; scene.background.copy(bg0); scene.fog = fg0;
  }
  const bg = scene.background.clone(), fog = scene.fog;
  scene.background.set(0x000000); scene.fog = null; scene.overrideMaterial = white;
  camera.layers.set(1); renderer.setRenderTarget(mask); renderer.render(scene, camera);
  camera.layers.set(2); renderer.setRenderTarget(maskG); renderer.render(scene, camera);
  scene.overrideMaterial = null; camera.layers.set(4); renderer.setRenderTarget(maskS); renderer.render(scene, camera);
  scene.background.copy(bg); scene.fog = fog; camera.layers.set(0);
  quad.material = kresbaMat; renderer.setRenderTarget(glyphRT); renderer.render(quadScene, quadCam);
  quad.material = blurMat; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
  if (sprScene.children.length) { renderer.autoClear = false; renderer.render(sprScene, sprCam); renderer.autoClear = true; }   // pixelové postavičky navrch, s hĺbkou
}

// svetlá kúzla (najviac 4): [{ x, z, r }] – volá suboj.js každý snímok
export function setOrbs(list) { const u = kresbaMat.uniforms.uOrbs.value; for (let i = 0; i < 4; i++) { const o = list[i]; u[i].set(o ? o.x : 0, 0, o ? o.z : 0, o ? o.r : 0); } }

// ---------- SVETLO PALICE ----------
let lampLight = null;
export const setLampLight = l => { lampLight = l; };
// ---------- VRSTVA PIXELOVÝCH POSTAVIČIEK: kreslí sa až po ditheri (ostré pixely), ale s hĺbkou sveta –
// čo je pred postavičkou (strom, stĺp), ju zakryje; zakrytá časť = len jemný svetlý obrys (Lukáš 26. 10.)
const sprScene = new THREE.Scene(), sprCam = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
const sprFS = `uniform sampler2D tAtlas; uniform sampler2D tDep; uniform vec2 uRes; uniform vec4 uFrame; uniform float uFlip; uniform float uDepth; uniform vec2 uTex; uniform float uAlpha; varying vec2 vUv;
  float al(vec2 p) { return texture2D(tAtlas, p).a; }
  void main(){
    vec2 f = vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y), uv = uFrame.xy + f * uFrame.zw;
    vec4 c = texture2D(tAtlas, uv); if (c.a < 0.5) discard;
    float sd = texture2D(tDep, gl_FragCoord.xy / uRes).r;
    if (sd < uDepth - 0.0035) {   // za predmetom
      vec2 t = 1.0 / uTex; float e = al(uv + vec2(t.x, 0.0)) + al(uv - vec2(t.x, 0.0)) + al(uv + vec2(0.0, t.y)) + al(uv - vec2(0.0, t.y));
      if (e > 3.5) discard; gl_FragColor = vec4(0.95, 0.93, 0.86, 0.55 * uAlpha); return;
    }
    gl_FragColor = vec4(c.rgb, uAlpha);
  }`;
export function addSprite(tex, tw, th) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { tAtlas: { value: tex }, tDep: { value: fine.depthTexture }, uRes: { value: kresbaMat.uniforms.uRes.value }, uFrame: { value: new THREE.Vector4(0, 0, 1, 1) }, uFlip: { value: 0 }, uDepth: { value: 1 }, uTex: { value: new THREE.Vector2(tw, th) }, uAlpha: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: sprFS, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; sprScene.add(m); return m;
}
export const removeSprite = m => sprScene.remove(m);
