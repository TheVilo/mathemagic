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
const fine = RT(), amb = new THREE.WebGLRenderTarget(16, 16), mask = new THREE.WebGLRenderTarget(16, 16), maskG = RT(), maskS = RT();
const glyphRT = new THREE.WebGLRenderTarget(16, 16, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const kresbaMat = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: fine.texture }, tDepth: { value: fine.depthTexture }, tAmb: { value: amb.texture }, tMask: { value: mask.texture }, tGround: { value: maskG.texture }, tGDepth: { value: maskG.depthTexture },
    tSpellM: { value: maskS.texture }, tSpellD: { value: maskS.depthTexture }, tAtlas: { value: atlas }, uGlyphN: { value: RAMP.length }, uGlyph: { value: new THREE.Vector2(3, 5) }, uScale: { value: 1 },
    uRes: { value: new THREE.Vector2() }, uDepth: { value: new THREE.Vector2((20.9 - 9) / 199.9, (20.9 + 14) / 199.9) }, uSymCol: { value: 1 }, uAO: { value: 1 },
    uSpellG: { value: 3 }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, uHurt: { value: 0 }, uFade: { value: 0 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tAmb; uniform sampler2D tMask; uniform sampler2D tGround; uniform sampler2D tGDepth;
    uniform sampler2D tSpellM; uniform sampler2D tSpellD; uniform sampler2D tAtlas; uniform float uGlyphN; uniform vec2 uGlyph; uniform float uScale;
    uniform vec2 uRes; uniform vec2 uDepth; uniform float uSymCol; uniform float uAO; uniform int uSpellG; uniform vec4 uFlash; uniform float uHurt; uniform float uFade; varying vec2 vUv;
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
        // JASOVÁ HIERARCHIA: postavy tmavšie ako tieň, tieň na zemi svetlý
        if (isChar6) {                                                     // postava: svetlo + farba časti (klobúk hustý, tvár riedka) → vidno, kde čo končí
          float ad = 1.0 - smoothstep(0.08, 0.55, luma(lin2srgb(texture2D(tAmb, uv6).rgb)));
          k = clamp(0.06 + k * 0.38 + ad * 0.62, 0.0, 1.0);             // väčší rozdiel: svetlá časť riedka, tmavá hustá
        }
        else if (isGround6) k = min(k, 0.42);
        float d0 = texture2D(tDepth, uv6).r;
        float far = smoothstep(uDepth.x, uDepth.y, d0);                    // 0 = vpredu, 1 = vzadu
        k *= mix(1.0, 0.45, far);                                          // OD ZADU DOPREDU: vzadu bledšie a redšie
        float d06 = texture2D(tDepth, uv6).r;
        float far6 = smoothstep(uDepth.x, uDepth.y, d06);
        // AMBIENT OCCLUSION: kúty a záhyby (päta stromu pri zemi, spoj strechy so stenou, okraj klobúka) stmavnú – bez obrysov
        if (uAO > 0.5) {
          float ao = 0.0;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.39996, rr = (1.5 + mod(float(i), 3.0) * 1.6);
            float dn = texture2D(tDepth, uv6 + vec2(cos(a), sin(a)) * rr * cs / uRes).r;
            float df = d06 - dn;                                            // sused je bližšie = zakrýva
            ao += df > 0.0004 && df < 0.01 ? 1.0 : 0.0;                    // len blízke záhyby (nie veľký skok = žiadny obrys)
          }
          k = clamp(k + ao / 12.0 * 0.45, 0.0, 1.0);
        }
        if (!isChar6) k *= mix(1.0, 0.25, far6 * far6);                     // HMLA: čo je ďalej, bledne do papiera
        float hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float v = k * (uGlyphN - 1.0); float b = floor(v);
        float gi = clamp(b + (v - b > bayer(cell) ? 1.0 : 0.0), 0.0, uGlyphN - 1.0);   // usporiadaný dithering = plynulý gradient
        float ink = px.x < uGlyph.x && px.y < uGlyph.y ? texture2D(tAtlas, vec2((gi * (uGlyph.x + 1.0) + px.x + 0.5) / (uGlyphN * (uGlyph.x + 1.0)), (uGlyph.y - 1.0 - px.y + 0.5) / uGlyph.y)).r : 0.0;
        if (k < 0.04) ink = 0.0;
        vec3 inkC = vec3(0.07, 0.07, 0.08), bg = vec3(0.87, 0.855, 0.82);
        vec3 fg = mix(vec3(0.42), inkC, smoothstep(0.2, 0.6, k));         // svetlé tóny sivým, tmavé čiernym (plný rozsah až po čiernu)
        if (isGround6) fg = mix(fg, vec3(0.55), 0.7);                      // tieň na zemi je sivší
        fg = mix(fg, bg, far * 0.45);
        if (uSymCol > 0.5) { float mx = max(c.r, max(c.g, c.b)); fg = mix(c / max(mx, 0.05) * mix(0.75, 0.3, k), fg, 0.45); }   // jemná farba toho, čo znak kreslí
        { // KÚZLO ZO ZNAMIENOK: čo žiari (kúzlo, plamene, iskry, blesk), sa kreslí znamienkom kúzla (+ − × ÷) vo farbe kúzla, väčším písmom
          vec2 cs2 = cs * 3.0, cell2 = floor(frag / cs2), p2 = (frag - (cell2 + 0.5) * cs2) / cs2;   // väčšie znamienka kúzla
          vec2 uvs = (cell2 + 0.5) * cs2 / uRes;
          vec3 c2 = lin2srgb(texture2D(tSpellM, uvs).rgb); float m2 = max(c2.r, max(c2.g, c2.b));
          bool behind = texture2D(tSpellD, uvs).r > texture2D(tDepth, uvs).r + 0.0015;   // HĹBKA: čo je pred kúzlom, ho zakryje
          if (m2 > 0.12 && !behind) {                                       // len to, čo patrí kúzlu (vrstva 4)
            float inten = clamp((m2 - 0.12) * 1.6, 0.0, 1.0);
            float dg = glyph(uSpellG, p2, 0.045 + inten * 0.05, 0.34 + inten * 0.06);   // tenšia čiara = znamienko čitateľné aj na mobile
            vec3 sc = c2 / max(m2, 0.01);
            bg = mix(bg, sc, inten * 0.06);
            fg = mix(sc * 0.95, vec3(1.0), inten * 0.25); ink = clamp(0.5 - dg * cs2.y, 0.0, 1.0);
          }
        }
        bg = mix(bg, uFlash.rgb, uFlash.a); fg = mix(fg, uFlash.rgb, uFlash.a * 0.5);   // záblesk (blesk, výbuch)
        vec2 q = vUv - 0.5; float vig = smoothstep(0.32, 0.62, length(q));
        if (uHurt > 0.0 && vig * uHurt > bayer(cell)) { bg = mix(bg, vec3(0.8, 0.25, 0.2), 0.35); }   // len okraje   // zranenie: červené okraje
        if (uFade > 0.0 && bayer(cell) < uFade) { ink = 0.0; bg = vec3(0.87, 0.855, 0.82); }             // prechod: rozpad do papiera
        gl_FragColor = vec4(mix(bg, fg, ink), 1.0); return;
      }
    }`,
  depthTest: false, depthWrite: false,
});
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tImg: { value: glyphRT.texture }, uRes: { value: new THREE.Vector2() }, uFocus: { value: 0.5 }, uBand: { value: 0.22 }, uCell: { value: 5 } },
  vertexShader: VS,
  fragmentShader: `uniform sampler2D tImg; uniform vec2 uRes; uniform float uFocus; uniform float uBand; uniform float uCell; varying vec2 vUv;
    void main(){
      float dy = abs(vUv.y - uFocus); vec2 q = vUv - 0.5;
      float r = (smoothstep(uBand, uBand + 0.33, dy) * 1.6 + dot(q, q) * 1.5) * uCell;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 20; i++) { float fi = float(i), a = fi * 2.39996; acc += texture2D(tImg, vUv + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 20.0) * r / uRes).rgb; }
      gl_FragColor = vec4(acc / 20.0 * (1.0 - dot(q, q) * 0.3), 1.0);
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
export function svetloDen() { hemi.intensity = 1.0; sun.intensity = 3.6; U.gray.value = 0; U.desat.value = 0.35; U.tex.value = 0; }
export const VRSTVA = { postava: 1, zem: 2, kuzlo: 4 };
export function naVrstvu(obj, v) { obj.traverse(o => o.layers.enable(v)); }

