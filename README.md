# musazo

Juego de mus en el navegador: un tapete de fieltro, la baraja española de siempre y partidas de 4 jugadores, contra la máquina o con amigos.

- Mus a 8 reyes, al mejor de 3 juegos de 40 tantos: mus y descartes, Grande, Chica, Pares, Juego/Punto, envites, órdagos y deje.
- Piedras y amarracos sobre el tapete, y el mazo delante del que reparte, como en una mesa de verdad.
- 20 segundos por turno, resumen de cada lance en pantalla, botón para reiniciar la partida y flecha para salir a la pantalla principal.
- Reglas completas con ejemplos animados (botón **Reglas**, arriba a la derecha).
- Se ve bien en cualquier pantalla: ordenador, tablet y móvil, tanto en vertical como en horizontal.

### Lo que hay además

- **Reglas a elegir** (engranaje, arriba): a 8 o a 4 reyes, a 30 o a 40 tantos, y a un juego, al mejor de 3 o al mejor de 5.
- **Mesa a tu gusto**: tapete verde, azul, granate, madera o noche, y reverso de las cartas azul, rojo, verde o negro.
- **Mi perfil**: tu nombre y tus estadísticas (partidas y juegos ganados, rachas, órdagos y cada lance), guardadas en el navegador.
- **Chat rápido y señas**: toca tu placa («Tú») para mandar una frase a la mesa o una seña a tu pareja. Las señas solo las ve tu pareja… salvo que un rival te pille (una vez de cada cuatro). Maite también te hace señas cuando lleva algo, y a veces pillarás las de los rivales.
- **Partidas clasificatorias con ranking ELO** (necesitan el servidor de `server/`, ver [server/README.md](server/README.md)): emparejamiento por nivel, divisiones de Bronce a Txapeldun y tabla con los mejores. Sin servidor configurado aparecen como «Próximamente».

### Modos de juego

- **Contra la máquina**: tú y Maite contra Iñaki y Koldo, sin conexión.
- **Multijugador** (invitas a una persona con un enlace o un código de 5 letras):
  - **Solo**: tú contra tu amigo, cada uno con un compañero de la máquina.
  - **En equipo**: tu amigo y tú, de pareja contra la máquina.
- **Personalizado**: hasta 4 amigos. El anfitrión coloca a cada uno en su sitio (los de enfrente son pareja) y los huecos los juega la máquina.

La partida se juega en el navegador del anfitrión y los demás se conectan directamente a él (WebRTC con [PeerJS](https://peerjs.com/)), así que no hace falta servidor propio: la web sigue siendo estática. Cada uno ve la mesa desde su sitio y las cartas de los demás no llegan a su navegador hasta que se enseñan. Si alguien se desconecta, la máquina juega por él y, al volver a abrir el enlace, recupera su sitio.

Por defecto se usa el servidor de enlace público y gratuito de PeerJS; se puede usar otro con `VITE_PEER_HOST`, `VITE_PEER_PORT` y `VITE_PEER_PATH` al compilar.

### Contador de tantos

Para cuando jugáis con cartas de verdad y no hay piedras a mano (botón **Contador**, o directamente en `/#contador`):

- Marcador por pareja con piedras y amarracos: tocar el número suma 1, y hay botones de −1 / +1 / +2 / +5. El nombre de cada pareja se cambia tocándolo.
- Lances de la mano (Grande, Chica, Pares, Juego/Punto): tocar el número del lance suma 2, con −1 / +1 / +5 al lado; al final se mandan con una flecha a la pareja que gana cada lance.
- **Órdago** manteniendo pulsado: si llegas al final, el juego es para esa pareja.
- Juegos y partidas (a 30 o 40, a 1, 3 o 5 juegos), deshacer (también Ctrl+Z), reglas a mano y estadísticas: tantos por lance, juegos y registro de jugadas.
- En el móvil se ve en horizontal (si está en vertical, el contador se gira; se puede desactivar en Ajustes).
- Se guarda en el navegador, mantiene la pantalla encendida, vibra al tocar y funciona sin conexión.
- Sin las barras del navegador: en Android, botón de pantalla completa (o «Instalar» en Ajustes); en iPhone (Safari o Chrome), Compartir → «Añadir a pantalla de inicio», con instrucciones en el propio botón. Instalada, se abre donde se dejó.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # compilación de producción en dist/
npm run server   # servidor de partidas clasificatorias (ws://localhost:8787)
```

Para probar la clasificatoria en local: `VITE_GAME_SERVER=ws://localhost:8787 npm run dev` con `npm run server` en otra terminal.

Hecho con Vite + TypeScript, sin frameworks. El servidor de clasificatorias es Node con WebSockets y usa el mismo motor del juego que la web.

## Créditos

Las cartas son una obra derivada del arte de **Basquetteur** (Wikimedia Commons) y de su vectorización en
[gjenkins20/spanish-playing-cards-svg](https://github.com/gjenkins20/spanish-playing-cards-svg), con licencia
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.es). Detalles y cambios en
[`public/cards/LICENSE.txt`](public/cards/LICENSE.txt); cómo regenerarlas en [`scripts/cards/`](scripts/cards/README.md).
