/**
 * Mise au point du son : rend chaque son hors ligne dans le navigateur, en mesure le niveau,
 * la durée et la répartition spectrale, et l'enregistre en WAV pour l'écouter isolément.
 * Usage : node scripts/dev/sound.ts   (serveur de développement lancé)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = 'test-results/sons';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/');

for (const kind of ['place', 'capture'] as const) {
  for (const variation of [0.1, 0.5, 0.9]) {
    const r = await page.evaluate(
      async ([kind, variation]) => {
        const path = '/src/replay/sound.ts';
        const m = (await import(
          /* @vite-ignore */ path
        )) as typeof import('../../src/replay/sound.ts');
        const buffer = await m.renderStone({
          kind: kind as 'place' | 'capture',
          variation: variation as number,
        });
        const x = buffer.getChannelData(0);
        const sr = buffer.sampleRate;
        let peak = 0;
        for (const v of x) peak = Math.max(peak, Math.abs(v));
        // Dernier instant où le signal dépasse −40 dB sous sa crête.
        let last = 0;
        for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > peak * 0.01) last = i;
        // Centre de gravité spectral sur une fenêtre, par transformée de Fourier directe.
        const centroid = (from: number, to: number): number => {
          const n = to - from;
          let num = 0;
          let den = 0;
          for (let f = 100; f <= 8000; f += 50) {
            let re = 0;
            let im = 0;
            for (let i = 0; i < n; i++) {
              const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
              const a = (2 * Math.PI * f * i) / sr;
              re += x[from + i]! * w * Math.cos(a);
              im -= x[from + i]! * w * Math.sin(a);
            }
            const p = re * re + im * im;
            num += f * p;
            den += p;
          }
          return den ? num / den : 0;
        };
        const ms = (t: number): number => Math.round((t / 1000) * sr);
        // Niveau moyen de la queue de réverbération (100 à 300 ms), en dB sous la crête.
        let energy = 0;
        for (let i = ms(100); i < ms(300); i++) energy += x[i]! * x[i]!;
        const tail = 20 * Math.log10(Math.sqrt(energy / (ms(300) - ms(100))) / peak);
        return {
          tail,
          peak,
          t40: (last / sr) * 1000,
          early: centroid(0, ms(12)),
          late: centroid(ms(12), ms(40)),
          samples: Array.from(x),
          right: Array.from(buffer.getChannelData(1)),
          sr,
        };
      },
      [kind, variation] as const,
    );
    // WAV 16 bits stéréo.
    const n = r.samples.length;
    const wav = Buffer.alloc(44 + n * 4);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + n * 4, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(r.sr, 24);
    wav.writeUInt32LE(r.sr * 4, 28);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(n * 4, 40);
    const clip = (v: number): number => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
    for (let i = 0; i < n; i++) {
      wav.writeInt16LE(clip(r.samples[i]!), 44 + i * 4);
      wav.writeInt16LE(clip(r.right[i]!), 46 + i * 4);
    }
    const file = `${out}/${kind}-${variation}.wav`;
    writeFileSync(file, wav);
    console.log(
      `${kind} v=${variation} : crête ${r.peak.toFixed(2)}, sous −40 dB après ${r.t40.toFixed(0)} ms, ` +
        `centre spectral ${r.early.toFixed(0)} Hz (0-12 ms) puis ${r.late.toFixed(0)} Hz (12-40 ms), ` +
        `réverbération ${r.tail.toFixed(0)} dB → ${file}`,
    );
  }
}
await browser.close();
