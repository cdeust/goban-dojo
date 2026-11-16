/**
 * Génère l'inventaire des composants logiciels (SBOM) au format CycloneDX 1.5,
 * à partir des dépendances de production réellement installées par pnpm.
 * Usage : pnpm sbom   →   sbom.cdx.json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Entry {
  name: string;
  versions: string[];
  license: string;
  homepage?: string;
  description?: string;
}

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};
const raw = execFileSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(raw) as Record<string, Entry[]>;

const purl = (name: string, version: string): string =>
  `pkg:npm/${name.startsWith('@') ? `%40${name.slice(1)}` : name}@${version}`;

const components = Object.values(byLicense)
  .flat()
  .flatMap((e) =>
    e.versions.map((version) => ({
      type: 'library',
      'bom-ref': purl(e.name, version),
      name: e.name,
      version,
      purl: purl(e.name, version),
      licenses: [{ license: { id: e.license } }],
      ...(e.description ? { description: e.description } : {}),
      ...(e.homepage ? { externalReferences: [{ type: 'website', url: e.homepage }] } : {}),
    })),
  )
  .sort((a, b) => a.purl.localeCompare(b.purl));

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    component: { type: 'application', name: pkg.name, version: pkg.version },
    tools: [{ name: 'scripts/sbom.ts' }],
  },
  components,
};
writeFileSync(join(root, 'sbom.cdx.json'), `${JSON.stringify(bom, null, 2)}\n`);

const licenses = Object.entries(byLicense)
  .map(([id, list]) => `${id} × ${list.length}`)
  .join(', ');
console.log(`SBOM : ${components.length} composants (${licenses}) → sbom.cdx.json`);
