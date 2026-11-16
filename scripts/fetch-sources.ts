/**
 * Re-télécharge les SGF bruts depuis leurs sources épinglées et vérifie l'empreinte de chacun.
 * Aucun fichier dont l'empreinte n'est pas déjà inscrite au manifeste n'est accepté.
 * Usage : pnpm data:fetch
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CWI, PGD } from './source.ts';

const root = join(import.meta.dirname, '..');
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const blobSha = (b: Uint8Array): string =>
  createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`${res.status} pour ${url}`);
  return new Uint8Array(await res.arrayBuffer());
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
        return [name, hash] as const;
      }),
  );
  const missing = [...manifest].filter(
    ([name, hash]) =>
      !existsSync(join(dir, name)) || sha256(readFileSync(join(dir, name))) !== hash,
  );
  if (missing.length === 0) {
    console.log(`CWI : ${manifest.size} fichiers déjà présents et vérifiés`);
  } else {
    const archive = await download(CWI.archive);
    if (sha256(archive) !== CWI.archiveSha256)
      throw new Error("empreinte inattendue pour l'archive CWI");
    const tmp = mkdtempSync(join(tmpdir(), 'cwi-'));
    try {
      writeFileSync(join(tmp, 'shusaku.tgz'), archive);
      mkdirSync(join(tmp, 'x'));
      execFileSync('tar', ['-xzf', join(tmp, 'shusaku.tgz'), '-C', join(tmp, 'x')]);
      const found = new Map<string, Uint8Array>();
      const walk = (d: string): void => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(join(d, e.name));
          else if (e.isFile() && /^\d{3}\.sgf$/.test(e.name)) {
            found.set(e.name, readFileSync(join(d, e.name)));
          }
        }
      };
      walk(join(tmp, 'x'));
      for (const [name, hash] of missing) {
        const bytes = found.get(name);
        if (!bytes || sha256(bytes) !== hash) throw new Error(`empreinte inattendue pour ${name}`);
        writeFileSync(join(dir, name), bytes);
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
    if (existsSync(dst) && blobSha(readFileSync(dst)) === sha) {
      cached++;
      continue;
    }
    const url = `https://raw.githubusercontent.com/${PGD.repository}/${PGD.commit}/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    const bytes = await download(url);
    if (blobSha(bytes) !== sha) throw new Error(`empreinte inattendue pour ${path}`);
    writeFileSync(dst, bytes);
    fetched++;
  }
  console.log(`PGD : ${fetched} fichiers téléchargés, ${cached} déjà présents et vérifiés`);
}
