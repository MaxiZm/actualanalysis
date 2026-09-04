import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
const encoded = process.env.AA_DISPLAY_DATA_GZIP_BASE64;
if (encoded) {
  const files = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  const allowed = ['speed-aa.yaml', 'cost-aa.yaml', 'benchmarks-aa.yaml'];
  if (Object.keys(files).some(name => !allowed.includes(name))) throw new Error('Unexpected display registry');
  await mkdir('data/manual', { recursive: true });
  for (const name of allowed) {
    if (typeof files[name] !== 'string') throw new Error(`Missing ${name}`);
    await writeFile(`data/manual/${name}`, files[name], { mode: 0o600 });
  }
  console.log('Installed the three private display registries.');
} else {
  console.log('No private display registries configured; public evidence remains available.');
}
