import type { CSSProperties } from 'react';
import { pointToHuman } from '../domain/board.ts';
import { useStore } from '../state/store.ts';
import {
  parseTacticalCueKey,
  type Cue,
  TACTICAL_CUES,
  tacticalCueKey,
} from '../state/tacticalCues.ts';

function LegendDot({ kind }: { kind: Cue }) {
  return (
    <span
      className="legend__dot"
      style={{ '--cue-color': TACTICAL_CUES[kind].color } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export function TacticalLegend() {
  const key = useStore(tacticalCueKey);
  if (!key) return null;
  const points = new Map<Cue, number[]>();
  for (const { kind, point } of parseTacticalCueKey(key)) {
    const group = points.get(kind);
    if (group) group.push(point);
    else points.set(kind, [point]);
  }
  return (
    <ul className="legend legend--board" role="list" aria-label="Repères tactiques du goban">
      {[...points].map(([kind, marks]) => (
        <li key={kind} title={TACTICAL_CUES[kind].detail}>
          <LegendDot kind={kind} />
          {TACTICAL_CUES[kind].label}
          <span className="sr-only">
            {': ' + marks.map(pointToHuman).join(', ')}. {TACTICAL_CUES[kind].detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TacticalLegendHelp() {
  const kinds = Object.keys(TACTICAL_CUES) as Cue[];
  return (
    <ul className="legend">
      {kinds.map((kind) => (
        <li key={kind}>
          <LegendDot kind={kind} /> <b>{TACTICAL_CUES[kind].label}</b> :{' '}
          {TACTICAL_CUES[kind].detail}
        </li>
      ))}
    </ul>
  );
}
