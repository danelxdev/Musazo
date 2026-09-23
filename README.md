# musazo

Juego de mus en el navegador: un tapete de fieltro, la baraja española de siempre y partidas de 4 jugadores (tú y tu compañera contra dos rivales controlados por la máquina).

- Mus a 8 reyes, al mejor de 3 juegos de 40 tantos: mus y descartes, Grande, Chica, Pares, Juego/Punto, envites, órdagos y deje.
- Piedras y amarracos sobre el tapete, y el mazo delante del que reparte, como en una mesa de verdad.
- 20 segundos por turno, resumen de cada lance en pantalla y botón para reiniciar la partida.
- Reglas completas con ejemplos animados (botón **Reglas**, arriba a la derecha).
- Sin menús: entras, pulsas **Jugar** y a jugar.

### Contador de tantos

Para cuando jugáis con cartas de verdad y no hay piedras a mano (botón **Contador**, o directamente en `/#contador`):

- Marcador por pareja con piedras y amarracos: tocar el número suma 1, y hay botones de −1 / +1 / +2 / +5. El nombre de cada pareja se cambia tocándolo.
- Lances de la mano (Grande, Chica, Pares, Juego/Punto): tocar el número del lance suma 2, con −1 / +1 / +5 al lado; al final se mandan con una flecha a la pareja que gana cada lance.
- **Órdago** manteniendo pulsado: si llegas al final, el juego es para esa pareja.
- Juegos y partidas (a 30 o 40, a 1, 3 o 5 juegos), deshacer (también Ctrl+Z), reglas a mano y estadísticas: tantos por lance, juegos y registro de jugadas.
- En el móvil se ve en horizontal (si está en vertical, el contador se gira; se puede desactivar en Ajustes).
- Se guarda en el navegador, mantiene la pantalla encendida, vibra al tocar y funciona sin conexión; se puede instalar en el móvil con acceso directo al contador.

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
