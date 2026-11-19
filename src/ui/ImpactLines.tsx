import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { PASS, SIZE } from '../domain/board.ts';
import { projectPoint } from '../state/projection.ts';
import { useStore } from '../state/store.ts';

/** Quatre traits suivent la rangée et la colonne du coup jusque sur les intersections. */
export function ImpactLines() {
  const impact = useStore((s) => s.impact);
  const effects = useStore((s) => s.effects);
  const reduced = useReducedMotion();
  const shape = useRef<SVGPathElement>(null);
  const visible = effects && !reduced && impact && impact.kind !== 'coup' && impact.point !== PASS;

  useEffect(() => {
    const path = shape.current;
    if (!path || !visible) return;
    const { point, kind, tactical } = impact;
    const col = point % SIZE;
    const row = Math.floor(point / SIZE);
    const reach = tactical || kind === 'initiative' ? 5 : 3;
    const limit = SIZE - 1;
    const ends = [
      row * SIZE + Math.max(0, col - reach),
      row * SIZE + Math.min(limit, col + reach),
      Math.max(0, row - reach) * SIZE + col,
      Math.min(limit, row + reach) * SIZE + col,
    ].filter((end) => end !== point);

    let frame = 0;
    let previous = '';
    const started = performance.now();
    function update(now: number) {
      const centre = projectPoint(point, true);
      const rays = centre
        ? ends
            .flatMap((end) => {
              const tip = projectPoint(end, true);
              if (!tip) return [];
              // Laisser le corps de la pierre au centre visible.
              const dx = tip.x - centre.x;
              const dy = tip.y - centre.y;
              const gap = Math.min(0.4, centre.size / 2 / Math.hypot(dx, dy));
              return ['M', centre.x + dx * gap, centre.y + dy * gap, 'L', tip.x, tip.y].join(' ');
            })
            .join(' ')
        : '';
      if (rays !== previous) {
        path!.setAttribute('d', rays);
        previous = rays;
      }
      // Maintenir la projection sur la grille si la caméra ou la fenêtre bouge.
      if (now - started < 1250) frame = window.requestAnimationFrame(update);
    }
    update(started);
    return () => window.cancelAnimationFrame(frame);
  }, [impact, visible]);

  if (!visible) return null;
  return (
    <motion.svg
      key={impact.seq}
      className={'impact impact--' + (impact.tactical ? 'initiative' : impact.kind)}
      aria-hidden="true"
      initial={{ opacity: 0.96 }}
      animate={{ opacity: 0 }}
      transition={{
        duration: impact.tactical || impact.kind === 'initiative' ? 1.2 : 0.7,
        ease: 'easeOut',
      }}
    >
      <g className="impact__arcs">
        <path ref={shape} />
      </g>
    </motion.svg>
  );
}
