import opentype from "opentype.js";

import { DEFAULTS, CATEGORIAS, construirLlavero, envolverSVG, primerEmoji } from "./svg.js?v=1";

const el = (id) => document.getElementById(id);

window.addEventListener("error", (e) => {
  const s = el("status");
  if (s) { s.textContent = "Error: " + (e.message || "no se pudo iniciar") + ". Prueba a recargar con Ctrl+Shift+R."; s.classList.add("error"); }
});

const statusEl = el("status");
const downloadBtn = el("download-btn");
const holder = el("svg-holder");

const cacheFuentes = {};
async function cargarFuente(peso) {
  if (!cacheFuentes[peso]) {
    const res = await fetch(`./fonts/noto-emoji-${peso}.ttf`);
    if (!res.ok) throw new Error("no se pudo cargar la fuente de emojis");
    cacheFuentes[peso] = opentype.parse(await res.arrayBuffer());
  }
  return cacheFuentes[peso];
}

const NUM_FIELDS = ["emojiSize", "margin", "union", "holeDiameter", "wall"];
let lastSVG = null, lastName = "llavero", categoriaActual = 0;

function applyDefaultsToUI() {
  for (const k of NUM_FIELDS) el(k).value = DEFAULTS[k];
  el("anilla").value = DEFAULTS.anilla;
  el("color").value = DEFAULTS.color;
  el("colorCorte").value = DEFAULTS.colorCorte;
  el("cutOther").checked = true;
  el("emojiWeight").value = "400";
  syncUI();
}

function syncUI() {
  const hay = el("anilla").value !== "none";
  el("holeDiameter").disabled = !hay;
  el("wall").disabled = !hay;
  el("cutColorRow").hidden = !el("cutOther").checked;
}

function readParams() {
  const p = { ...DEFAULTS };
  for (const k of NUM_FIELDS) {
    const raw = el(k).value, v = Number(raw);
    p[k] = raw !== "" && Number.isFinite(v) ? v : DEFAULTS[k];
  }
  p.anilla = el("anilla").value;
  p.emoji = primerEmoji(el("emoji").value);
  p.color = el("color").value || DEFAULTS.color;
  p.colorCorte = el("cutOther").checked ? el("colorCorte").value : null;
  return p;
}

// ---------------------------------------------------------------------
// Selector de emoji
// ---------------------------------------------------------------------

function pintarCategorias() {
  const tabs = el("cat-tabs");
  tabs.replaceChildren();
  CATEGORIAS.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c.nombre;
    b.className = i === categoriaActual ? "active" : "";
    b.addEventListener("click", () => { categoriaActual = i; pintarCategorias(); });
    tabs.append(b);
  });
  const grid = el("emoji-grid");
  grid.replaceChildren();
  const actual = primerEmoji(el("emoji").value);
  for (const em of CATEGORIAS[categoriaActual].emojis) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = em;
    b.title = em;
    if (em === actual) b.className = "sel";
    b.addEventListener("click", () => { el("emoji").value = em; refrescarEmoji(); pintarCategorias(); scheduleGenerate(); });
    grid.append(b);
  }
}

function refrescarEmoji() { el("emoji-big").textContent = primerEmoji(el("emoji").value); }

// ---------------------------------------------------------------------
// Vista previa y descarga
// ---------------------------------------------------------------------

function luminancia(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

downloadBtn.addEventListener("click", () => {
  if (lastSVG) saveBlob(new Blob([lastSVG], { type: "image/svg+xml" }), `${lastName}.svg`);
});

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

let busy = false, pending = false;

async function generate() {
  if (busy) { pending = true; return; }
  busy = true;
  try {
    const p = readParams();
    const fuente = await cargarFuente(el("emojiWeight").value === "700" ? 700 : 400);
    if (!window.ClipperLib) throw new Error("no se cargó la librería de bordes");
    const c = construirLlavero({ emoji: fuente, clipper: window.ClipperLib }, p);
    el("avisos").textContent = c.avisos.join(" ");
    if (c.vacio) {
      holder.replaceChildren();
      el("stats").textContent = "";
      lastSVG = null;
      downloadBtn.disabled = true;
      setStatus(c.avisos.length ? "Prueba con otro emoji." : "Elige un emoji.");
      return;
    }
    const svg = envolverSVG(c.w, c.h, c.inner, p.emoji);
    holder.innerHTML = svg;
    holder.classList.toggle("oscuro", luminancia(p.color) > 0.8 && luminancia(p.colorCorte || p.color) > 0.8);
    el("stats").textContent = `${c.w.toFixed(1)} × ${c.h.toFixed(1)} mm`;
    lastSVG = svg;
    lastName = "llavero-" + (Array.from(p.emoji).map((x) => x.codePointAt(0).toString(16)).join("-"));
    downloadBtn.disabled = false;
    setStatus("Listo. Puedes descargar el SVG.");
  } catch (err) {
    console.error(err);
    setStatus("Error al generar: " + (err?.message || err), true);
  } finally {
    busy = false;
    if (pending) { pending = false; generate(); }
  }
}

let debounce = null;
function scheduleGenerate() { clearTimeout(debounce); debounce = setTimeout(generate, 200); }
function onInput() { syncUI(); scheduleGenerate(); }

for (const k of NUM_FIELDS) el(k).addEventListener("input", onInput);
for (const k of ["anilla", "color", "colorCorte", "cutOther", "emojiWeight"]) {
  el(k).addEventListener("input", onInput);
  el(k).addEventListener("change", onInput);
}
el("emoji").addEventListener("input", () => { refrescarEmoji(); pintarCategorias(); onInput(); });
el("reset-btn").addEventListener("click", () => { applyDefaultsToUI(); onInput(); });

applyDefaultsToUI();
el("emoji").value = DEFAULTS.emoji;
refrescarEmoji();
pintarCategorias();
generate();
