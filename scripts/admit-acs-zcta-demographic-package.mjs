#!/usr/bin/env node
import path from 'node:path';
import {APP_ROOT} from '../runner/paths.mjs';
import {admitOfflineAcsZctaPackage} from '../runner/acs-zcta-demographic-offline-admission.mjs';
const args=process.argv.slice(2),values={};
for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--package','--operation-id','--operation-directory'].includes(key)||!value||Object.hasOwn(values,key))throw Error('Usage: admit-acs-zcta-demographic-package --package <data/imports/subdirectory> --operation-id <id> --operation-directory <directory>');values[key]=value;}
if(Object.keys(values).length!==3)throw Error('Missing ACS offline admission argument.');
const controller=new AbortController();process.on('message',message=>{if(message?.type==='cancel')controller.abort(new Error('ACS admission cancelled.'));});
try{const result=await admitOfflineAcsZctaPackage({root:APP_ROOT,packageDirectory:values['--package'],operationId:values['--operation-id'],operationDirectory:values['--operation-directory'],signal:controller.signal});process.stdout.write(`${JSON.stringify({...result,verification_pending:true,status:'admitted-local-review-only',cancellation_after_publication:controller.signal.aborted})}\n`);}catch(error){if(process.send)process.send({type:'error'});throw error;}
