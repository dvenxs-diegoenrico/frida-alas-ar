import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { makeStabilizer, MINDAR_PASSTHROUGH, preferHDCamera, makeDebug } from './estabilizador.js';

/* ============================================================
   ALAS PA' VOLAR · Frida Kahlo por Federico Chilian Espinosa
   Experiencia WebAR (MindAR + three.js)
   Coordenadas en píxeles de la ilustración original (696 × 924)
   ============================================================ */
const W = 696, H = 924;
const CW = Math.round(W * 1.7), CH = Math.round(H * 1.3);   // lienzo ampliado: las alas salen del marco
const OX = (CW - W) / 2, OY = (CH - H) / 2;
const K = 0.62;                                             // resolución del lienzo animado
const LOOP = 13;                                            // duración del ciclo (s)

// Escena (s)
const T = {
  blink1: 0.9, blink2: 7.4, blink3: 11.6,
  goldL: [0.8, 2.9], goldR: [2.9, 4.6],
  petals: 3.4, wingsOpen: [4.6, 6.0], butterflies: 5.4, wingsClose: [10.2, 11.4], handOut: [4.7, 5.4], goldOut: [10.4, 11.4],
};

// Braille (detectado de la ilustración): 3 renglones por lado, puntos ya en orden de lectura
const BRAILLE = [[[36,26],[36,45],[50,26],[50,36],[50,45],[60,26],[74,36],[84,26],[97,26],[107,36],[121,36],[121,45],[131,26],[168,45],[168,26],[168,36],[178,26],[191,26],[214,26],[214,45],[215,36],[224,36],[237,26]],[[25,74],[25,83],[25,64],[35,64],[35,74],[50,64],[50,83],[60,83],[74,74],[74,83],[84,83],[84,64],[121,65],[121,74],[121,83],[145,83],[145,64],[155,74],[170,74],[170,83],[180,64]],[[25,112],[25,122],[25,103],[35,112],[35,103],[50,122],[50,103],[60,122],[75,112],[84,103],[99,103],[108,112],[121,122],[121,103],[121,112],[131,112],[145,103],[145,122],[155,112]],[[476,39],[476,30],[486,20],[501,30],[511,20],[550,30],[550,39],[559,20],[559,30],[572,20],[582,30],[596,20],[596,39],[606,30],[606,20],[621,30],[622,20],[631,20],[631,30],[647,20],[647,39],[657,30]],[[476,61],[501,71],[501,62],[501,80],[526,61],[550,71],[550,80],[559,61]],[[476,103],[476,112],[476,122],[486,103],[502,103],[527,121],[576,103],[576,121],[576,112],[586,121],[601,103],[601,121],[610,112],[624,103],[624,122],[625,112],[647,103],[671,103],[671,121],[671,112],[681,112]]];

// Frases manuscritas (renglones, en orden de escritura)
const HAND_L = [[26, 350, 108, 396], [18, 404, 192, 452], [36, 452, 108, 498], [32, 508, 162, 560]];
const HAND_R = [[496, 344, 634, 393], [522, 393, 604, 434], [492, 436, 662, 500]];

const EYES = [{ x: 279, y: 377, rx: 30, ry: 13 }, { x: 383, y: 373, rx: 31, ry: 13 }];
const SHOULDER_L = { x: 268, y: 612 }, SHOULDER_R = { x: 392, y: 612 };
const FLOWERS = [
  { x: 272, y: 160, c: ['#ec4fb5', '#c81f8f'] }, { x: 380, y: 152, c: ['#e6332a', '#b5161c'] },
  { x: 202, y: 196, c: ['#e8a93a', '#c07d1c'] }, { x: 468, y: 172, c: ['#e6332a', '#b5161c'] },
  { x: 330, y: 104, c: ['#d75ad8', '#a2309f'] }, { x: 440, y: 130, c: ['#ef5a9a', '#c22d6b'] },
];
const GLINTS = [{ x: 212, y: 470, t: 6.4 }, { x: 441, y: 468, t: 6.9 }, { x: 329, y: 656, t: 7.8 }, { x: 213, y: 262, t: 8.6 }, { x: 452, y: 262, t: 9.1 }];
// Siluetas de mariposa que ya están impresas en el fondo: de ahí "despiertan"
const NESTS = [[70, 225], [628, 225], [600, 555], [80, 600], [95, 830], [630, 830], [560, 690], [140, 720], [610, 380], [60, 470]];

