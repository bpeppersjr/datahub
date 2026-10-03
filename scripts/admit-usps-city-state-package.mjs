#!/usr/bin/env node
import process from 'node:process';
import {APP_ROOT} from '../runner/paths.mjs';
import {admitOfflineCityStatePackage} from '../runner/usps-city-state-offline-admission.mjs';
const args=process.argv.slice(2),values={};for(let i=0;i<args.length;i+=2){if(!['--package','--operation-id','--operation-directory'].includes(args[i])||i+1>=args.length||Object.hasOwn(values,args[i]))throw Error('Invalid USPS City State package admission arguments.');values[args[i]]=args[i+1];}
if(Object.keys(values).length!==3)throw Error('Missing USPS City State package admission argument.');const controller=new AbortController();process.on('message',m=>{if(m?.type==='cancel')controller.abort(new Error('USPS City State admission cancelled.'));});
const result=await admitOfflineCityStatePackage({root:APP_ROOT,packageDirectory:values['--package'],operationDirectory:values['--operation-directory'],operationId:values['--operation-id'],signal:controller.signal});process.stdout.write(`${JSON.stringify(result)}\n`);
