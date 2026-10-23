/* ============================================================
   ESTABILIZADOR DE POSE (para MindAR + three.js)

   Problema: MindAR suaviza la pose filtrando por separado los 16 números
   de la matriz. El resultado deja de ser una transformación rígida
   (aparece estiramiento y torcedura): el contenido 3D "se deforma",
   no se queda pegado al estampado, y o tiembla o se atrasa.

   Solución: se apaga el filtro de MindAR. Aquí la pose cruda se separa en
   rotación, posición lateral, profundidad y escala; cada parte se filtra con
   un filtro adaptativo (muy suave con el celular quieto, rápido al moverlo)
   y se recompone una matriz rígida con escala uniforme.
   - La velocidad se estima sobre una señal presuavizada y se le resta el
     nivel de ruido del rastreo, para que el ruido no "desactive" el suavizado.
   - La profundidad (lo que más brinca en MindAR) se filtra más fuerte.
   ============================================================ */
import * as THREE from 'three';

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const num = (k, d) => { const v = parseFloat(QS.get(k)); return Number.isFinite(v) ? v : d; };

// Parámetros (afinables desde la URL: ?rmin=…&rbeta=…&pmin=…&pbeta=…&zmin=…)
export const STAB = {
  rotMin: num('rmin', 0.3), rotBeta: num('rbeta', 6.0), rotFloor: num('rfloor', 0.15),   // Hz · Hz por rad/s · rad/s
  posMin: num('pmin', 0.7), posBeta: num('pbeta', 4.0), posFloor: num('pfloor', 0.12),    // por (ancho de ilustración)/s
  depMin: num('zmin', 0.35), depBeta: num('zbeta', 3.0), depFloor: num('zfloor', 0.25),     // profundidad relativa/s
  pre: 4.0,          // presuavizado para estimar velocidad (Hz)
  vCut: 1.5,         // suavizado de la velocidad (Hz)
  snapAngle: 0.6,    // salto mayor (rad) = nueva detección: se reacomoda de golpe
};

// Opciones para MindAR: su filtro queda apagado (pasa la pose cruda) y toleramos huecos cortos
export const MINDAR_PASSTHROUGH = { filterMinCF: 1000, filterBeta: 0, warmupTolerance: 3, missTolerance: 8 };

const alphaFor = (cutoff, dt) => { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); };