const $ = (id) => document.getElementById(id);
const show = (id, on = true) => { $(id).hidden = !on; };
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const backOut = (t) => { t = clamp(t); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const loadImg = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('No cargó ' + src)); i.src = src; });
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/* ---------------- Capas precalculadas ---------------- */
let art, fig, gold, lidColors;
function buildLayers(img, mask) {
  art = mk(W, H); const a = art.getContext('2d', { willReadFrequently: true }); a.drawImage(img, 0, 0, W, H);
  // Figura recortada (para poner las alas detrás)
  fig = mk(W, H); const f = fig.getContext('2d');
  f.drawImage(mask, 0, 0, W, H);
  const md = f.getImageData(0, 0, W, H), src = a.getImageData(0, 0, W, H);
  for (let i = 0; i < md.data.length; i += 4) {
    const on = md.data[i] > 127;
    md.data[i] = src.data[i]; md.data[i + 1] = src.data[i + 1]; md.data[i + 2] = src.data[i + 2]; md.data[i + 3] = on ? 255 : 0;
  }
  f.putImageData(md, 0, 0);
  // Tinta dorada: los trazos de la letra manuscrita convertidos en oro
  gold = mk(W, H); const g = gold.getContext('2d');
  const gd = g.createImageData(W, H);
  for (const [x0, y0, x1, y1] of [...HAND_L, ...HAND_R]) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4, l = (src.data[i] * .3 + src.data[i + 1] * .59 + src.data[i + 2] * .11);
      if (l < 72 && md.data[i + 3] === 0) {
        const k = 1 - l / 72;
        gd.data[i] = 255; gd.data[i + 1] = 196 + 30 * (1 - k); gd.data[i + 2] = 70; gd.data[i + 3] = 255 * Math.min(1, k * 1.6);
      }
    }
  }
  g.putImageData(gd, 0, 0);
  lidColors = ['rgb(245,210,202)', 'rgb(241,206,197)'];   // tono de piel medido sobre cada ojo
}

/* ---------------- Partículas ---------------- */
const petals = Array.from({ length: 34 }, (_, i) => {
  const fl = FLOWERS[i % FLOWERS.length];
  return { x: fl.x + (rnd() - .5) * 40, y: fl.y + (rnd() - .5) * 26, c: fl.c, d: rnd() * 4.2, vx: (rnd() - .5) * 90, vy: -50 - rnd() * 80,
    sw: 20 + rnd() * 40, ph: rnd() * 6.28, rot: rnd() * 6.28, vr: (rnd() - .5) * 4, s: 7 + rnd() * 7, life: 4 + rnd() * 2.5 };
});
const PALETTES = [
  ['#f28c1c', '#d9531e'], ['#ec4fb5', '#b8217f'], ['#e6332a', '#9e1419'], ['#f0b73a', '#c47f16'], ['#3d74d6', '#1c3f94'],
];
const butterflies = Array.from({ length: 18 }, (_, i) => {
  const fromNest = i < NESTS.length;
  const [sx, sy] = fromNest ? NESTS[i] : [330 + (rnd() - .5) * 120, 640 + (rnd() - .5) * 60];
  const ang = Math.atan2(sy - 470, sx - 330) + (rnd() - .5) * .8;
  const dist = 380 + rnd() * 320;
  return { sx, sy, ex: sx + Math.cos(ang) * dist, ey: sy + Math.sin(ang) * dist * .7 - 260 - rnd() * 200,
    cx: sx + (rnd() - .5) * 300, cy: sy - 120 - rnd() * 160, d: (fromNest ? 0 : .9) + rnd() * 1.6, dur: 3.4 + rnd() * 1.8,
    size: fromNest ? 26 + rnd() * 12 : 16 + rnd() * 12, pal: PALETTES[i % PALETTES.length], fq: 9 + rnd() * 5, ph: rnd() * 6 };
});

/* ---------------- Dibujo ---------------- */
function petal(c, s) {
  c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * .9, -s * .6, s * .7, s * .8, 0, s); c.bezierCurveTo(-s * .7, s * .8, -s * .9, -s * .6, 0, -s); c.closePath();
}

