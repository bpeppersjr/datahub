import {preflightDeChildcare,verifyDeChildcarePreflight,writeDeChildcarePreflight} from '../runner/de-childcare-preflight.mjs';
try{
 const args=process.argv.slice(2);
 if(args.length===2&&args[0]==='--verify')console.log(JSON.stringify(await verifyDeChildcarePreflight(args[1]),null,2));
 else if(args.length===0){const receipt=await preflightDeChildcare(),written=await writeDeChildcarePreflight({receipt});console.log(JSON.stringify({status:receipt.status,manifest_path:written.manifest_path,rows_updated_at:receipt.source.rows_updated_at},null,2));}
 else throw Error('Usage: node scripts/preflight-de-childcare.mjs [--verify <manifest.json>]');
}catch(error){console.error(`DE_CHILDCARE_PREFLIGHT_ERROR: ${error.message}`);process.exitCode=2;}
