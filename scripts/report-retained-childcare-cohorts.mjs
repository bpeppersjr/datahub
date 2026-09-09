import {createCliCancellation} from '../runner/cli-cancellation.mjs';
import {buildRetainedChildcareCohortView} from '../runner/retained-childcare-cohort-view.mjs';

const cancellation=createCliCancellation();
try {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')console.log('Usage: node scripts/report-retained-childcare-cohorts.mjs. Offline source-separated retained cohort comparison; no downloads or national promotion.');
  else {
    if(args.length)throw Error('Invalid arguments');
    const view=await buildRetainedChildcareCohortView({signal:cancellation.signal});
    console.log(JSON.stringify(view));
    if(Object.values(view.cohorts).some(rows=>rows.some(row=>row.status!=='available')))process.exitCode=2;
  }
}catch{console.error('Retained childcare comparison failed verification. No acquisition was performed; preserve retained evidence.');process.exitCode=1;}
finally{cancellation.dispose();}
