/**
 * Sons synthétisés (Web Audio) : aucune ressource audio à charger.
 * Le « pachi » d'une pierre posée sur un goban épais = un claquement bref et sec
 * (bruit filtré) suivi de la résonance grave du plateau.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** À appeler depuis un geste de l'utilisateur : les navigateurs bloquent l'audio autrement. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.08), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

export type StoneSound = 'place' | 'capture';

export function playStone(kind: StoneSound, variation = Math.random()): void {
  const ac = ctx;
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  const loud = kind === 'place' ? 1 : 0.35;

  const out = ac.createGain();
  out.gain.value = 0.5 * loud;
  out.connect(ac.destination);

  // Claquement.
  const click = ac.createBufferSource();
  click.buffer = noiseBuffer(ac);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = (kind === 'place' ? 2600 : 3800) + variation * 900;
  band.Q.value = 1.4;
  const clickGain = ac.createGain();
  clickGain.gain.setValueAtTime(0.9, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  click.connect(band).connect(clickGain).connect(out);
  click.start(t);
  click.stop(t + 0.06);

  if (kind === 'place') {
    // Résonance du plateau massif.
    const body = ac.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(210 + variation * 40, t);
    body.frequency.exponentialRampToValueAtTime(120, t + 0.09);
    const bodyGain = ac.createGain();
    bodyGain.gain.setValueAtTime(0.55, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    body.connect(bodyGain).connect(out);
    body.start(t);
    body.stop(t + 0.15);
  }
}