function butterfly(c, x, y, size, heading, flap, pal, alpha) {
  c.save(); c.translate(x, y); c.rotate(heading); c.globalAlpha = alpha;
  const open = .18 + .82 * Math.abs(Math.cos(flap));
  for (const side of [-1, 1]) {
    c.save(); c.scale(side * open, 1);
    const gr = c.createLinearGradient(0, 0, size, 0); gr.addColorStop(0, pal[1]); gr.addColorStop(1, pal[0]);
    c.fillStyle = gr; c.strokeStyle = '#141014'; c.lineWidth = Math.max(1.4, size * .07);
    c.beginPath(); c.moveTo(0, -2); c.bezierCurveTo(size * .5, -size * 1.05, size * 1.15, -size * .85, size * 1.02, -size * .18); c.bezierCurveTo(size * .9, size * .05, size * .4, size * .05, 0, 0); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, 1); c.bezierCurveTo(size * .75, size * .1, size * .85, size * .7, size * .45, size * .78); c.bezierCurveTo(size * .2, size * .82, size * .05, size * .4, 0, 2); c.fill(); c.stroke();
    c.fillStyle = '#fff8ea';
    for (const [px, py] of [[.9, -.55], [.98, -.3], [.62, .62]]) { c.beginPath(); c.arc(size * px, size * py, size * .055, 0, 6.28); c.fill(); }
    c.restore();
  }
  c.fillStyle = '#141014'; c.beginPath(); c.ellipse(0, size * .1, size * .07, size * .42, 0, 0, 6.28); c.fill();
  c.strokeStyle = '#141014'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(0, -size * .3); c.quadraticCurveTo(-size * .12, -size * .62, -size * .24, -size * .7); c.moveTo(0, -size * .3); c.quadraticCurveTo(size * .12, -size * .62, size * .24, -size * .7); c.stroke();
  c.restore();
}

// Ala de monarca bordada (lado derecho; el izquierdo es espejo)
function flowerMotif(c, x, y, r, col) {
  c.fillStyle = col;
  for (let i = 0; i < 5; i++) { const a = i * 1.2566; c.beginPath(); c.ellipse(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .42, r * .28, a, 0, 6.28); c.fill(); }
  c.fillStyle = '#f6c544'; c.beginPath(); c.arc(x, y, r * .25, 0, 6.28); c.fill();
}
function wing(c, open, flapLift) {
  c.save();
  c.rotate(-.08 - flapLift * .22);
  c.scale(open, 1);
  // Ala superior
  const fw = new Path2D();
  fw.moveTo(0, 0); fw.bezierCurveTo(70, -170, 270, -330, 470, -300); fw.bezierCurveTo(520, -290, 535, -250, 505, -205);
  fw.bezierCurveTo(440, -90, 300, -10, 0, 18); fw.closePath();
  // Ala inferior
  const hw = new Path2D();
  hw.moveTo(0, 12); hw.bezierCurveTo(170, 10, 330, 60, 340, 160); hw.bezierCurveTo(345, 230, 270, 280, 190, 262);
  hw.bezierCurveTo(100, 240, 30, 130, 0, 30); hw.closePath();
  for (const p of [hw, fw]) {
    const isF = p === fw;
    const gr = c.createRadialGradient(0, 0, 30, 0, 0, isF ? 520 : 340);
    gr.addColorStop(0, '#b8360b'); gr.addColorStop(.45, '#e2601a'); gr.addColorStop(1, '#f39a2c');
    c.fillStyle = gr; c.fill(p);
    c.save(); c.clip(p);
    // celdas: brillo suave entre venas
    c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,190,90,.16)';
    const cells = isF ? [[300, -210, 70], [380, -230, 50], [220, -120, 60], [330, -120, 45]] : [[220, 150, 55], [280, 200, 40], [140, 170, 40]];
    for (const [x, y, r] of cells) { c.beginPath(); c.ellipse(x, y, r, r * .55, isF ? -.5 : .6, 0, 6.28); c.fill(); }
    c.globalCompositeOperation = 'source-over';
    // venas
    c.strokeStyle = '#140d0b'; c.lineCap = 'round';
    const veins = isF ? [[470, -296], [505, -235], [460, -150], [360, -70], [230, -12], [400, -300]] : [[332, 120], [300, 225], [215, 262], [130, 215], [60, 140]];
    veins.forEach(([vx, vy], i) => {
      c.lineWidth = 9 - i * .6;
      c.beginPath(); c.moveTo(0, 4); c.bezierCurveTo(vx * .3, vy * .15 + (isF ? -50 : 40), vx * .7, vy * .7 + (isF ? -20 : 10), vx, vy); c.stroke();
    });
    // cruces entre venas
    c.lineWidth = 5;
    if (isF) { c.beginPath(); c.moveTo(250, -235); c.quadraticCurveTo(300, -170, 290, -95); c.moveTo(380, -265); c.quadraticCurveTo(400, -200, 380, -140); c.stroke(); }
    else { c.beginPath(); c.moveTo(180, 70); c.quadraticCurveTo(220, 130, 200, 200); c.stroke(); }
    // borde negro con doble hilera de puntos blancos
    c.lineWidth = 40; c.strokeStyle = '#140d0b'; c.stroke(p);
    c.fillStyle = '#fff6e2';
    const pts = isF ? [[440, -286], [478, -274], [502, -244], [496, -210], [460, -152], [410, -104], [355, -64], [295, -32], [400, -301], [350, -294], [300, -278]]
      : [[332, 118], [336, 162], [322, 204], [290, 238], [244, 256], [198, 257], [152, 240], [112, 210]];
    for (const [px, py] of pts) { c.beginPath(); c.arc(px, py, 5.5, 0, 6.28); c.fill(); }
    // banda del rebozo en la base del ala, bordada
    const band = c.createRadialGradient(0, 0, 0, 0, 0, 125);
    band.addColorStop(0, 'rgba(26,22,24,1)'); band.addColorStop(.82, 'rgba(26,22,24,.96)'); band.addColorStop(1, 'rgba(26,22,24,0)');
    c.fillStyle = band; c.beginPath(); c.arc(0, 0, 125, 0, 6.28); c.fill();
    c.restore();
    c.lineWidth = 3.5; c.strokeStyle = '#140d0b'; c.stroke(p);
  }
  // bordado del rebozo (flores como las de su chal)
  flowerMotif(c, 88, 60, 20, '#e3267f'); flowerMotif(c, 60, -45, 17, '#e6332a'); flowerMotif(c, 104, -6, 13, '#f0b73a');
  flowerMotif(c, 40, 100, 14, '#d75ad8'); flowerMotif(c, 100, -78, 12, '#e3267f');
  c.restore();
}

