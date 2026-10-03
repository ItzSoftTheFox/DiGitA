import { readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const project = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', project), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid package version');
const filename = `digita-${version}-1-x86_64.pkg.tar.zst`;
const archive = new URL(`docs/downloads/${filename}`, project);
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
const recorded = readFileSync(new URL(`docs/downloads/${filename}.sha256`, project), 'utf8').split(/\s/)[0];
if (digest !== recorded) throw new Error('Download checksum mismatch');
const size = `${(statSync(archive).size / 1024 / 1024).toFixed(1)} MiB`;
const sourceFilename = `digita-${version}-source.tar.gz`;
const sourceArchive = new URL(`docs/downloads/${sourceFilename}`, project);
const sourceDigest = createHash('sha256').update(readFileSync(sourceArchive)).digest('hex');
const sourceRecorded = readFileSync(new URL(`docs/downloads/${sourceFilename}.sha256`, project), 'utf8').split(/\s/)[0];
if (sourceDigest !== sourceRecorded) throw new Error('Source checksum mismatch');
const template = readFileSync(new URL('index.html', import.meta.url), 'utf8');
const html = template
  .replaceAll('{{version}}', version)
  .replaceAll('{{package_filename}}', filename)
  .replaceAll('{{source_filename}}', sourceFilename)
  .replaceAll('{{package_size}}', size);
if (/\{\{[^}]+\}\}/.test(html)) throw new Error('Unresolved website placeholder');
writeFileSync(new URL('docs/index.html', project), html);
copyFileSync(new URL('site.js', import.meta.url), new URL('docs/assets/site.js', project));
writeFileSync(new URL('docs/.nojekyll', project), '');
console.log(`Built static site; verified ${filename} (${size}).`);
