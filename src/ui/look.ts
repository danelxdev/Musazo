/**
 * Aspecto de la mesa: color del tapete y del reverso de las cartas.
 * Cada opción puede marcarse como `plus` el día que haya cuenta Plus (de momento todas son libres).
 */
export interface LookOption {
  id: string;
  name: string;
  color: string;
  plus?: boolean;
}

export const FELTS: LookOption[] = [
  { id: 'verde', name: 'Verde', color: '#1d6538' },
  { id: 'azul', name: 'Azul', color: '#1f4f86' },
  { id: 'granate', name: 'Granate', color: '#7a2130' },
  { id: 'txoko', name: 'Madera', color: '#7a4a24' },
  { id: 'noche', name: 'Noche', color: '#2c3440' },
];

export const BACKS: LookOption[] = [
  { id: 'azul', name: 'Azul', color: '#172440' },
  { id: 'rojo', name: 'Rojo', color: '#6d1a22' },
  { id: 'verde', name: 'Verde', color: '#123f2a' },
  { id: 'negro', name: 'Negro', color: '#15181d' },
];

export interface Look {
  felt: string;
  back: string;
}

const KEY = 'musazo.look';

export function savedLook(): Look {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Look> | null;
    return {
      felt: FELTS.some((f) => f.id === x?.felt) ? x!.felt! : 'verde',
      back: BACKS.some((b) => b.id === x?.back) ? x!.back! : 'azul',
    };
  } catch {
    return { felt: 'verde', back: 'azul' };
  }
}

export function saveLook(l: Look) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* sin almacenamiento */
  }
}

/** Aplica el aspecto a toda la página (tapete del juego y reverso de las cartas). */
export function applyLook(l: Look) {
  const felt = FELTS.find((f) => f.id === l.felt) ?? FELTS[0];
  const back = BACKS.find((b) => b.id === l.back) ?? BACKS[0];
  const root = document.documentElement;
  root.dataset.felt = felt.id;
  root.style.setProperty('--felt-tint', felt.color);
  root.style.setProperty('--back', back.color);
}
