import { AnimatePresence, motion } from 'motion/react';
import { unlockAudio } from '../replay/sound.ts';
import { useStore } from '../state/store.ts';

const rise = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0, transition: { duration: 1.1, ease: [0.2, 0.7, 0.2, 1] as const } },
};

/** Écran d'ouverture : le titre, puis l'entrée dans le récit. */
export function Intro() {
  const entered = useStore((s) => s.entered);
  const status = useStore((s) => s.status);
  const dataset = useStore((s) => s.dataset);
  const enter = useStore((s) => s.enter);
  const games = dataset?.games.length ?? 0;
  const moves = dataset?.games.reduce((sum, g) => sum + g.moves.length / 3, 0) ?? 0;

  return (
    <AnimatePresence>
      {!entered && (
        <motion.section
          className="intro"
          aria-labelledby="intro-title"
          initial="hidden"
          animate="shown"
          exit={{ opacity: 0, transition: { duration: 1.2, ease: 'easeInOut' } }}
          variants={{ shown: { transition: { staggerChildren: 0.22, delayChildren: 0.3 } } }}
        >
          <motion.p className="intro__kanji" lang="ja" aria-hidden="true" variants={rise}>
            本因坊秀策
          </motion.p>
          <motion.h1 id="intro-title" className="intro__title" variants={rise}>
            Hon’inbō Shūsaku
          </motion.h1>
          <motion.p className="intro__dates" variants={rise}>
            1829 — 1862
          </motion.p>
          <motion.p className="intro__lede" variants={rise}>
            Trente-trois ans de vie, dix-neuf victoires sans défaite devant le shogun, et une
            ouverture qui porta son nom pendant un siècle. Voici ses parties, coup après coup, de
            l’enfant d’Innoshima au saint du go.
          </motion.p>
          <motion.div variants={rise}>
            <button
              type="button"
              className="intro__enter"
              disabled={status !== 'ready'}
              onClick={() => {
                unlockAudio();
                enter();
              }}
            >
              {status === 'ready'
                ? 'Entrer'
                : status === 'error'
                  ? 'Indisponible'
                  : 'Préparation du goban…'}
            </button>
          </motion.div>
          {status === 'ready' && (
            <motion.p className="intro__count" variants={rise}>
              {games} parties · {moves.toLocaleString('fr-FR')} coups
            </motion.p>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
