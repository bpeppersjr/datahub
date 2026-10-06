import {verifyNationalBusinessRegistrySourceFreshnessAudit} from '../runner/national-business-registry-source-freshness-audit.mjs';
const controller=new AbortController();for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>controller.abort());
try{const result=await verifyNationalBusinessRegistrySourceFreshnessAudit({signal:controller.signal});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);}catch(error){process.stderr.write(`${error.stack??error}\n`);process.exitCode=1;}
