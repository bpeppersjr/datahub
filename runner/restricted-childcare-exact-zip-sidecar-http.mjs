import { readRestrictedChildcareExactZipSidecar, validateRestrictedChildcareExactZipSidecar } from './restricted-childcare-exact-zip-sidecar.mjs';

export async function restrictedChildcareExactZipSidecarHttp(request,response,url,{authorize,reader=readRestrictedChildcareExactZipSidecar},json){
  try{if(typeof authorize!=='function'||await authorize(request)!==true)throw Error();}catch{json(response,401,{error:'Restricted childcare ZIP sidecar requires authorization.'});return;}
  const zip5=url.searchParams.get('zip'),keys=[...url.searchParams.keys()];
  if(request.method!=='GET'||keys.some(key=>key!=='zip')||url.searchParams.getAll('zip').length!==1||!/^\d{5}$/.test(zip5??'')||request.headers?.['transfer-encoding']!==undefined||request.headers?.['content-length']!==undefined&&request.headers['content-length']!=='0'){
    response.setHeader?.('Connection','close');json(response,400,{error:'Provide one exact ZIP5 on an empty GET.'});return;
  }
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,30000);request.once?.('aborted',abort);response.once?.('close',()=>{if(!response.writableEnded)abort();});
  try{request.resume?.();const value=await reader({zip5,signal:controller.signal});controller.signal.throwIfAborted();validateRestrictedChildcareExactZipSidecar(value,zip5);if(Buffer.byteLength(JSON.stringify(value))>200000)throw Error();response.setHeader?.('Cache-Control','no-store');json(response,200,value);}
  catch{if(!response.destroyed&&!response.writableEnded)json(response,503,{error:'Restricted childcare ZIP sidecar is unavailable or incompatible. No data was acquired or rebuilt.'});}
  finally{clearTimeout(timer);request.removeListener?.('aborted',abort);}
}
