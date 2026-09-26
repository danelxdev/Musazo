import type { State } from './engine';

/**
 * Estadísticas del jugador, guardadas en el navegador. Se apuntan al terminar cada mano
 * (con la mesa vista desde su sitio: la pareja 0 es siempre la suya).
 */
export type LanceKey = 'grande' | 'chica' | 'pares' | 'juego';
export type StatsMode = 'maquina' | 'amigos';

interface WL {
  jugados: number;
  ganados: number;
}

export interface Stats {
  v: 1;
  partidas: WL;
  juegos: WL;
  manos: number;
  lances: Record<LanceKey, WL>;
  ordagos: WL;
  tantos: { favor: number; contra: number };
  racha: number;
  mejorRacha: number;
  modos: Record<StatsMode, WL>;
  desde: number;
}

const wl = (): WL => ({ jugados: 0, ganados: 0 });

export function emptyStats(): Stats {
  return {
    v: 1,
    partidas: wl(),
    juegos: wl(),
    manos: 0,
    lances: { grande: wl(), chica: wl(), pares: wl(), juego: wl() },
    ordagos: wl(),
    tantos: { favor: 0, contra: 0 },
    racha: 0,
    mejorRacha: 0,
    modos: { maquina: wl(), amigos: wl() },
    desde: Date.now(),
  };
}

const KEY = 'musazo.stats';

export function loadStats(): Stats {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stats | null;
    if (x && x.v === 1 && x.partidas && x.lances) return { ...emptyStats(), ...x };
  } catch {
    /* estropeado: se empieza de cero */
  }
  return emptyStats();
}

function save(s: Stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento */
  }
}

export function resetStats() {
  save(emptyStats());
}

const LANCE_OF: Record<string, LanceKey> = { Grande: 'grande', Chica: 'chica', Pares: 'pares', Juego: 'juego', Punto: 'juego' };

/** Apunta manos, juegos y partidas según van terminando (sin contar dos veces lo mismo). */
export class StatsRecorder {
  private handKey = '';
  private gameKey = '';

  /** Se llama cuando la mesa pide «seguir»: ha terminado una mano, un juego o la partida. */
  record(s: State, mode: StatsMode) {
    const st = loadStats();
    let changed = false;
    const hk = `${s.handNo}`;
    if (s.summary.length && hk !== this.handKey) {
      this.handKey = hk;
      changed = true;
      st.manos++;
      for (const l of s.summary) {
        if (l.team === null) continue;
        if (l.team === 0) st.tantos.favor += l.points;
        else st.tantos.contra += l.points;
        if (l.label.startsWith('Órdago')) {
          st.ordagos.jugados++;
          if (l.team === 0) st.ordagos.ganados++;
          continue;
        }
        const k = LANCE_OF[l.label];
        if (!k) continue;
        st.lances[k].jugados++;
        if (l.team === 0) st.lances[k].ganados++;
      }
    }
    if (s.phase === 'gameover' && s.winner !== null) {
      const gk = `${s.handNo}:${s.games.join('-')}`;
      if (gk !== this.gameKey) {
        this.gameKey = gk;
        changed = true;
        st.juegos.jugados++;
        if (s.winner === 0) st.juegos.ganados++;
        if (s.matchWinner !== null) {
          const won = s.matchWinner === 0;
          st.partidas.jugados++;
          st.modos[mode].jugados++;
          if (won) {
            st.partidas.ganados++;
            st.modos[mode].ganados++;
            st.racha = Math.max(1, st.racha + 1);
            st.mejorRacha = Math.max(st.mejorRacha, st.racha);
          } else {
            st.racha = 0;
          }
        }
      }
    }
    if (changed) save(st);
  }
}
