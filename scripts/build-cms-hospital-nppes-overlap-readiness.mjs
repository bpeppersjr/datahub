#!/usr/bin/env node
import { publishCmsHospitalNppesOverlapReadiness as publish } from '../runner/cms-hospital-nppes-overlap-readiness.mjs';
console.log(JSON.stringify(await publish(), null, 2));
