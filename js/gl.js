// WebGL: 1. priechod = plusový raster (plusy hrubnú s tmou) v 3× rozlíšení,
// 2. priechod = hĺbka ostrosti podľa mapy hĺbky + žiara kúziel + vinetácia + jemné zrno.
import { W, H, PAL } from './render.js';

const VS = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS_RASTER = `precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uOut;
uniform vec3 uPal[7];
uniform float uFade;
uniform vec2 uFadeC;
float plusTh(vec2 p){
  float cell = 6.0;
  float row = floor(p.y / cell);
  vec2 q = vec2(mod(p.x + mod(row, 2.0) * 3.0, cell), mod(p.y, cell)) - 2.5;
  vec2 a = abs(q);
  return (min(a.x, a.y) * 3.0 + max(a.x, a.y)) / 10.5;
}
vec3 pal(int i){ vec3 c = uPal[0]; for (int k = 1; k < 7; k++) { if (k == i) c = uPal[k]; } return c; }
void main(){
  vec2 p = floor(vUv * uOut);
  vec4 s = texture2D(uSrc, vUv);
  float th = plusTh(p);
  float dist = length((vUv - uFadeC) * vec2(1.78, 1.0));
  if (uFade > 0.0 && th * 0.45 + dist * 0.8 < uFade * 1.3) { gl_FragColor = vec4(0.051, 0.067, 0.09, 1.0); return; }
  float v = s.r;
  int idx = int(s.g * 255.0 + 0.5);
  vec3 col;
  if (idx > 0) {
    vec3 c = pal(idx);
    col = v < 0.5 ? c * (0.42 + v * 1.16) : mix(c, vec3(1.0, 0.975, 0.92), clamp((v - 0.5) * 1.6, 0.0, 0.85));
    if (th < 0.2 && v < 0.8) col *= 0.8;
  } else {
    float g = (96.0 + v * 140.0) / 255.0;
    if (1.0 - v > th + 0.04) g -= (46.0 + (1.0 - v) * 40.0) / 255.0;
    col = vec3(g - 0.012, g - 0.008, g);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const FS_POST = `precision highp float;
varying vec2 vUv;
uniform sampler2D uImg;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime;
uniform float uBlur;
uniform float uBloom;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 img(vec2 uv){ return texture2D(uImg, vec2(uv.x, 1.0 - uv.y)).rgb; }
void main(){
  float dep = texture2D(uSrc, vUv).b;
  float r = dep * uBlur * uRes.x / 960.0;
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 24.0) * r / uRes;
    float sd = texture2D(uSrc, vUv + o).b;
    float w = mix(0.12, 1.0, step(dep * 0.55, sd));
    acc += img(vUv + o) * w; ws += w;
  }
  vec3 col = acc / ws;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float a = fi * 2.39996 + 0.7;
    vec2 o = vec2(cos(a), sin(a)) * (3.0 + fi * 1.5) * uRes.x / 960.0 / uRes;
    vec3 c = img(vUv + o);
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    glow += c * sat * sat * (1.0 - fi / 18.0);
  }
  col += glow / 9.0 * uBloom;
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.6;
  col += (hash(floor(vUv * uRes) + fract(uTime * 7.0) * 113.0) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  let pR, pP;
  try { pR = prog(FS_RASTER); pP = prog(FS_POST); } catch (e) { console.warn(e); return null; }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const tex = (w, h, filter) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  };
  const CELL = 3, FW = W * CELL, FH = H * CELL;
  const tSrc = tex(W, H, gl.NEAREST), tImg = tex(FW, FH, gl.LINEAR);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tImg, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const palFlat = new Float32Array(PAL.flat().map(v => v / 255));
  const U = (p, n) => gl.getUniformLocation(p, n);
  const quad = p => { const loc = gl.getAttribLocation(p, 'p'); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };

  return {
    // veľkosť znamienka podľa šírky plátna, aby boli ostré (4–9 px na znamienko)
    resize() { /* pevné 3× rozlíšenie rastra */ },
    draw(data, o) {
      gl.bindTexture(gl.TEXTURE_2D, tSrc);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, data);
      // 1. raster
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, FW, FH);
      gl.useProgram(pR);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tSrc);
      gl.uniform1i(U(pR, 'uSrc'), 0);
      gl.uniform2f(U(pR, 'uOut'), FW, FH);
      gl.uniform1f(U(pR, 'uCell'), CELL);
      gl.uniform1f(U(pR, 'uTime'), o.time || 0);
      gl.uniform3fv(U(pR, 'uPal'), palFlat);
      gl.uniform1f(U(pR, 'uFade'), o.fade || 0);
      gl.uniform2f(U(pR, 'uFadeC'), o.fx ?? 0.5, o.fy ?? 0.5);
      quad(pR);
      // 2. hĺbka ostrosti + žiara
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(pP);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tImg);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tSrc);
      gl.uniform1i(U(pP, 'uImg'), 0); gl.uniform1i(U(pP, 'uSrc'), 1);
      gl.uniform2f(U(pP, 'uRes'), FW, FH);
      gl.uniform1f(U(pP, 'uTime'), o.time || 0);
      gl.uniform1f(U(pP, 'uBlur'), o.blur ?? 9);
      gl.uniform1f(U(pP, 'uBloom'), o.bloom ?? 1);
      quad(pP);
    },
  };
}
