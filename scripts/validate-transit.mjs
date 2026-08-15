import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../data/transit/', import.meta.url);
const files = fs.readdirSync(root).filter(f => f.endsWith('.json'));
let errors = [];

for (const file of files) {
  const full = new URL(file, root);
  let data;
  try { data = JSON.parse(fs.readFileSync(full, 'utf8')); }
  catch (e) { errors.push(`${file}: invalid JSON`); continue; }

  if (file.startsWith('route-')) {
    if (!data.route_id || !data.operator || !data.source?.url) errors.push(`${file}: missing route/source provenance`);
    for (const dir of data.directions ?? []) {
      let previous = -1;
      for (const stop of dir.stops ?? []) {
        if (!Number.isInteger(stop.sequence) || stop.sequence <= previous) errors.push(`${file}: stop sequence is not strictly increasing`);
        previous = stop.sequence;
        if (typeof stop.journey_minutes !== 'number' || stop.journey_minutes < 0) errors.push(`${file}: invalid journey_minutes at ${stop.name}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Transit data validation passed: ${files.length} JSON files checked.`);
