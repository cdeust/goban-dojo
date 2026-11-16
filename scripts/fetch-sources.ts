/**
 * Re-télécharge les SGF bruts depuis le dépôt source, à un commit épinglé,
 * et vérifie l'empreinte git (SHA-1 de blob) de chaque fichier.
 * Usage : pnpm data:fetch
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE } from './source.ts';

const root = join(import.meta.dirname, '..');
const rawDir = join(root, 'data', 'raw');
mkdirSync(rawDir, { recursive: true });

const blobSha = (bytes: Uint8Array): string =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

const rows = readFileSync(join(root, 'data', 'sources.tsv'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t') as [string, string]);

let fetched = 0;
let cached = 0;
for (const [sha, path] of rows) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`empreinte invalide : ${sha}`);
  const dst = join(rawDir, `${sha}.sgf`);
  if (existsSync(dst) && blobSha(readFileSync(dst)) === sha) {
    cached++;
    continue;
  }
  const url = `https://raw.githubusercontent.com/${SOURCE.repository}/${SOURCE.commit}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`${res.status} pour ${path}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (blobSha(bytes) !== sha) throw new Error(`empreinte inattendue pour ${path}`);
  writeFileSync(dst, bytes);
  fetched++;
}
console.log(`sources : ${fetched} téléchargées, ${cached} déjà présentes et vérifiées`);
