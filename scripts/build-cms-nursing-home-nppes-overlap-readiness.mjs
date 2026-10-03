#!/usr/bin/env node
import { publishCmsNursingHomeNppesOverlapReadiness as publish } from '../runner/cms-nursing-home-nppes-overlap-readiness.mjs';
console.log(JSON.stringify(await publish(), null, 2));