export function makeStabilizer(anchor, P = STAB) {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false; group.visible = false;
  const rp = new THREE.Vector3(), rq = new THREE.Quaternion(), rs = new THREE.Vector3();
  // presuavizado (solo para estimar velocidad)
  const pp = new THREE.Vector3(), pq = new THREE.Quaternion(); let ps = 1;
  const lp = new THREE.Vector3(), lq = new THREE.Quaternion(); let ls = 1;
  // salida filtrada + velocidades del predictor (filtro alfa-beta: sin retraso a velocidad constante)
  const fp = new THREE.Vector3(), fq = new THREE.Quaternion(); let fs = 1;
  const vel = new THREE.Vector3(), omega = new THREE.Vector3(); let sVel = 0;
  let vRot = 0, vPos = 0, vDep = 0, last = 0, lastRawT = 0, init = false;
  const lastEl = new Float32Array(16);
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), t3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const toVec = (q, out) => { // cuaternión -> vector de rotación (eje * ángulo)
    if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    const sn = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z), ang = 2 * Math.atan2(sn, q.w);
    return sn < 1e-9 ? out.set(0, 0, 0) : out.set(q.x, q.y, q.z).multiplyScalar(ang / sn);
  };
  const fromVec = (v, out) => { const ang = v.length(); if (ang < 1e-9) return out.set(0, 0, 0, 1); const k = Math.sin(ang / 2) / ang; return out.set(v.x * k, v.y * k, v.z * k, Math.cos(ang / 2)); };
  const hFor = (g) => g * g / (2 - g);   // ganancia de velocidad (Benedict–Bordner)

  function update(now = performance.now()) {
    const gA = anchor.group;
    group.visible = gA.visible;
    if (!gA.visible) { init = false; return false; }
    // ¿llegó una pose nueva del rastreo? (el rastreo va a 15–30 fps; la pantalla a 60)
    const el = gA.matrix.elements; let fresh = !init;
    for (let i = 0; i < 16 && !fresh; i++) if (el[i] !== lastEl[i]) fresh = true;
    const dtFrame = Math.min(0.1, Math.max(1 / 240, (now - last) / 1000)); last = now;
    if (init && !fresh) {                       // entre poses: solo predecir con la velocidad
      const k = Math.min(1, (now - lastRawT) / 1000 < 0.15 ? 1 : 0);
      if (k) { fq.copy(qb.copy(fromVec(t3.copy(omega).multiplyScalar(dtFrame), qa)).multiply(fq)).normalize(); fp.addScaledVector(vel, dtFrame); fs += sVel * dtFrame; }
      group.matrix.compose(fp, fq, t1.copy(one).multiplyScalar(fs)); group.updateMatrixWorld(true);
      return true;
    }
    lastEl.set(el);
    gA.matrix.decompose(rp, rq, rs); rq.normalize();
    const s = (Math.abs(rs.x) + Math.abs(rs.y) + Math.abs(rs.z)) / 3 || 1;
    const dt = Math.min(0.1, Math.max(1 / 240, (now - (lastRawT || now - 33)) / 1000)); lastRawT = now;
    if (!init || fq.angleTo(rq) > P.snapAngle) {
      fp.copy(rp); fq.copy(rq); fs = s; pp.copy(rp); pq.copy(rq); ps = s; lp.copy(rp); lq.copy(rq); ls = s;
      vel.set(0, 0, 0); omega.set(0, 0, 0); sVel = 0; vRot = vPos = vDep = 0; init = true;
    } else {
      // 1) velocidad estimada sobre señal presuavizada, menos el nivel de ruido
      const a0 = alphaFor(P.pre, dt);
      pp.lerp(rp, a0); pq.slerp(rq, a0); ps += (s - ps) * a0;
      const depth = Math.max(1e-6, pp.length());
      t1.subVectors(pp, lp); const along = t1.dot(t2.copy(pp).normalize());
      const lat = Math.sqrt(Math.max(0, t1.lengthSq() - along * along)) / ps / dt;
      const dep = (Math.abs(along) / depth + Math.abs(ps - ls) / ps) / dt;
      const rot = lq.angleTo(pq) / dt;
      lp.copy(pp); lq.copy(pq); ls = ps;
      const av = alphaFor(P.vCut, dt);
      vRot += (Math.max(0, rot - P.rotFloor) - vRot) * av;
      vPos += (Math.max(0, lat - P.posFloor) - vPos) * av;
      vDep += (Math.max(0, dep - P.depFloor) - vDep) * av;
      // ganancias adaptativas: suaves en reposo, rápidas en movimiento
      const gR = alphaFor(P.rotMin + P.rotBeta * vRot, dt);
      const gL = alphaFor(P.posMin + P.posBeta * (vPos + vRot * .5), dt);
      const gD = alphaFor(P.depMin + P.depBeta * (vDep + vPos * .3), dt);
      // 2) rotación: predecir con la velocidad angular y corregir
      const pred = qa.copy(fromVec(t3.copy(omega).multiplyScalar(dt), qb)).multiply(fq);
      const res = toVec(qb.copy(rq).multiply(pred.clone().invert()), t3);
      fq.copy(fromVec(t1.copy(res).multiplyScalar(gR), qb).multiply(pred)).normalize();
      omega.addScaledVector(res, hFor(gR) / dt).multiplyScalar(vRot > 0 ? 1 : .9);   // en reposo la velocidad se apaga
      // 3) posición: lateral y profundidad con ganancias distintas
      const fpPred = t2.copy(fp).addScaledVector(vel, dt);
      const dir = t1.copy(fpPred).normalize();
      const r = t3.subVectors(rp, fpPred); const rAlong = r.dot(dir);
      const rLat = r.clone().addScaledVector(dir, -rAlong);
      fp.copy(fpPred).addScaledVector(rLat, gL).addScaledVector(dir, rAlong * gD);
      vel.addScaledVector(rLat, hFor(gL) / dt).addScaledVector(dir, rAlong * hFor(gD) / dt).multiplyScalar(vPos + vDep > 0 ? 1 : .9);
      // 4) escala (profundidad aparente)
      const sPred = fs + sVel * dt, sr = s - sPred;
      fs = sPred + gD * sr; sVel = (sVel + hFor(gD) * sr / dt) * (vDep > 0 ? 1 : .9);
    }
    group.matrix.compose(fp, fq, t1.copy(one).multiplyScalar(fs));   // rígida + escala uniforme
    group.updateMatrixWorld(true);
    return true;
  }
  return { group, update, reset: () => { init = false; }, state: () => ({ vRot, vPos, vDep, fs }) };
}

/* Pide más resolución a la cámara (la precisión del rastreo depende de los píxeles).
   ?res=sd lo desactiva. Llamar ANTES de mindar.start(). */
export function preferHDCamera() {
  if (QS.get('res') === 'sd' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  const md = navigator.mediaDevices; if (md.__hdPatched) return; md.__hdPatched = true;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = (c) => {
    try { if (c && c.video) { const v = typeof c.video === 'object' ? c.video : {}; c = { ...c, video: { ...v, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } }; } } catch (e) {}
    return orig(c);
  };
}

/* Indicador opcional (?debug=1): cuadros por segundo y velocidades */
export function makeDebug(stab) {
  if (QS.get('debug') !== '1') return () => {};
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;z-index:99;left:8px;top:calc(8px + env(safe-area-inset-top,0px));font:12px/1.3 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);padding:6px 8px;border-radius:6px;pointer-events:none';
  document.body.appendChild(el);
  let n = 0, t0 = performance.now();
  return () => {
    n++; const now = performance.now();
    if (now - t0 > 500) { const fps = n * 1000 / (now - t0); n = 0; t0 = now; const st = stab.state(); el.textContent = `${fps.toFixed(0)} fps · giro ${st.vRot.toFixed(2)} · lateral ${st.vPos.toFixed(2)} · prof ${st.vDep.toFixed(2)}`; }
  };
}
