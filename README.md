# musazo

Juego de mus en el navegador: un tapete de fieltro, la baraja española de siempre y partidas de 4 jugadores (tú y tu compañera contra dos rivales controlados por la máquina).

- Mus a 8 reyes, al mejor de 3 juegos de 40 tantos: mus y descartes, Grande, Chica, Pares, Juego/Punto, envites, órdagos y deje.
- Piedras y amarracos sobre el tapete, y el mazo delante del que reparte, como en una mesa de verdad.
- 20 segundos por turno, resumen de cada lance en pantalla y botón para reiniciar la partida.
- Reglas completas con ejemplos animados (botón **Reglas**, arriba a la derecha).
- Sin menús: entras, pulsas **Jugar** y a jugar.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # compilación de producción en dist/
```

Hecho con Vite + TypeScript, sin frameworks.

## Créditos

Las cartas son una obra derivada del arte de **Basquetteur** (Wikimedia Commons) y de su vectorización en
[gjenkins20/spanish-playing-cards-svg](https://github.com/gjenkins20/spanish-playing-cards-svg), con licencia
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.es). Detalles y cambios en
[`public/cards/LICENSE.txt`](public/cards/LICENSE.txt); cómo regenerarlas en [`scripts/cards/`](scripts/cards/README.md).