function render(t, c) {
  c.save(); c.setTransform(K, 0, 0, K, 0, 0);
  c.clearRect(0, 0, CW, CH);
  c.translate(OX, OY);
  c.drawImage(art, 0, 0);

  // ---- Alas detrás de la figura ----
  const open = t < T.wingsClose[0] ? backOut((t - T.wingsOpen[0]) / (T.wingsOpen[1] - T.wingsOpen[0]))
    : 1 - ease((t - T.wingsClose[0]) / (T.wingsClose[1] - T.wingsClose[0]));
  if (open > 0.01) {
    const flapping = t > T.wingsOpen[1] - .3 && t < T.wingsClose[0] + .4;
    const ph = (t - T.wingsOpen[1]) * 2.6;
    const lift = flapping ? (Math.sin(ph) * .5 + .5) : 0;
    const sc = .86 + .14 * (1 - lift);
    c.save(); c.translate(SHOULDER_R.x, SHOULDER_R.y); wing(c, Math.max(0, open) * sc, lift); c.restore();
    c.save(); c.translate(SHOULDER_L.x, SHOULDER_L.y); c.scale(-1, 1); wing(c, Math.max(0, open) * sc, lift); c.restore();
    // halo dorado detrás de la figura
    c.save(); c.globalCompositeOperation = 'lighter';
    const hg = c.createRadialGradient(330, 380, 40, 330, 380, 360);
    hg.addColorStop(0, `rgba(255,200,90,${.16 * clamp(open)})`); hg.addColorStop(1, 'rgba(255,200,90,0)');
    c.fillStyle = hg; c.fillRect(-OX, -OY, CW, CH); c.restore();
    c.drawImage(fig, 0, 0);
  }

  // ---- Oro: letra manuscrita y braille ----
  const goldFade = 1 - clamp((t - T.goldOut[0]) / (T.goldOut[1] - T.goldOut[0]));
  if (goldFade > 0) {
    // las palabras se elevan y se apagan cuando abren las alas (la frase pasa al subtítulo)
    const handFade = goldFade * (1 - clamp((t - T.handOut[0]) / (T.handOut[1] - T.handOut[0])));
    const rise = -26 * easeOut((t - T.handOut[0]) / (T.handOut[1] - T.handOut[0]));
    if (handFade > 0) for (const [lines, [g0, g1]] of [[HAND_L, T.goldL], [HAND_R, T.goldR]]) {
      const span = (g1 - g0) / lines.length;
      lines.forEach(([x0, y0, x1, y1], i) => {
        const k = clamp((t - g0 - i * span) / span); if (k <= 0) return;
        const xe = x0 + (x1 - x0) * k;
        c.save(); c.globalAlpha = handFade; c.translate(0, rise); c.beginPath(); c.rect(x0 - 2, y0 - 2, xe - x0 + 2, y1 - y0 + 4); c.clip();
        c.shadowColor = 'rgba(255,190,60,.9)'; c.shadowBlur = 10; c.drawImage(gold, 0, 0); c.shadowBlur = 0; c.drawImage(gold, 0, 0);
        c.restore();
        if (k < 1) { // punta de la pluma
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = handFade;
          const pg = c.createRadialGradient(xe, (y0 + y1) / 2, 0, xe, (y0 + y1) / 2, 22);
          pg.addColorStop(0, 'rgba(255,235,170,.95)'); pg.addColorStop(1, 'rgba(255,190,60,0)');
          c.fillStyle = pg; c.beginPath(); c.arc(xe, (y0 + y1) / 2, 22, 0, 6.28); c.fill(); c.restore();
        }
      });
    }
    BRAILLE.forEach((line, li) => {
      const [g0, g1] = li < 3 ? T.goldL : T.goldR, idx = li % 3;
      const span = (g1 - g0) / 3, t0 = g0 + idx * span;
      line.forEach(([x, y], di) => {
        const td = t0 + (di / line.length) * span, k = clamp((t - td) / .25); if (k <= 0) return;
        const pop = 1 + .8 * Math.max(0, 1 - (t - td) / .35);
        c.save(); c.globalAlpha = goldFade;
        c.fillStyle = '#ffd36b'; c.shadowColor = 'rgba(255,190,60,.95)'; c.shadowBlur = 8;
        c.beginPath(); c.arc(x, y, 4.2 * pop * k, 0, 6.28); c.fill(); c.restore();
      });
    });
  }

  // ---- Pétalos que se desprenden de la corona ----
  for (const p of petals) {
    const q = t - T.petals - p.d; if (q < 0 || q > p.life) continue;
    const x = p.x + p.vx * q + Math.sin(q * 1.6 + p.ph) * p.sw, y = p.y + p.vy * q - 10 * q * q;
    const a = Math.min(1, q * 3) * (1 - clamp((q - p.life + 1) / 1));
    c.save(); c.translate(x, y); c.rotate(p.rot + p.vr * q); c.scale(1, .6 + .4 * Math.abs(Math.sin(q * 3 + p.ph)));
    c.globalAlpha = a; const gr = c.createLinearGradient(0, -p.s, 0, p.s); gr.addColorStop(0, p.c[0]); gr.addColorStop(1, p.c[1]);
    c.fillStyle = gr; petal(c, p.s); c.fill(); c.strokeStyle = 'rgba(20,12,14,.85)'; c.lineWidth = 1.3; c.stroke(); c.restore();
  }

  // ---- Mariposas ----
  for (const b of butterflies) {
    const q = (t - T.butterflies - b.d) / b.dur; if (q < 0 || q > 1) continue;
    const e = ease(q), u = 1 - e;
    const x = u * u * b.sx + 2 * u * e * b.cx + e * e * b.ex, y = u * u * b.sy + 2 * u * e * b.cy + e * e * b.ey;
    const dx = 2 * u * (b.cx - b.sx) + 2 * e * (b.ex - b.cx), dy = 2 * u * (b.cy - b.sy) + 2 * e * (b.ey - b.cy);
    const heading = Math.atan2(dy, dx) + Math.PI / 2;
    const alpha = clamp(q * 6) * (1 - clamp((q - .82) / .18));
    butterfly(c, x, y, b.size * (.7 + .3 * clamp(q * 4)), heading * .6, (t - T.butterflies) * b.fq + b.ph, b.pal, alpha);
  }

  // ---- Destellos en el oro de aretes, collar y corona ----
  for (const g of GLINTS) {
    const q = (t - g.t) / .7; if (q < 0 || q > 1) continue;
    const s = Math.sin(q * Math.PI) * 16;
    c.save(); c.translate(g.x, g.y); c.rotate(q * 1.2); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,240,190,.95)';
    c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .18 : s; const a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.restore();
  }

  // ---- Parpadeo ----
  for (const tb of [T.blink1, T.blink2, T.blink3]) {
    const q = (t - tb) / .2; if (q < 0 || q > 1) continue;
    const close = Math.sin(q * Math.PI);
    EYES.forEach((e, i) => {
      c.save(); c.beginPath(); c.ellipse(e.x, e.y, e.rx, e.ry + 2, 0, 0, 6.28); c.clip();
      const ly = e.y - e.ry - 2 + (e.ry * 2 + 4) * close;
      c.fillStyle = lidColors[i]; c.fillRect(e.x - e.rx - 2, e.y - e.ry - 4, e.rx * 2 + 4, ly - (e.y - e.ry - 4));
      c.strokeStyle = '#1a1010'; c.lineWidth = 3.2;
      c.beginPath(); c.ellipse(e.x, ly - (e.ry + 2) * (1 - close) * .2, e.rx, Math.max(1, (e.ry + 2) * (1 - close) * .5 + 1), 0, 0.12, Math.PI - .12); c.stroke();
      c.restore();
    });
  }
  c.restore();
}

