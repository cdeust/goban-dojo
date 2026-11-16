import type { GameRecord, GameResult } from '../domain/game.ts';

/** Restitue les voyelles longues des noms les plus fréquents du corpus (romanisé sans macrons). */
const MACRONS: [RegExp, string][] = [
  [/\bHoninbo\b/g, 'Hon’inbō'],
  [/\bShusaku\b/g, 'Shūsaku'],
  [/\bShuwa\b/g, 'Shūwa'],
  [/\bShuho\b/g, 'Shūho'],
  [/\bJowa\b/g, 'Jōwa'],
  [/\bJosaku\b/g, 'Jōsaku'],
  [/\bOta Yuzo\b/g, 'Ōta Yūzō'],
  [/\bIto Showa\b/g, 'Itō Shōwa'],
  [/\bSendayu\b/g, 'Sendayū'],
  [/\bHoshin\b/g, 'Hōshin'],
  [/\bHosenji\b/g, 'Hōsenji'],
];

export function prettyName(name: string): string {
  let out = name;
  for (const [re, to] of MACRONS) out = out.replace(re, to);
  return out;
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d).replace(/^1 /, '1ᵉʳ ');
}

export const colorName = (c: 'B' | 'W'): string => (c === 'B' ? 'Noir' : 'Blanc');

export function formatResult(r: GameResult): string {
  let s: string;
  switch (r.winner) {
    case 'jigo':
      s = 'Jigo (partie nulle)';
      break;
    case 'unfinished':
      s = 'Partie inachevée';
      break;
    case 'unknown':
      s = 'Résultat inconnu';
      break;
    default:
      s = `${colorName(r.winner)} gagne`;
      if (r.resign) s += ' par abandon';
      else if (r.margin !== undefined) s += ` de ${r.margin} point${r.margin > 1 ? 's' : ''}`;
  }
  return r.note ? `${s} — ${r.note}` : s;
}

/** Issue du point de vue de Shūsaku, pour les listes. */
export function outcomeFor(game: GameRecord): { mark: string; label: string } {
  const w = game.result.winner;
  if (w === 'jigo') return { mark: '＝', label: 'jigo' };
  if (w === 'unfinished') return { mark: '…', label: 'inachevée' };
  if (w === 'unknown') return { mark: '?', label: 'résultat inconnu' };
  return w === game.shusaku
    ? { mark: '○', label: 'victoire de Shūsaku' }
    : { mark: '●', label: 'défaite de Shūsaku' };
}

export function handicapLabel(game: GameRecord): string | undefined {
  return game.handicap > 0 ? `${game.handicap} pierres de handicap` : undefined;
}