export function resizeKresba() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  for (const t of [fine, amb, mask, maskG, maskS]) t.setSize(Math.ceil(innerWidth / 3), Math.ceil(innerHeight / 3));   // scéna v 1/3 rozlíšenia (ako v ukážke)
  glyphRT.setSize(W, H);
  kresbaMat.uniforms.uRes.value.set(W, H); blurMat.uniforms.uRes.value.set(W, H);
}
// focusY = výška čarodejníka na obrazovke (0–1) – pásmo ostrosti
export function renderKresba(focusY = 0.5, rimFrom = null) {
  if (rimFrom) { rim.position.set(rimFrom.x + 8, rimFrom.y + 6, rimFrom.z - 14); rim.target.position.copy(rimFrom); }
  blurMat.uniforms.uFocus.value = focusY;
  renderer.setRenderTarget(fine); renderer.render(scene, camera);
  const si = sun.intensity, gc = hemi.groundColor.getHex(), ri = rim.intensity;
  sun.intensity = 0; rim.intensity = 0; hemi.groundColor.set(0xffffff); renderer.setRenderTarget(amb); renderer.render(scene, camera);
  sun.intensity = si; rim.intensity = ri; hemi.groundColor.set(gc);
  const bg = scene.background.clone(), fog = scene.fog;
  scene.background.set(0x000000); scene.fog = null; scene.overrideMaterial = white;
  camera.layers.set(1); renderer.setRenderTarget(mask); renderer.render(scene, camera);
  camera.layers.set(2); renderer.setRenderTarget(maskG); renderer.render(scene, camera);
  scene.overrideMaterial = null; camera.layers.set(4); renderer.setRenderTarget(maskS); renderer.render(scene, camera);
  scene.background.copy(bg); scene.fog = fog; camera.layers.set(0);
  quad.material = kresbaMat; renderer.setRenderTarget(glyphRT); renderer.render(quadScene, quadCam);
  quad.material = blurMat; renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
}
