// Llavero de emoji en SVG para corte y grabado láser. Todo en milímetros.
//
//   <g id="grabado">  el emoji como forma rellena (trazado, sin <text>)
//   <g id="corte">    borde exterior (emoji + margen + anilla) y agujero de la anilla, como línea fina
//
// El borde de corte se calcula engrosando la silueta del emoji con ClipperLib (offset de polígonos).

import { CATEGORIAS } from "./emojis.js?v=1";
export { CATEGORIAS };

export const ANILLAS = ["none", "top-left", "top", "top-right", "left", "right", "bottom"];

export const DEFAULTS = {
  color: "#000000",        // grabado (emoji)
  colorCorte: "#ff0000",   // borde y agujero; null = el mismo que el grabado
  emoji: "🐢",
  emojiSize: 40,           // lado mayor del emoji (mm)
  margin: 3,               // anchura del borde de madera alrededor del emoji (mm)
  union: 2,                // une partes separadas si el hueco entre ellas es menor que 2 × este valor (mm)
  anilla: "top-left",      // ver ANILLAS
  holeDiameter: 4,         // diámetro del agujero (mm)
  wall: 2.5,               // grosor de madera alrededor del agujero (mm)
  strokeWidth: 0.1,        // grosor de la línea de corte (mm)
};

const r3 = (n) => Math.round(n * 1000) / 1000;
const num = (v, def) => (Number.isFinite(v) ? v : def);
const ESC = 1000;        // Clipper trabaja con enteros: 1 mm = 1000 unidades

export function sanear(p) {
  const q = { ...DEFAULTS, ...p };
  q.emojiSize = Math.max(5, num(q.emojiSize, DEFAULTS.emojiSize));
  q.margin = Math.max(0.5, num(q.margin, DEFAULTS.margin));
  q.union = Math.max(0, num(q.union, DEFAULTS.union));
  q.holeDiameter = Math.max(1, num(q.holeDiameter, DEFAULTS.holeDiameter));
  q.wall = Math.max(1, num(q.wall, DEFAULTS.wall));
  if (!ANILLAS.includes(q.anilla)) q.anilla = "none";
  return q;
}

/** Primer carácter de emoji de la cadena (sin selectores de variación ni uniones). */
export function primerEmoji(s) {
  const chars = Array.from(String(s || "")).filter((c) => !/[︎️‍⃣]/.test(c) && !/\s/.test(c));
  return chars[0] || "";
}

// ---------------------------------------------------------------------
// Trazados
// ---------------------------------------------------------------------

/** Convierte los comandos del glifo en polígonos (listas de [x, y]) aproximando las curvas. */
function aplanar(cmds, pasos = 14) {
  const polys = [];
  let cur = null, cx = 0, cy = 0;
  for (const c of cmds) {
    if (c.type === "M") { cur = [[c.x, c.y]]; polys.push(cur); cx = c.x; cy = c.y; }
    else if (c.type === "L") { cur.push([c.x, c.y]); cx = c.x; cy = c.y; }
    else if (c.type === "Q") {
      for (let i = 1; i <= pasos; i++) {
        const t = i / pasos, m = 1 - t;
        cur.push([m * m * cx + 2 * m * t * c.x1 + t * t * c.x, m * m * cy + 2 * m * t * c.y1 + t * t * c.y]);
      }
      cx = c.x; cy = c.y;
    } else if (c.type === "C") {
      for (let i = 1; i <= pasos; i++) {
        const t = i / pasos, m = 1 - t;
        cur.push([
          m ** 3 * cx + 3 * m * m * t * c.x1 + 3 * m * t * t * c.x2 + t ** 3 * c.x,
          m ** 3 * cy + 3 * m * m * t * c.y1 + 3 * m * t * t * c.y2 + t ** 3 * c.y,
        ]);
      }
      cx = c.x; cy = c.y;
    }
  }
  return polys.filter((p) => p.length >= 3);
}

function mover(cmds, k, dx, dy) {
  return cmds.map((c) => {
    const o = { type: c.type };
    if (c.type === "Z") return o;
    o.x = c.x * k + dx; o.y = c.y * k + dy;
    if (c.type === "Q" || c.type === "C") { o.x1 = c.x1 * k + dx; o.y1 = c.y1 * k + dy; }
    if (c.type === "C") { o.x2 = c.x2 * k + dx; o.y2 = c.y2 * k + dy; }
    return o;
  });
}