/* ---------------- Sonido (sintetizado) ---------------- */
let actx = null, muted = false;
function initAudio() { try { actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { actx = null; } }
function chime(freq, gain = .18, dur = 1.6) {
  if (!actx || muted) return;
  const t0 = actx.currentTime;
  for (const [mul, gm] of [[1, 1], [2.76, .25], [5.4, .08]]) {
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = freq * mul;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain * gm, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + .05);
  }
}
function whoosh(dur = .7, f0 = 300, f1 = 1400, gain = .5) {
  if (!actx || muted) return;
  const t0 = actx.currentTime, n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
  const s = actx.createBufferSource(); s.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = actx.createGain(); g.gain.value = gain;
  s.connect(f).connect(g).connect(actx.destination); s.start(t0);
}
// Pentatónica para las palabras en braille (una nota por renglón leído)
const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const CUES = [
  ...NOTES.map((n, i) => ({ t: (i < 3 ? T.goldL[0] + i * (T.goldL[1] - T.goldL[0]) / 3 : T.goldR[0] + (i - 3) * (T.goldR[1] - T.goldR[0]) / 3) + .05, f: () => chime(n) })),
  { t: T.wingsOpen[0], f: () => whoosh(1.2, 180, 1600, .7) },
  ...Array.from({ length: 6 }, (_, i) => ({ t: T.wingsOpen[1] + .3 + i * (Math.PI * 2 / 2.6), f: () => whoosh(.5, 200, 700, .35) })),
  { t: T.wingsClose[0], f: () => whoosh(1, 1400, 220, .45) },
  ...GLINTS.map((g, i) => ({ t: g.t, f: () => chime(1318.5 + i * 120, .07, .9) })),
];

