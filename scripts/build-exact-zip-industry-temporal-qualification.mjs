import {buildExactZipIndustryTemporalQualification} from '../runner/exact-zip-industry-temporal-qualification.mjs';
process.stdout.write(`${JSON.stringify(await buildExactZipIndustryTemporalQualification(),null,2)}\n`);
