import { useEffect, useMemo } from 'react';
import { CanvasTexture } from 'three';
import { useStore } from '../state/store.ts';
import { BOARD_TOP, STONE_DIAMETER_BLACK, pointToWorld } from './dimensions.ts';

function badgeTexture(rank: number, recorded: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const tint = recorded ? '#ffe296' : '#93dcff';
  const glow = ctx.createRadialGradient(64, 64, 26, 64, 64, 64);
  glow.addColorStop(0, tint);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 37, 0, 2 * Math.PI);
  ctx.fillStyle = '#12293b';
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = tint;
  ctx.font = 'bold 43px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), 64, 66);
  return new CanvasTexture(canvas);
}

function Badge({ point, rank, recorded }: { point: number; rank: number; recorded: boolean }) {
  const texture = useMemo(() => badgeTexture(rank, recorded), [rank, recorded]);
  useEffect(() => () => texture.dispose(), [texture]);
  const [x, z] = pointToWorld(point);
  return (
    <mesh position={[x, BOARD_TOP + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <planeGeometry args={[STONE_DIAMETER_BLACK, STONE_DIAMETER_BLACK]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function AnalysisMarks() {
  const mode = useStore((s) => s.mode);
  const marks = useStore((s) => s.analysisMarks);
  if (mode !== 'analyser') return null;
  return marks.map((mark) => <Badge key={mark.point} {...mark} />);
}
