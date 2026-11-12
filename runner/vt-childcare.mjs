import {publishGovernedAppPointer} from './governed-app-pointer.mjs';
import {runVtChildcareAppJob, verifyVtChildcareAppJob} from './vt-childcare-app.mjs';

export {runVtChildcareAppJob};
export async function verifyVtChildcare(receiptPath, options = {}) {return verifyVtChildcareAppJob(receiptPath, options);}
export async function publishVtChildcareCurrentPointer(outputRoot, verified, {signal} = {}) {return publishGovernedAppPointer({outputRoot,verified,datasetId:'vt-childcare-licensed-center-candidates',appVersion:'vt-childcare-app@1.0.0',label:'Vermont',signal});}
