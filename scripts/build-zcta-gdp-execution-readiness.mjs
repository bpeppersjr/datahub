#!/usr/bin/env node
import { publishZctaGdpExecutionReadiness } from "../runner/zcta-gdp-execution-readiness.mjs";
console.log(JSON.stringify(await publishZctaGdpExecutionReadiness(), null, 2));
