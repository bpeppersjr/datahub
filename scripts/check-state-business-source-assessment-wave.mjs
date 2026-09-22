#!/usr/bin/env node
import process from 'node:process';import {loadStateBusinessSourceAssessmentWave} from '../runner/state-business-source-assessment-wave.mjs';
try{process.stdout.write(`${JSON.stringify(await loadStateBusinessSourceAssessmentWave(),null,2)}\n`);}catch(error){process.stderr.write(`State source assessment wave failed: ${error.message}\n`);process.exitCode=1;}