/* ---------------- Marcador MindAR (compilado en el teléfono, con caché) ---------------- */
const CACHE_KEY = 'frida-alas-mind-v1';
const COMPILER_URL = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js';
function b64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const s = atob(str), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
async function loadCompiler() {
  const fromGlobal = () => window.MINDAR && window.MINDAR.IMAGE && window.MINDAR.IMAGE.Compiler;
  try { const mod = await import(COMPILER_URL); const C = mod.Compiler || fromGlobal(); if (C) return C; } catch (e) {}
  await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = COMPILER_URL; s.onload = ok; s.onerror = () => ko(new Error('No cargó el compilador de MindAR')); document.head.appendChild(s); });
  const C = fromGlobal(); if (!C) throw new Error('El compilador de MindAR no está disponible');
  return C;
}
async function getTargetSrc(img, onProgress) {
  try { const r = await fetch('assets/targets.mind', { method: 'HEAD' }); if (r.ok) return 'assets/targets.mind'; } catch (e) {}
  try { const cached = localStorage.getItem(CACHE_KEY); if (cached) return URL.createObjectURL(new Blob([unb64(cached)])); } catch (e) {}
  const Compiler = await loadCompiler();
  const compiler = new Compiler();
  await compiler.compileImageTargets([img], (p) => onProgress(p));
  const data = await compiler.exportData();
  try { localStorage.setItem(CACHE_KEY, b64(data)); } catch (e) {}
  return URL.createObjectURL(new Blob([data]));
}

