/**
 * Ranking ELO por parejas: cada pareja vale la media de sus dos jugadores
 * y todos los de la pareja ganan o pierden lo mismo.
 */
export const START_RATING = 1200;
/** Rating fijo de la máquina cuando rellena un sitio. */
export const BOT_RATING = 1250;

export const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

/** Cuánto sube (o baja) cada jugador de una pareja. */
export function teamDelta(own: number[], rivals: number[], won: boolean, k: number): number {
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.round(k * ((won ? 1 : 0) - expected(avg(own), avg(rivals))));
}

/** K: menor si en la mesa había máquina, mayor en las primeras partidas de un jugador. */
export function kFactor(gamesPlayed: number, withBots: boolean) {
  const base = gamesPlayed < 10 ? 40 : 24;
  return withBots ? Math.round(base / 2) : base;
}

/** Divisiones por puntos, para ponerle nombre al nivel. */
export const DIVISIONS = [
  { min: 0, name: 'Bronce' },
  { min: 1150, name: 'Plata' },
  { min: 1300, name: 'Oro' },
  { min: 1450, name: 'Platino' },
  { min: 1600, name: 'Txapeldun' },
];

export const divisionOf = (rating: number) => [...DIVISIONS].reverse().find((d) => rating >= d.min)!.name;
