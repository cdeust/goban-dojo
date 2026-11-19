import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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

const ARCS = [
  'M 7 -4 L 24 -14 L 21 -23 L 48 -30 L 42 -42 L 72 -55 M 48 -30 L 68 -30 L 83 -44',
  'M -6 4 L -23 20 L -34 17 L -46 44 L -60 42 L -77 67 M -46 44 L -35 57 L -41 76',
  'M -4 -7 L -13 -23 L -29 -29 L -26 -45 L -48 -67 M -29 -29 L -55 -35 L -69 -49',
  'M 7 5 L 24 15 L 31 31 L 51 29 L 70 51 M 31 31 L 36 52 L 51 67',
];

/**
 * Lignes de force à l'impact d'un coup qui menace, capture, ou marque le récit : des traits
 * d'encre rayonnent de la pierre, à la manière d'une case de manga. Purement décoratif.
 */
export function ImpactLines() {
  const impact = useStore((s) => s.impact);
  const effects = useStore((s) => s.effects);
  const reduced = useReducedMotion();
  const [burst, setBurst] = useState<Burst | null>(null);

  useEffect(() => {
    if (!impact || !effects || reduced || impact.kind === 'coup') return;
    const at = projectPoint(impact.point);
    if (!at) return;
    setBurst({ impact, at });
    const id = window.setTimeout(
      () => setBurst(null),
      impact.tactical || impact.kind === 'moment' || impact.kind === 'initiative' ? 1700 : 700,
    );
    return () => window.clearTimeout(id);
  }, [impact, effects, reduced]);

  if (!effects || reduced) return null;
  const lightning =
    burst?.impact.tactical ||
    burst?.impact.kind === 'initiative' ||
    burst?.impact.kind === 'menace' ||
    burst?.impact.kind === 'piege';

  return (
    <AnimatePresence>
      {burst && burst.impact.seq === impact?.seq && (
        <motion.div
          key={burst.impact.seq}
          className={`impact impact--${burst.impact.tactical ? 'initiative' : burst.impact.kind}`}
          data-kind={burst.impact.kind}
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
            {lightning ? (
              <motion.g
                className="impact__arcs"
                initial={{ opacity: 1, scale: 0.75 }}
                animate={{ opacity: 0, scale: 1.12 }}
                transition={{
                  duration:
                    burst.impact.tactical || burst.impact.kind === 'initiative' ? 1.25 : 0.58,
                  ease: 'easeOut',
                }}
              >
                {ARCS.map((arc) => (
                  <path key={arc} d={arc} />
                ))}
              </motion.g>
            ) : (
              LINES.map((l, i) => {
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
              })
            )}
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
