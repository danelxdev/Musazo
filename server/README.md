# Servidor de partidas clasificatorias

Las partidas con amigos van directamente de navegador a navegador (PeerJS). Las **clasificatorias**
necesitan un servidor: aquí se barajan las cartas y se aplican las reglas (nadie puede hacer trampas
desde su navegador), se empareja a la gente por nivel y se lleva el **ranking ELO**.

## Qué hace

- **Cola de emparejamiento**: con 4 jugadores en cola se juega; si alguien espera más de
  `BOT_FILL_MS` (30 s), la mesa se completa con la máquina. Con cuatro personas, las parejas se
  equilibran por rating (el mejor con el peor).
- **Ranking ELO por parejas**: se empieza con 1200. Las 10 primeras partidas mueven más puntos y las
  partidas con máquina en la mesa cuentan la mitad. Divisiones: Bronce, Plata, Oro, Platino y Txapeldun.
- **Si alguien se va o se le corta**, juega la máquina por él y, al volver a entrar, recupera su sitio.
  Abandonar no libra de perder puntos: la partida cuenta igual.
- **Cuentas**: de momento, cada navegador tiene su cuenta (un id y un secreto guardados en él).
  El nombre se cambia al entrar. Para cuentas con Google o Apple y sincronizar entre dispositivos,
  el siguiente paso es Supabase (ver abajo).
- **API**: `GET /api/ranking` (los 100 mejores) y `GET /api/health`.

## Probarlo en tu ordenador

```bash
npm install
npm run server                       # servidor en ws://localhost:8787
VITE_GAME_SERVER=ws://localhost:8787 npm run dev
```

## Ponerlo en internet

Cualquier sitio que ejecute Node 22 o Docker vale. Tres opciones:

### Fly.io (recomendado: tiene disco para el ranking)

```bash
fly launch --dockerfile server/Dockerfile --no-deploy     # elige nombre, p. ej. musazo-servidor
fly volumes create datos --size 1
# En fly.toml:  [mounts] source = "datos", destination = "/data"   y   internal_port = 8080
fly secrets set ALLOWED_ORIGINS=https://danelxdev.github.io
fly deploy
```

La dirección queda como `wss://musazo-servidor.fly.dev`.

### Render

«New → Blueprint» con este repositorio (usa `render.yaml`). En el plan gratuito el servidor se duerme
cuando nadie juega (tarda un poco en despertar) y **el disco no se guarda**: el ranking se perdería en
cada reinicio. Para usarlo de verdad, añade un disco y pon `DATA_DIR` apuntando a él.

### Railway u otro con Docker

`docker build -f server/Dockerfile .` y un volumen montado en `/data`.

## Conectar la web

En GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**

- `VITE_GAME_SERVER` = `wss://tu-servidor` (sin `/ws` al final)

Después vuelve a lanzar el despliegue (pestaña **Actions → Desplegar en GitHub Pages → Run workflow**).
Mientras no esté esa variable, la clasificatoria sale como «Próximamente».

## Variables del servidor

| Variable | Qué es | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto | `8787` |
| `DATA_DIR` | Carpeta donde se guardan los jugadores (`players.json`) | `./data` |
| `ALLOWED_ORIGINS` | Webs que pueden conectarse, separadas por comas | cualquiera |
| `BOT_FILL_MS` | Espera en cola antes de completar con la máquina | `30000` |
| `TIME_SCALE` | Velocidad de las partidas (solo para pruebas) | `1` |

## Siguientes pasos

- **Cuentas de verdad (Supabase)**: cambiar `server/store.ts` por tablas en Supabase y entrar con
  Google o Apple. El resto del servidor no cambia.
- **Temporadas**: guardar el rating al final de cada temporada y volver a acercarlo a 1200.
- **Jugar en pareja con un amigo** en la clasificatoria: una cola para parejas ya hechas.
- **Musazo Plus**: los tapetes y reversos ya tienen un campo `plus` en `src/ui/look.ts` para marcar
  los de pago cuando haya pasarela (Stripe, o las compras de Google Play y la App Store).
