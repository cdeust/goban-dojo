import { useMemo } from 'react';
import { pointToHuman, type Board } from '../domain/board.ts';
import {
  buildTimeline,
  decodeMoves,
  decodePoints,
  type GameRecord,
  type Move,
} from '../domain/game.ts';
import { schoolWindow } from '../domain/school.ts';

function SchoolCell({ rowLabel, children }: { rowLabel?: string; children: React.ReactNode }) {
  return (
    <>
      {rowLabel && (
        <span className="school-axis" aria-hidden="true">
          {rowLabel}
        </span>
      )}
      {children}
    </>
  );
}

export function KifuBoard({
  game,
  before,
  anchors,
  candidate,
  choices,
  solutionPoints,
  windowPoints,
  allowOccupied,
  dead,
  seki,
  board,
  resultBoard,
  played,
  onPlay,
  done,
  full,
}: {
  game: GameRecord;
  before: number;
  anchors: readonly number[];
  candidate?: number;
  choices?: readonly number[];
  solutionPoints?: readonly number[];
  windowPoints?: readonly number[];
  allowOccupied?: boolean;
  dead?: readonly number[];
  seki?: readonly number[];
  board: Board;
  resultBoard: Board;
  played: readonly Move[];
  onPlay?: (p: number) => void;
  done?: boolean;
  full: boolean;
}) {
  const timeline = useMemo(
    () => buildTimeline(decodePoints(game.setupBlack), decodeMoves(game.moves)),
    [game],
  );
  const numbers = new Map(
    timeline.stones
      .filter((s) => s.placedAt <= before && before < s.capturedAt)
      .map((s) => [s.point, s.placedAt]),
  );
  const view = full
    ? { x: 0, y: 0, size: 19 }
    : schoolWindow(board, {
        candidate,
        anchors: [
          ...anchors,
          ...(windowPoints ?? []),
          ...played.filter((m) => m.point >= 0).map((m) => m.point),
        ],
      });
  for (const [index, move] of played.entries())
    if (move.point >= 0) numbers.set(move.point, before + index + 1);
  const points = Array.from(
    { length: view.size * view.size },
    (_, i) => (view.y + Math.floor(i / view.size)) * 19 + view.x + (i % view.size),
  );
  const marked = new Set(anchors);
  const solved = new Set(solutionPoints ?? []);
  return (
    <div
      className="school-board"
      role="group"
      aria-label="Position du kifu, goban interactif"
      style={{ gridTemplateColumns: `1.1rem repeat(${view.size}, minmax(0, 1fr))` }}
    >
      <span className="school-axis" aria-hidden="true" />
      {Array.from({ length: view.size }, (_, i) => (
        <span className="school-axis" aria-hidden="true" key={`col-${i}`}>
          {pointToHuman(view.x + i).charAt(0)}
        </span>
      ))}
      {points.map((p) => {
        const color = resultBoard.get(p);
        const number = numbers.get(p);
        const unavailable = !!done || !onPlay || (allowOccupied ? !color : !!color);
        const label = `${pointToHuman(p)}${color ? (color === 'B' ? ', noir' : ', blanc') : ', vide'}${number && color ? `, coup ${number}` : ''}${marked.has(p) ? ', groupe à examiner' : ''}${dead?.includes(p) ? ', groupe convenu mort' : ''}${seki?.includes(p) ? ', groupe marqué en seki' : ''}${solved.has(p) ? ', point de la correction' : ''}`;
        return (
          <SchoolCell
            key={p}
            rowLabel={p % 19 === view.x ? String(19 - Math.floor(p / 19)) : undefined}
          >
            <button
              className="school-point"
              type="button"
              aria-label={label}
              aria-disabled={unavailable}
              tabIndex={-1}
              onClick={() => {
                if (!unavailable) onPlay?.(p);
              }}
            >
              {color && (
                <span
                  className={`school-stone school-stone--${color}`}
                  data-marked={marked.has(p)}
                  data-dead={dead?.includes(p)}
                  data-seki={seki?.includes(p)}
                >
                  {number || ''}
                </span>
              )}
              {!color && solved.has(p) && (
                <span className="school-solution-point" aria-hidden="true" />
              )}
              {!color && !solved.has(p) && (candidate === p || choices?.includes(p)) && (
                <span className="school-candidate" aria-hidden="true">
                  {candidate === p ? '?' : String.fromCharCode(65 + (choices?.indexOf(p) ?? 0))}
                </span>
              )}
            </button>
          </SchoolCell>
        );
      })}
    </div>
  );
}