function aD(cmds) {
  let d = "";
  for (const c of cmds) {
    if (c.type === "Z") d += "Z";
    else if (c.type === "M" || c.type === "L") d += `${c.type}${r3(c.x)} ${r3(c.y)}`;
    else if (c.type === "Q") d += `Q${r3(c.x1)} ${r3(c.y1)} ${r3(c.x)} ${r3(c.y)}`;
    else if (c.type === "C") d += `C${r3(c.x1)} ${r3(c.y1)} ${r3(c.x2)} ${r3(c.y2)} ${r3(c.x)} ${r3(c.y)}`;
  }
  return d;
}

const circuloPath = (cx, cy, r) =>
  `M${r3(cx - r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(cx + r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(cx - r)} ${r3(cy)}Z`;

function circuloPoly(cx, cy, r, n = 120) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

const aClipper = (polys) => polys.map((p) => p.map(([x, y]) => ({ X: Math.round(x * ESC), Y: Math.round(y * ESC) })));
const deClipper = (polys) => polys.map((p) => p.map((q) => [q.X / ESC, q.Y / ESC]));

// ---------------------------------------------------------------------
// Operaciones con polígonos (ClipperLib)
// ---------------------------------------------------------------------

/** Unión de polígonos y se queda solo con los contornos exteriores (sin huecos). */
function silueta(C, polys) {
  const clip = new C.Clipper();
  clip.AddPaths(aClipper(polys), C.PolyType.ptSubject, true);
  const tree = new C.PolyTree();
  clip.Execute(C.ClipType.ctUnion, tree, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  const fuera = [];
  const recorre = (n) => {
    for (const h of n.Childs()) {
      if (!h.IsHole()) fuera.push(h.Contour());
      recorre(h);
    }
  };
  recorre(tree);
  return deClipper(fuera);
}

function engrosar(C, polys, delta) {
  if (!delta) return polys;
  const co = new C.ClipperOffset(2, 0.01 * ESC); // tolerancia de arco 0,01 mm
  co.AddPaths(aClipper(polys), C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, delta * ESC);
  return deClipper(out);
}

/** Distancia desde (x,y) hasta el punto más lejano en la dirección d donde el rayo sale de los polígonos. */
function salidaRayo(polys, ox, oy, dx, dy) {
  let mejor = 0;
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
      const ex = x2 - x1, ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((x1 - ox) * ey - (y1 - oy) * ex) / den;   // a lo largo del rayo
      const u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;   // a lo largo del segmento
      if (t > mejor && u >= 0 && u <= 1) mejor = t;
    }
  }
  return mejor;
}

const DIRS = {
  "top-left": [-Math.SQRT1_2, -Math.SQRT1_2], top: [0, -1], "top-right": [Math.SQRT1_2, -Math.SQRT1_2],
  left: [-1, 0], right: [1, 0], bottom: [0, 1],
};

function pathDePolys(polys) {
  return polys.map((p) => "M" + p.map(([x, y]) => `${r3(x)} ${r3(y)}`).join("L") + "Z").join("");
}

function cajaPolys(polys) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  return { x1, y1, x2, y2 };
}

// ---------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------

/**
 * Construye el llavero. `ctx` = { emoji: Font (opentype.js), clipper: ClipperLib }.
 * Devuelve { w, h, inner, avisos, piezas } con el origen arriba a la izquierda.
 */
