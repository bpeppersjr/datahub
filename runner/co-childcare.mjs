import {publishGovernedAppPointer} from './governed-app-pointer.mjs';
import {runCoChildcareAppJob, verifyCoChildcareAppJob} from './co-childcare-app.mjs';

export {runCoChildcareAppJob};
export async function verifyCoChildcare(receiptPath, options = {}) {return verifyCoChildcareAppJob(receiptPath, options);}
export async function publishCoChildcareCurrentPointer(outputRoot, verified, {signal} = {}) {return publishGovernedAppPointer({outputRoot,verified,datasetId:'co-childcare-licensed-center-candidates',appVersion:'co-childcare-app@1.0.0',label:'Colorado',signal});}
