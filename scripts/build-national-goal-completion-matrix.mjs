#!/usr/bin/env node
import process from 'node:process';
import { publishNationalGoalCompletionMatrix, verifyNationalGoalCompletionMatrix } from '../runner/national-goal-completion-matrix.mjs';
try{if(process.argv.includes('--help'))process.stdout.write('Build a local immutable 51-jurisdiction governed dataset-availability matrix from current retained manifests. No downloads or production pointer changes.\n');else{const result=await publishNationalGoalCompletionMatrix();const verified=await verifyNationalGoalCompletionMatrix(`${result.directory}/manifest.json`);process.stdout.write(`${JSON.stringify(verified,null,2)}\n`);}}catch(error){process.stderr.write(`Goal-completion matrix failed: ${error.message}\n`);process.exitCode=1;}