export function construirLlavero(ctx, p) {
  const q = sanear(p);
  const C = ctx.clipper;
  const avisos = [];
  const ch = primerEmoji(q.emoji);
  if (!ch) return { w: 0, h: 0, inner: "", avisos, piezas: 0, vacio: true };
  if (!ctx.emoji || ctx.emoji.charToGlyphIndex(ch) <= 0) {
    avisos.push(`El emoji «${ch}» no está disponible en la fuente de emojis.`);
    return { w: 0, h: 0, inner: "", avisos, piezas: 0, vacio: true };
  }

  // --- emoji a tamaño y centrado en el origen ---
  const cmds0 = ctx.emoji.getPath(ch, 0, 0, 1000).commands;
  const poly0 = aplanar(cmds0);
  const b0 = cajaPolys(poly0);
  const bw = b0.x2 - b0.x1, bh = b0.y2 - b0.y1;
  if (!(bw > 0 && bh > 0)) {
    avisos.push(`El emoji «${ch}» no tiene forma que dibujar.`);
    return { w: 0, h: 0, inner: "", avisos, piezas: 0, vacio: true };
  }
  const k = q.emojiSize / Math.max(bw, bh);
  const dx0 = -((b0.x1 + b0.x2) / 2) * k, dy0 = -((b0.y1 + b0.y2) / 2) * k;
  const emojiCmds = mover(cmds0, k, dx0, dy0);
  const emojiPolys = poly0.map((pl) => pl.map(([x, y]) => [x * k + dx0, y * k + dy0]));

  // --- borde: silueta + margen (cerrando huecos pequeños) ---
  const sil = silueta(C, emojiPolys);
  let borde = engrosar(C, sil, q.margin + q.union);
  if (q.union > 0) borde = engrosar(C, borde, -q.union);
  borde = silueta(C, borde);

  // --- anilla ---
  let agujero = null;
  if (q.anilla !== "none") {
    const [ux, uy] = DIRS[q.anilla];
    const r = q.holeDiameter / 2, R = r + q.wall;
    const t = salidaRayo(borde, 0, 0, ux, uy);
    const dist = t + r + q.wall / 2;
    const cx = ux * dist, cy = uy * dist;
    agujero = { cx, cy, r };
    borde = silueta(C, [...borde, circuloPoly(cx, cy, R)]);
    // el agujero no debe tocar el emoji
    const clip = new C.Clipper();
    clip.AddPaths(aClipper(sil), C.PolyType.ptSubject, true);
    clip.AddPath(aClipper([circuloPoly(cx, cy, r)])[0], C.PolyType.ptClip, true);
    const inter = new C.Paths();
    clip.Execute(C.ClipType.ctIntersection, inter, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    if (inter.length) avisos.push("El agujero de la anilla toca el emoji: cambia la posición de la anilla.");
  }
  borde = C.Clipper.CleanPolygons ? deClipper(C.Clipper.CleanPolygons(aClipper(borde), 0.01 * ESC)) : borde;
  borde = borde.filter((pl) => pl.length >= 3);
  if (borde.length > 1) avisos.push(`El borde de corte tiene ${borde.length} piezas separadas: aumenta el margen o «Unir partes».`);

  // --- caja y desplazamiento al origen arriba-izquierda ---
  const cb = cajaPolys(borde);
  const sx = -cb.x1, sy = -cb.y1;
  const w = cb.x2 - cb.x1, h = cb.y2 - cb.y1;
  const mueve = (pls) => pls.map((pl) => pl.map(([x, y]) => [x + sx, y + sy]));

  const grabado = `<path id="figura-emoji" d="${aD(mover(emojiCmds, 1, sx, sy))}"/>`;
  let corte = `<path id="contorno" d="${pathDePolys(mueve(borde))}"/>`;
  if (agujero) corte += `<path id="agujero" d="${circuloPath(agujero.cx + sx, agujero.cy + sy, agujero.r)}"/>`;

  const cut = q.colorCorte || q.color;
  const inner =
    `<g id="grabado" fill="${q.color}" stroke="none">${grabado}</g>` +
    `<g id="corte" fill="none" stroke="${cut}" stroke-width="${q.strokeWidth}">${corte}</g>`;
  return { w, h, inner, avisos, piezas: borde.length, agujero: agujero && { x: agujero.cx + sx, y: agujero.cy + sy, r: agujero.r }, borde: mueve(borde) };
}

export function envolverSVG(w, h, inner, titulo = "") {
  const t = titulo ? `<title>${titulo.replace(/[<&>"]/g, "")}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r3(w)}mm" height="${r3(h)}mm" viewBox="0 0 ${r3(w)} ${r3(h)}">` +
    t + inner + `</svg>\n`
  );
}
