import { parseSgfDate } from '../domain/importSgf.ts';
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
  [/\bShowa\b/g, 'Shōwa'],
  [/\bSendayu\b/g, 'Sendayū'],
  [/\bHoshin\b/g, 'Hōshin'],
  [/\bHosenji\b/g, 'Hōsenji'],
  [/\bTenpo\b/g, 'Tenpō'],
  [/\bKoka\b/g, 'Kōka'],
  [/\bBunkyu\b/g, 'Bunkyū'],
  [/\bIto\b/g, 'Itō'],
  [/\bMatsujiro\b/g, 'Matsujirō'],
];

export function prettyName(name: string): string {
  let out = name;
  for (const [re, to] of MACRONS) out = out.replace(re, to);
  return out;
}

const DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const DATES = new Intl.ListFormat('fr-FR', { type: 'conjunction' });

/** DT peut abréger année et mois d’après la date précédente (FF[4], propriété DT). */
export function formatDate(source: string): string {
  const labels: string[] = [];
  let previous = '';
  for (let date of source.split(',')) {
    if (previous.length > 4) {
      if (/^\d{2}-\d{2}$/.test(date)) date = previous.slice(0, 5) + date;
      else if (/^\d{2}$/.test(date)) date = previous.slice(0, -2) + date;
    }
    const instant = parseSgfDate(date);
    if (!instant) return source;
    previous = date;
    const [year, month, day] = date.split('-');
    if (!month) {
      labels.push(date);
      continue;
    }
    const label = (day ? DAY : MONTH)
      .formatToParts(instant)
      .map((part) => (part.type === 'year' ? String(Number(year)) : part.value))
      .join('');
    labels.push(label.replace(/^1 /, '1ᵉʳ '));
  }
  return labels.length === 1 ? labels[0]! : DATES.format(labels);
}

/** Instant (ms) du début d'une date éventuellement partielle : le milieu de la période inconnue. */
export function dateToTime(iso: string): number {
  const [y, m, d] = iso.split('-');
  return new Date(`${y}-${m ?? '07'}-${d ?? (m ? '15' : '01')}T00:00:00Z`).getTime();
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
  if (game.imported) return { mark: w === 'B' ? '●' : '○', label: formatResult(game.result) };
  return w === game.shusaku
    ? { mark: '○', label: 'victoire de Shūsaku' }
    : { mark: '●', label: 'défaite de Shūsaku' };
}

export function handicapLabel(game: GameRecord): string | undefined {
  return game.handicap > 0 ? `${game.handicap} pierres de handicap` : game.regime;
}

/** Naissance de Shūsaku : 6 juin 1829 (sources citées dans chapters.ts). */
const BIRTH = { year: 1829, month: 6, day: 6 } as const;

/**
 * Âge de Shūsaku à une date AAAA-MM-JJ, AAAA-MM ou AAAA. Quand la date est partielle, l'âge est
 * celui du milieu de la période et `approximate` est vrai s'il peut différer d'un an.
 */
export function ageAt(iso: string): { years: number; approximate: boolean } {
  const [y, m, d] = iso.split('-').map(Number);
  const year = y ?? BIRTH.year;
  const month = m ?? 7;
  const day = d ?? 15;
  const before = month < BIRTH.month || (month === BIRTH.month && day < BIRTH.day);
  return {
    years: year - BIRTH.year - (before ? 1 : 0),
    approximate: m === undefined || (d === undefined && month === BIRTH.month),
  };
}

export function ageLabel(iso: string): string {
  const { years, approximate } = ageAt(iso);
  return `${approximate ? 'vers ' : ''}${years} ans`;
}

export function formatLead(value: number) {
  const points = Math.round(Math.abs(value));
  return points === 0
    ? 'Équilibre estimé'
    : `${value > 0 ? 'Noir' : 'Blanc'} +${points} pts estimés`;
}
