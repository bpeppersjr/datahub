#!/usr/bin/env node
import{publishNationalBusinessTemporalClaimMatrix as publish}from'../runner/national-business-temporal-claim-matrix.mjs';console.log(JSON.stringify(await publish(),null,2));
