import { MotionConfig } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { useGuessDriver } from './replay/useGuessDriver.ts';
import { usePlayback } from './replay/usePlayback.ts';
import { isEstimating, useStore } from './state/store.ts';
import { Dock } from './ui/Dock.tsx';
import { AnalysisPanel } from './ui/AnalysisPanel.tsx';
import { GameCard } from './ui/GameCard.tsx';
import { HelpDialog } from './ui/HelpDialog.tsx';
import { Intro } from './ui/Intro.tsx';
import { LiveRegion } from './ui/LiveRegion.tsx';
import { ModePanel } from './ui/ModePanel.tsx';
import { MomentCaption } from './ui/MomentCaption.tsx';
import { Panel } from './ui/Panel.tsx';
import { ReflectionReplay } from './ui/ReflectionReplay.tsx';
import { ReflectionPanel } from './ui/ReflectionPanel.tsx';
import { ReadingPanel } from './ui/ReadingPanel.tsx';
import { StudyPanel } from './ui/StudyPanel.tsx';
import { TacticalLegend } from './ui/TacticalLegend.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { useKeyboard } from './ui/useKeyboard.ts';

// three.js est lourd : la scène est chargée à part, le texte s'affiche d'abord.
const Scene = lazy(() => import('./scene/Scene.tsx').then((m) => ({ default: m.Scene })));

export function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const entered = useStore((s) => s.entered);
  const sceneReady = useStore((s) => s.sceneReady);
  const panel = useStore((s) => s.panel);
  const showReplay = useStore(isEstimating);
  const exploring = useStore((s) => s.mode === 'explorer');
  const studying = useStore((s) => s.mode === 'etudier');
  const reflecting = useStore((s) => s.mode === 'reflechir');
  const analysing = useStore((s) => s.mode === 'analyser');
  const reading = useStore((s) => s.mode === 'lire');
  const hasReadingPanel = reflecting || analysing || reading;
  const load = useStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);
  usePlayback();
  useGuessDriver();
  useKeyboard();

  return (
    // « user » : Motion respecte de lui-même la préférence système de réduction des animations.
    <MotionConfig reducedMotion="user">
      <div
        className="app"
        data-panel={entered && panel ? 'open' : 'closed'}
        data-study={studying || hasReadingPanel || exploring}
        data-reflection={hasReadingPanel}
      >
        {entered && <Panel />}
        <main className="stage" data-simulation={showReplay}>
          <div className="stage__canvas">
            <Suspense fallback={null}>{status === 'ready' && <Scene />}</Suspense>
            {entered && sceneReady && <TacticalLegend />}
          </div>
          {status === 'ready' && !sceneReady && (
            <p className="stage__loading" role="status">
              La scène se prépare…
            </p>
          )}
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
              <ReflectionReplay />
              {reading ? (
                <ReadingPanel />
              ) : analysing ? (
                <AnalysisPanel />
              ) : reflecting ? (
                <ReflectionPanel />
              ) : studying ? (
                <StudyPanel />
              ) : (
                <ModePanel />
              )}
              {!hasReadingPanel && <Dock />}
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
