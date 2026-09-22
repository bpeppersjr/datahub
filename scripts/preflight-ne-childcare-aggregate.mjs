import {runNeChildcareAggregatePreflight, verifyNeChildcarePreflightBundle, getNeChildcareScopeDecisionContract} from '../runner/ne-childcare-aggregate-preflight.mjs';

try {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--decision-contract') {
    console.log(JSON.stringify(await getNeChildcareScopeDecisionContract(),null,2));
  } else if(args.length===2&&args[0]==='--verify') {
    console.log(JSON.stringify(await verifyNeChildcarePreflightBundle(args[1]),null,2));
  } else if(args.length===0) {
    const result=await runNeChildcareAggregatePreflight();
    console.log(JSON.stringify({status:result.receipt.status,reason:result.receipt.reason,manifest_path:result.manifest_path},null,2));
    if(!['HOLD','COMPLETE'].includes(result.receipt.status))process.exitCode=2;
  } else {
    throw Object.assign(new Error('Usage: node scripts/preflight-ne-childcare-aggregate.mjs [--decision-contract | --verify <data manifest path>]. URLs, paths, approvals, and fetch overrides are not accepted.'),{code:'NE_INVALID_CLI'});
  }
} catch(error) {
  console.error(`${error.code??'NE_PREFLIGHT_ERROR'}: ${error.message}`);
  process.exitCode=2;
}
