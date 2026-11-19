import { AnimatePresence, motion } from 'motion/react';
import { PASS } from '../domain/board.ts';
import { colorName } from '../story/format.ts';
import { momentFor } from '../story/chapters.ts';
import { reflectionsOf } from '../story/reflections.ts';
import { timelineOf, useCurrentGame, useStore } from '../state/store.ts';

/** Légende des instants remarquables, et annonce des passes (qui ne posent aucune pierre). */
export function MomentCaption() {
  const game = useCurrentGame();
  const move = useStore((s) => s.move);
  const mode = useStore((s) => s.mode);
  // Les modes interactifs occupent cet emplacement, et une légende y trahirait le coup à deviner.
  if (!game || mode !== 'lecture') return null;
  const moment = momentFor(game, move);
  const scenes = reflectionsOf(game);
  const preparation = scenes.find(({ after, sessionBreak }) => after === move && !sessionBreak);
  const scene =
    preparation ??
    (moment ? scenes.find(({ after }) => after === move || after === move - 1) : undefined);
  const title = preparation ? `Avant le coup ${move + 1}` : moment?.title;
  const last = move > 0 ? timelineOf(game).moves[move - 1] : undefined;
  const pass = last?.point === PASS ? `${colorName(last.color)} passe.` : null;
  return (
    <AnimatePresence>
      {(title || pass) && (
        <motion.aside
          key={title ? `${game.id}:${move}` : 'pass'}
          className="moment"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {title ? (
            <>
              <h2 className="moment__title">{title}</h2>
              <p>{preparation?.question ?? moment?.text}</p>
              {scene && (
                <button
                  type="button"
                  className="chip moment__reflection"
                  onClick={() => useStore.getState().showReflection(scene.after)}
                >
                  Examiner cette position
                </button>
              )}
            </>
          ) : (
            <p>{pass}</p>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
