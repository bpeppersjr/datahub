#!/usr/bin/env node
import{verifyNationalBusinessTemporalClaimMatrix as verify}from'../runner/national-business-temporal-claim-matrix.mjs';const i=process.argv.indexOf('--manifest');if(i<0)throw Error('--manifest is required');console.log(JSON.stringify(await verify(process.argv[i+1]),null,2));
