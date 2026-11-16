import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { projectPoint, type ScreenPoint } from '../state/projection.ts';
import { useStore, type Impact } from '../state/store.ts';

interface Burst {
  impact: Impact;
  at: ScreenPoint;
}

/** Angles et longueurs des traits, fixés une fois : même dessin d'un impact à l'autre. */
const LINES = Array.from({ length: 32 }, (_, i) => {
  const jitter = ((i * 7919) % 13) / 13;
  return {
    angle: (i / 32) * 360 + jitter * 6,
    length: 0.55 + jitter * 0.45,
    width: 0.5 + ((i * 31) % 5) / 4,
  };
});

/**
 * Lignes de force à l'impact d'un coup qui menace, capture, ou marque le récit : des traits
 * d'encre rayonnent de la pierre, à la manière d'une case de manga. Purement décoratif.
 */
export function ImpactLines() {
  const impact = useStore((s) => s.impact);
  const effects = useStore((s) => s.effects);
  const [burst, setBurst] = useState<Burst | null>(null);

  useEffect(() => {
    if (!impact || !effects || impact.kind === 'coup') return;
    const at = projectPoint(impact.point);
    if (!at) return;
    setBurst({ impact, at });
    const id = window.setTimeout(() => setBurst(null), impact.kind === 'moment' ? 2600 : 700);
    return () => window.clearTimeout(id);
  }, [impact, effects]);

  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.impact.seq}
          className={`impact impact--${burst.impact.kind}`}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <svg
            className="impact__lines"
            style={{ left: burst.at.x, top: burst.at.y }}
            viewBox="-100 -100 200 200"
          >
            {LINES.map((l, i) => {
              // Les traits partent du bord de la pierre et filent vers l'extérieur.
              const reach = burst.impact.kind === 'moment' ? 100 : 62;
              const start = 9;
              return (
                <motion.line
                  key={i}
                  x1={0}
                  y1={-start}
                  x2={0}
                  y2={-start - reach * l.length}
                  strokeWidth={l.width}
                  transform={`rotate(${l.angle})`}
                  initial={{ pathLength: 0, opacity: 0.9 }}
                  animate={{ pathLength: 1, opacity: 0 }}
                  transition={{
                    duration: burst.impact.kind === 'moment' ? 1.5 : 0.5,
                    ease: [0.1, 0.7, 0.2, 1],
                    delay: (i % 4) * 0.012,
                  }}
                />
              );
            })}
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
