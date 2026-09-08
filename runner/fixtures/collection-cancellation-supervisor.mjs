import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildIndustryPlan, runIndustryPlan } from '../industry-segments.mjs';
import { createCliCancellation } from '../cli-cancellation.mjs';
const cancellation=createCliCancellation(),root=process.argv[2];
const config={version:1,max_concurrency:1,states:['DE'],industries:{fixture:['fixture-de']},sources:{'fixture-de':{script:'runner/fixtures/collection-cancellation-de.mjs',scope:'state',states:['DE'],state_filter_supported:false,prerequisites:[]}}};
try {
  const plan=buildIndustryPlan(config,{runId:`cancel-${process.pid}`,industries:['fixture'],states:['DE']});
  const result=await runIndustryPlan(config,plan,{outputRoot:path.join(root,'run'),signal:cancellation.signal});
  // Fixture exits 0 after saving the cancelled control receipt; the production
  // industry CLI instead exits 1 for that status. This test proves child drain,
  // not production CLI exit-code mapping or managed UI status.
  await writeFile(path.join(root,'supervisor.json'),JSON.stringify({status:result.receipt.status,receipt:result.receiptPath,cancelled:cancellation.signal.aborted}));
} finally {cancellation.dispose();}
