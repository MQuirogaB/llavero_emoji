import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import opentype from "opentype.js";
import { construirLlavero, envolverSVG, primerEmoji, ANILLAS } from "../docs/svg.js";

const C = createRequire(import.meta.url)("clipper-lib");
const b = fs.readFileSync(new URL("../docs/fonts/noto-emoji-400.ttf", import.meta.url));
const emoji = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const ctx = { emoji, clipper: C };
const sinNaN = (s) => assert.ok(!/NaN|undefined|Infinity/.test(s), "valores raros en el SVG");

assert.equal(primerEmoji("  🐢x"), "🐢");
assert.equal(primerEmoji(""), "");

// vacío / no disponible
assert.ok(construirLlavero(ctx, { emoji: "" }).vacio);
assert.ok(construirLlavero(ctx, { emoji: "Ω☃︎".slice(0, 1) + "" }).avisos.length >= 0);

// varios emojis × todas las anillas: una pieza, dentro de la caja, agujero fuera del emoji y dentro del borde
for (const e of ["🐢", "🍉", "🐱", "🦋", "🌲", "👍", "❤", "⭐", "🏠"]) {
  for (const a of ANILLAS) {
    const r = construirLlavero(ctx, { emoji: e, anilla: a });
    sinNaN(r.inner);
    assert.ok(r.w > 0 && r.h > 0, `${e}/${a}: tamaño`);
    assert.equal(r.piezas, 1, `${e}/${a}: una sola pieza (${r.avisos.join(" ")})`);
    assert.ok(!r.avisos.some((x) => /toca el emoji/.test(x)), `${e}/${a}: ${r.avisos}`);
    for (const pl of r.borde) for (const [x, y] of pl) assert.ok(x >= -1e-3 && x <= r.w + 1e-3 && y >= -1e-3 && y <= r.h + 1e-3, `${e}/${a}: punto fuera`);
    assert.equal(!!r.agujero, a !== "none", `${e}/${a}: agujero`);
    assert.equal((r.inner.match(/id="agujero"/g) || []).length, a === "none" ? 0 : 1);
    if (r.agujero) {
      const { x, y, r: rr } = r.agujero;
      assert.ok(x - rr >= -1e-3 && x + rr <= r.w + 1e-3 && y - rr >= -1e-3 && y + rr <= r.h + 1e-3, `${e}/${a}: agujero dentro`);
    }
  }
}

// el tamaño del emoji manda y el margen engorda el borde
const A = construirLlavero(ctx, { emoji: "🐢", anilla: "none", emojiSize: 40, margin: 3, union: 0 });
const B = construirLlavero(ctx, { emoji: "🐢", anilla: "none", emojiSize: 40, margin: 6, union: 0 });
assert.ok(Math.abs(B.w - A.w - 6) < 0.3, `margen: ${A.w} -> ${B.w}`);
assert.ok(A.w >= 40 + 5 && A.w <= 40 + 6.5, `ancho ${A.w}`);

// colores y estructura
const s = envolverSVG(A.w, A.h, A.inner, "🐢");
assert.match(s, /<g id="grabado" fill="#000000"/);
assert.match(s, /<g id="corte" fill="none" stroke="#ff0000" stroke-width="0.1"/);
assert.ok(!/<text|transform=/.test(s));
const U = construirLlavero(ctx, { emoji: "🐢", colorCorte: null, color: "#112233" });
assert.match(U.inner, /stroke="#112233"/);

console.log("ok");
