import { verifyZipDenominatorDeltaReview } from '../runner/zip-denominator-delta-review.mjs';
try{if(process.argv.length!==3)throw Error();process.stdout.write(`${JSON.stringify(await verifyZipDenominatorDeltaReview(process.argv[2]))}\n`)}catch{process.stderr.write('ZIP denominator delta review verification failed.\n');process.exitCode=1}
