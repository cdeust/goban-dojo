/**
 * Re-télécharge les SGF bruts depuis leurs sources épinglées et vérifie l'empreinte de chacun.
 * Aucun fichier dont l'empreinte n'est pas déjà inscrite au manifeste n'est accepté.
 * Usage : pnpm data:fetch
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { CWI, PGD } from './source.ts';

const root = join(import.meta.dirname, '..');
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const blobSha = (b: Uint8Array): string =>
  createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');

function cachedHash(path: string, digest: (bytes: Uint8Array) => string): string | undefined {
  try {
    return digest(readFileSync(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function download(url: string): Promise<Response> {
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`${res.status} pour ${url}`);
  return res;
}

// ---------------------------------------------------------------- CWI

{
  const dir = join(root, 'data', 'cwi');
  mkdirSync(dir, { recursive: true });
  const manifest = new Map(
    readFileSync(join(root, 'data', 'cwi.sha256'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, name] = l.split(/\s+/) as [string, string];
        if (!/^[0-9a-f]{64}$/.test(hash) || !/^\d{3}\.sgf$/.test(name))
          throw new Error(`entrée CWI invalide : ${l}`);
        return [name, hash] as const;
      }),
  );
  const missing = [...manifest].filter(
    ([name, hash]) => cachedHash(join(dir, name), sha256) !== hash,
  );
  if (missing.length === 0) {
    console.log(`CWI : ${manifest.size} fichiers déjà présents et vérifiés`);
  } else {
    const archive = await (await download(CWI.archive)).bytes();
    if (sha256(archive) !== CWI.archiveSha256)
      throw new Error("empreinte inattendue pour l'archive CWI");
    const tmp = mkdtempSync(join(dir, '.restore-'));
    try {
      execFileSync('tar', ['-xzf', '-', '-C', tmp], { input: archive });
      const found = new Map<string, string>();
      const walk = (d: string): void => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(join(d, e.name));
          else if (e.isFile() && /^\d{3}\.sgf$/.test(e.name)) {
            found.set(e.name, join(d, e.name));
          }
        }
      };
      walk(tmp);
      for (const [name, hash] of missing) {
        const file = found.get(name);
        if (!file || sha256(readFileSync(file)) !== hash)
          throw new Error(`empreinte inattendue pour ${name}`);
        renameSync(file, join(dir, name));
      }
      console.log(`CWI : ${missing.length} fichiers restaurés depuis l'archive vérifiée`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------- PGD

{
  const dir = join(root, 'data', 'pgd', 'raw');
  mkdirSync(dir, { recursive: true });
  const rows = readFileSync(join(root, 'data', 'pgd', 'sources.tsv'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t') as [string, string]);
  let fetched = 0;
  let cached = 0;
  for (const [sha, path] of rows) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`empreinte invalide : ${sha}`);
    const dst = join(dir, `${sha}.sgf`);
    if (cachedHash(dst, blobSha) === sha) {
      cached++;
      continue;
    }
    const url = `https://raw.githubusercontent.com/${PGD.repository}/${PGD.commit}/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    const blob = await (await download(url)).blob();
    if (blobSha(await blob.bytes()) !== sha) throw new Error(`empreinte inattendue pour ${path}`);
    const tmp = mkdtempSync(join(dir, '.restore-'));
    try {
      const file = join(tmp, 'verified.sgf');
      await pipeline(blob.stream(), createWriteStream(file, { flags: 'wx' }));
      renameSync(file, dst);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    fetched++;
  }
  console.log(`PGD : ${fetched} fichiers téléchargés, ${cached} déjà présents et vérifiés`);
}
