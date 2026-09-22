import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('Heatmap right panel exposes Overture only as a zero-admission metadata placeholder',async()=>{
 const component=await readFile(new URL('../app/overture-heatmap-readiness.tsx',import.meta.url),'utf8');
 const heatmap=await readFile(new URL('../app/business-intelligence.tsx',import.meta.url),'utf8');
 const server=await readFile(new URL('./server.mjs',import.meta.url),'utf8');
 assert.match(component,/\/api\/overture-heatmap-readiness/);assert.match(component,/Admitted named \/ state \/ ZIP5 rows/);
 assert.match(component,/global, not U\.S\./);assert.match(component,/No acquisition or retry control is exposed/);
 assert.match(heatmap,/<OvertureHeatmapReadiness\s*\/>/);assert.match(server,/request\.method === 'GET'.*\/api\/overture-heatmap-readiness/s);
 assert.doesNotMatch(component,/<button/);
});
