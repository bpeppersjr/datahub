#!/usr/bin/env node
import {publishZipSourceStatusIndex,verifyZipSourceStatusIndex} from '../runner/zip-source-status-index.mjs';
const [mode,...rest]=process.argv.slice(2);const arg=n=>{const i=rest.indexOf(n);return i<0?null:rest[i+1];};
if(mode==='build')console.log(JSON.stringify(await publishZipSourceStatusIndex({createdAt:arg('--created-at')}),null,2));
else if(mode==='verify')console.log(JSON.stringify(await verifyZipSourceStatusIndex(arg('--manifest')),null,2));
else throw Error('Usage: build --created-at <UTC> | verify --manifest <path>');
