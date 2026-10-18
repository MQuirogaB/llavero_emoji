# Llavero de emoji · SVG para láser

Elige un emoji y descarga un SVG para láser: el emoji se **graba** (negro) y alrededor lleva un **borde de corte** (rojo) que lo envuelve, con una **anilla** opcional para llavero. Todo ocurre en el navegador.

- Emoji del selector o pegado (fuente Noto Emoji, vectorial), con trazo fino o grueso y tamaño en mm.
- Borde = silueta del emoji + margen (con «Unir partes» para cerrar huecos y quedar en una sola pieza).
- Anilla en 6 posiciones, con diámetro del agujero y grosor de madera.
- Colores configurables.

## SVG
Medidas en mm, sin `<text>` ni transformaciones. Grupo `grabado` (relleno, id `figura-emoji`) y grupo `corte` (línea de 0,1 mm, ids `contorno` y `agujero`).

## Desarrollo
```
npm ci
npm test
```
Publicación: GitHub Pages → rama `main`, carpeta `/docs`.

Emojis: Noto Emoji (SIL OFL). Bordes: ClipperLib 6.4.2 de Angus Johnson (licencia Boost), incluida en `docs/vendor`.
