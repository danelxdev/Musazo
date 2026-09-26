import type { Action, Request, State } from './engine';

const validAmount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 2 && n <= 30;

/** Comprueba que una jugada que llega por la red vale para lo que se ha pedido. */
export function validAction(req: Request, a: Action | null | undefined, state: State, seat: number): boolean {
  if (!a || typeof a !== 'object') return false;
  switch (req.type) {
    case 'mus': return a.kind === 'mus' || a.kind === 'corto';
    case 'discard': {
      if (a.kind !== 'discard' || !Array.isArray(a.ids) || a.ids.length === 0 || a.ids.length > 4) return false;
      const own = new Set(state.hands[seat].map((c) => c.id));
      return a.ids.every((id) => own.has(id));
    }
    case 'open': return a.kind === 'paso' || a.kind === 'ordago' || (a.kind === 'envido' && validAmount(a.n));
    case 'respond':
      return a.kind === 'quiero' || a.kind === 'noquiero'
        || (!req.bet.ordago && (a.kind === 'ordago' || (a.kind === 'envido' && validAmount(a.n))));
    case 'continue': return a.kind === 'continue';
  }
}