/* ---------------- Arranque ---------------- */
async function loadArt() {
  const [img, mask] = await Promise.all([loadImg('assets/target.webp'), loadImg('assets/figura.png')]);
  buildLayers(img, mask); return img;
}
function makeCanvas() { return mk(Math.round(CW * K), Math.round(CH * K)); }

function runCues(t, fired) { for (let i = 0; i < CUES.length; i++) if (t >= CUES[i].t && !fired.has(i)) { fired.add(i); CUES[i].f(); } }
function caption(t) { $('quote').classList.toggle('on', t > T.wingsOpen[1] && t < T.wingsClose[0] + .6); }

async function start() {
  initAudio();
  show('intro', false); show('loading');
  const bar = $('loadBar');
  try {
    const img = await loadArt();
    const src = await getTargetSrc(img, (p) => { bar.style.width = Math.round(p) + '%'; });
    bar.style.width = '100%'; $('loadMsg').textContent = 'Abriendo cámara';
    const mindar = new MindARThree({ container: $('ar'), imageTargetSrc: src, uiLoading: 'no', uiScanning: 'no', uiError: 'no', ...MINDAR_PASSTHROUGH });
    const { renderer, scene, camera } = mindar;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    const canvas = makeCanvas(), ctx = canvas.getContext('2d');
    render(0, ctx);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(CW / W, CH / W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const anchor = mindar.addAnchor(0);
    const stab = makeStabilizer(anchor); scene.add(stab.group); stab.group.add(plane);   // pose rígida y estable
    const debug = makeDebug(stab);

    let visible = false, t0 = 0, fired = new Set(), lastT = 0, lastDraw = 0, lostAt = 0, everFound = false;
    const restart = () => { t0 = performance.now(); fired = new Set(); };
    // si se pierde el estampado un instante, la animación sigue donde iba
    anchor.onTargetFound = () => { visible = true; if (!everFound || performance.now() - lostAt > 2500) restart(); everFound = true; show('scan', false); };
    anchor.onTargetLost = () => { visible = false; lostAt = performance.now(); show('scan'); $('quote').classList.remove('on'); };

    preferHDCamera();
    await mindar.start();
    show('loading', false); show('scan'); show('hud');
    $('replay').onclick = () => { if (actx) actx.resume(); restart(); };
    $('mute').onclick = () => { muted = !muted; $('mute').textContent = muted ? 'Sin sonido' : 'Sonido'; $('mute').setAttribute('aria-pressed', String(muted)); };

    renderer.setAnimationLoop(() => {
      stab.update();
      if (visible) {
        const now = performance.now(), t = ((now - t0) / 1000) % LOOP;
        if (t < lastT) fired = new Set();
        lastT = t; runCues(t, fired); caption(t);
        // redibujar la animación a 30 fps: subir la textura cada cuadro le robaba tiempo al rastreo
        if (now - lastDraw > 32) { lastDraw = now; render(t, ctx); tex.needsUpdate = true; }
      }
      renderer.render(scene, camera); debug();
    });
  } catch (e) {
    console.error(e);
    show('loading', false); show('err');
    if (/Permission|NotAllowed|getUserMedia|camera/i.test(String(e && (e.name + e.message)))) $('errMsg').textContent = 'El navegador no dio permiso a la cámara. Actívalo en la configuración del sitio y vuelve a intentar.';
    $('errDetail').textContent = String(e && e.message || e);
  }
}
$('start').addEventListener('click', start, { once: true });

// Vista previa sin cámara: agrega #preview al link
if (location.hash === '#preview') {
  loadArt().then(() => {
    show('intro', false);
    const canvas = makeCanvas(), ctx = canvas.getContext('2d');
    canvas.className = 'preview'; document.body.appendChild(canvas);
    const s = performance.now(); let fired = new Set(), lastT = 0;
    $('preview-sound').hidden = false;
    $('preview-sound').onclick = () => { initAudio(); $('preview-sound').hidden = true; };
    const loop = () => { const t = ((performance.now() - s) / 1000) % LOOP; if (t < lastT) fired = new Set(); lastT = t; runCues(t, fired); caption(t); render(t, ctx); requestAnimationFrame(loop); };
    loop();
  });
}

// Para pruebas locales de cuadros
window.__frida = { loadArt, makeCanvas, render };
