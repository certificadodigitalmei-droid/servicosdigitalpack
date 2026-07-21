import { normalizeCasaDosDadosCompany, validateCompanyItem } from '../src/lib/casa-dos-dados/worker-logic';
import * as fs from 'fs';
const lines = fs.readFileSync('/tmp/raws.jsonl','utf8').trim().split('\n');
let complete = 0, incomplete = 0;
const missingCounts: Record<string, number> = {};
for (const line of lines) {
  const raw = JSON.parse(line);
  const v = validateCompanyItem(raw);
  if (v.complete) complete++; else { incomplete++; for (const f of v.missingFields) missingCounts[f] = (missingCounts[f]||0)+1; }
}
console.log('total', lines.length, 'complete', complete, 'incomplete', incomplete);
console.log('missing', missingCounts);
const first = JSON.parse(lines[0]);
console.log('normalized[0]', JSON.stringify(normalizeCasaDosDadosCompany(first), null, 2));
console.log('missingFields[0]', validateCompanyItem(first).missingFields);
