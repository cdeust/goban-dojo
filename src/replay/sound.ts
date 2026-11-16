/**
 * Son d'une pierre posée sur un goban de bois massif, par synthèse modale (Web Audio).
 *
 * Principe : le choc d'une pierre dure sur du bois est une impulsion très brève, large bande ;
 * le plateau y répond en vibrant sur quelques fréquences propres fixes, vite amorties. On
 * excite donc une banque de résonateurs (filtres passe-bande à fort facteur de qualité) par une
 * salve de bruit de quelques millisecondes. Aucune fréquence ne glisse : c'est un glissement
 * vers le grave qui donnait à la version précédente un caractère de percussion à peau.
 *
 * Les valeurs de `VOICES` sont des choix d'oreille raisonnés, non des mesures : aucun
 * enregistrement libre de droits d'un goban de kaya n'a été trouvé pour les caler. Ce sont
 * elles qu'il faut retoucher pour changer le timbre ; `renderStone` permet d'en mesurer l'effet.
 */

/** Une fréquence propre du plateau : hauteur, durée d'extinction, niveau relatif. */
interface Mode {
  /** Hz. */
  frequency: number;
  /** Temps (s) pour que la résonance s'éteigne de 60 dB. */
  decay: number;
  gain: number;
}

interface Voice {
  /** Durée (s) de l'impulsion de contact. */
  click: number;
  /** Fréquence (Hz) en dessous de laquelle l'impulsion est atténuée. */
  clickHighpass: number;
  clickGain: number;
  modes: Mode[];
  /** Second contact, plus faible, quand la pierre bascule sur sa face bombée ; 0 = aucun. */
  reboundDelay: number;
  reboundGain: number;
  level: number;
}

export type StoneSound = 'place' | 'capture';

const VOICES: Record<StoneSound, Voice> = {
  // Pierre frappée sur un plateau épais : claquement dur et bref, puis une note boisée nette
  // (le « pachi »), posée sur un corps plus grave ; léger rebond de la pierre sur sa face bombée.
  place: {
    click: 0.0025,
    clickHighpass: 2600,
    clickGain: 0.95,
    modes: [
      { frequency: 290, decay: 0.11, gain: 0.3 },
      { frequency: 720, decay: 0.09, gain: 0.5 },
      { frequency: 1180, decay: 0.085, gain: 1 },
      { frequency: 1840, decay: 0.065, gain: 0.9 },
      { frequency: 2950, decay: 0.04, gain: 0.6 },
      { frequency: 4600, decay: 0.022, gain: 0.4 },
    ],
    reboundDelay: 0.038,
    reboundGain: 0.12,
    level: 1,
  },
  // Pierre déposée dans un couvercle de bois mince : plus aigu, plus sec, sans corps grave.
  capture: {
    click: 0.003,
    clickHighpass: 2600,
    clickGain: 0.5,
    modes: [
      { frequency: 1250, decay: 0.035, gain: 0.8 },
      { frequency: 2100, decay: 0.026, gain: 1 },
      { frequency: 3400, decay: 0.018, gain: 0.6 },
      { frequency: 5200, decay: 0.012, gain: 0.3 },
    ],
    reboundDelay: 0,
    reboundGain: 0,
    level: 0.32,
  },
};

/** Durée totale d'un son, extinction comprise. */
export const SOUND_DURATION = 0.9;

/**
 * Acoustique de la pièce : une salle à tatamis, silencieuse et peu réverbérante. La réponse
 * impulsionnelle est synthétique (bruit filtré à décroissance exponentielle).
 */
const ROOM = {
  /** Temps (s) d'extinction de 60 dB. */
  decay: 0.55,
  /** Fréquence (Hz) au-delà de laquelle la pièce absorbe (tatamis, papier, bois). */
  damping: 3200,
  /** Gain du son réverbéré (le convolveur normalise la réponse : la queue reste ~45 dB sous la crête). */
  wet: 1.6,
} as const;

/** Facteur de qualité d'un résonateur dont l'extinction de 60 dB dure `decay` secondes. */
const qualityOf = (frequency: number, decay: number): number =>
  (Math.PI * frequency * decay) / 6.91;

export interface StoneHit {
  kind: StoneSound;
  /** Force du geste : 1 = coup ordinaire, davantage pour un coup appuyé. */
  force?: number;
  /** Position gauche-droite, de −1 à 1. */
  pan?: number;
  /** Variation d'une pierre à l'autre, de 0 à 1 : aucune pierre ne sonne deux fois pareil. */
  variation?: number;
}

