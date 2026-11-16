import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { usePlayback } from './replay/usePlayback.ts';
import { useStore } from './state/store.ts';
import { Dock } from './ui/Dock.tsx';
import { GameCard } from './ui/GameCard.tsx';
import { HelpDialog } from './ui/HelpDialog.tsx';
import { Intro } from './ui/Intro.tsx';
import { LiveRegion } from './ui/LiveRegion.tsx';
import { MomentCaption } from './ui/MomentCaption.tsx';
import { Panel } from './ui/Panel.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { useKeyboard } from './ui/useKeyboard.ts';

// three.js est lourd : la scène est chargée à part, le texte s'affiche d'abord.
const Scene = lazy(() => import('./scene/Scene.tsx').then((m) => ({ default: m.Scene })));

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const entered = useStore((s) => s.entered);
  const panel = useStore((s) => s.panel);
  const load = useStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);
  usePlayback();
  useKeyboard();

  return (
    // « user » : Motion respecte de lui-même la préférence système de réduction des animations.
    <MotionConfig reducedMotion="user">
      <div className="app" data-panel={entered && panel ? 'open' : 'closed'}>
        {entered && <Panel />}
        <main className="stage">
          <div className="stage__canvas">
            <Suspense fallback={null}>{status === 'ready' && <Scene />}</Suspense>
          </div>
          {status === 'error' && (
            <p className="fatal" role="alert">
              Les parties n’ont pas pu être chargées ({error}). Rechargez la page.
            </p>
          )}
          {entered && status === 'ready' && (
            <>
              <TopBar />
              <GameCard />
              <MomentCaption />
              <Dock />
            </>
          )}
        </main>
        <Intro />
        <HelpDialog />
        <LiveRegion />
      </div>
    </MotionConfig>
  );
}
