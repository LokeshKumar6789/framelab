import { mkdirSync, writeFileSync } from 'node:fs';
import { examples } from '../src/engine/examples.ts';
const dir = new URL('../examples/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const example of examples)
  writeFileSync(new URL(`${example.id}.json`, dir), JSON.stringify(example.model, null, 2) + '\n');
console.log(`Exported ${examples.length} original example models.`);
