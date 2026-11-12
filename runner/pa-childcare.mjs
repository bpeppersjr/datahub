import {publishGovernedAppPointer} from './governed-app-pointer.mjs';
import {runPaChildcareAppJob, verifyPaChildcareAppJob} from './pa-childcare-app.mjs';

export {runPaChildcareAppJob};
export async function verifyPaChildcare(receiptPath, options = {}) {return verifyPaChildcareAppJob(receiptPath, options);}
export async function publishPaChildcareCurrentPointer(outputRoot, verified, {signal} = {}) {return publishGovernedAppPointer({outputRoot,verified,datasetId:'pa-childcare-open-certified-center-candidates',appVersion:'pa-childcare-app@1.0.0',label:'Pennsylvania',signal});}