function noise(context: BaseAudioContext, duration: number): AudioBuffer {
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  // Enveloppe décroissante : l'essentiel de l'énergie est dans la première milliseconde.
  for (let i = 0; i < data.length; i++)
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  return buffer;
}

/** Programme un son de pierre sur `context` à l'instant `at` (s), vers `destination`. */
export function scheduleStone(
  context: BaseAudioContext,
  destination: AudioNode,
  at: number,
  hit: StoneHit,
): void {
  const voice = VOICES[hit.kind];
  const variation = hit.variation ?? Math.random();
  // Chaque pierre frappe un peu plus ou moins fort, et le point d'impact déplace les résonances.
  const tune = 0.94 + variation * 0.12;
  const strength = (0.8 + ((variation * 7) % 1) * 0.35) * (hit.force ?? 1);

  const out = context.createGain();
  out.gain.value = voice.level * strength;
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, hit.pan ?? 0)) * 0.6;
  out.connect(panner).connect(destination);

  const strike = (time: number, gain: number): void => {
    const source = context.createBufferSource();
    source.buffer = noise(context, voice.click);
    const excitation = context.createGain();
    excitation.gain.value = gain;
    source.connect(excitation);

    // Le contact lui-même.
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = voice.clickHighpass;
    const click = context.createGain();
    click.gain.value = voice.clickGain;
    excitation.connect(highpass).connect(click).connect(out);

    // La réponse du bois.
    for (const mode of voice.modes) {
      const resonator = context.createBiquadFilter();
      resonator.type = 'bandpass';
      resonator.frequency.value = mode.frequency * tune;
      resonator.Q.value = qualityOf(mode.frequency, mode.decay);
      const level = context.createGain();
      // Un passe-bande étroit laisse passer peu d'énergie d'une impulsion : on compense.
      level.gain.value = mode.gain * Math.sqrt(resonator.Q.value) * 0.9;
      excitation.connect(resonator).connect(level).connect(out);
    }
    source.start(time);
  };

  strike(at, 1);
  if (voice.reboundDelay > 0) {
    strike(at + voice.reboundDelay * (0.8 + variation * 0.5), voice.reboundGain);
  }
}

/** Réponse impulsionnelle de la pièce. Déterministe : même pièce à chaque rendu. */
function roomResponse(context: BaseAudioContext): AudioBuffer {
  const length = Math.ceil(context.sampleRate * ROOM.decay);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  // Coefficient d'un passe-bas du premier ordre à la fréquence d'amortissement.
  const k = 1 - Math.exp((-2 * Math.PI * ROOM.damping) / context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = 1862 + channel * 7919;
    let low = 0;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      low += k * (seed / 2147483648 - 1 - low);
      // −60 dB à la fin de la réponse.
      data[i] = low * Math.exp((-6.91 * i) / length);
    }
  }
  return buffer;
}

/** Crée la sortie « pièce » : son direct plus réverbération. Renvoie le nœud où brancher les sons. */
function createRoom(context: BaseAudioContext, destination: AudioNode): AudioNode {
  const input = context.createGain();
  input.connect(destination);
  const convolver = context.createConvolver();
  convolver.buffer = roomResponse(context);
  const wet = context.createGain();
  wet.gain.value = ROOM.wet;
  input.connect(convolver).connect(wet).connect(destination);
  return input;
}

/** Rend un son hors ligne, dans la pièce, pour le mesurer ou l'écouter isolément. */
export async function renderStone(hit: StoneHit, sampleRate = 48000): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.ceil(sampleRate * SOUND_DURATION), sampleRate);
  scheduleStone(context, createRoom(context, context.destination), 0, hit);
  return context.startRendering();
}

let live: AudioContext | null = null;
let room: AudioNode | null = null;

/** À appeler depuis un geste de l'utilisateur : les navigateurs bloquent l'audio autrement. */
export function unlockAudio(): void {
  try {
    if (!live) {
      live = new AudioContext();
      // Garde-fou : plusieurs captures rapprochées ne doivent pas saturer.
      const limiter = live.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.ratio.value = 6;
      limiter.connect(live.destination);
      room = createRoom(live, limiter);
    }
    if (live.state === 'suspended') void live.resume();
  } catch {
    live = null;
    room = null;
  }
}

export function playStone(kind: StoneSound, pan = 0, force = 1): void {
  if (!live || !room || live.state !== 'running') return;
  scheduleStone(live, room, live.currentTime, { kind, pan, force });
}
