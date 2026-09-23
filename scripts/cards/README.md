# Generación de las cartas

Las cartas de `public/cards/` se generan a partir de los SVG de Basquetteur (Wikimedia Commons, CC BY-SA 3.0)
y de los caballos vectorizados de `gjenkins20/spanish-playing-cards-svg`. Ver `public/cards/LICENSE.txt`.

1. Descarga `Baraja_española.svg` como `deck.svg`, `Baraja_española_cartas_blancas_sota_caballo_rey.svg` como `deck2.svg`
   y `card_{coins,cups,swords,clubs}_11.svg` como `gj_{coins,cups,swords,clubs}_11.svg` en una carpeta de trabajo.
2. Extrae las cartas con Chrome sin interfaz:
   `node analyze.mjs file:///ruta/deck.svg extract3.js e1.json` y lo mismo con `deck2.svg` → `e2.json`.
3. Genera los SVG finales: `node build-cards.cjs`.
