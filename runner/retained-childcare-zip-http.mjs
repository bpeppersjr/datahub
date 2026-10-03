import {readRetainedChildcareZipEvidence,validateRetainedChildcareZipResponse} from './retained-childcare-zip-evidence.mjs';

/** Caller must supply the existing full Host/Origin/bearer guard; no permissive default. */
export async function retainedChildcareZipHttp(request,response,url,{authorize,reader=readRetainedChildcareZipEvidence},json){
 try{if(typeof authorize!=='function'||await authorize(request)!==true)throw Error();}catch{json(response,401,{error:'Retained childcare ZIP evidence requires authorization.'});return;}
 const h=request.headers??{},zip5=url.searchParams.get('zip');
 if(request.method!=='GET'||url.searchParams.getAll('zip').length!==1||[...url.searchParams.keys()].some(k=>k!=='zip')||!/^\d{5}$/.test(zip5??'')||h['transfer-encoding']!==undefined||h['content-length']!==undefined&&h['content-length']!=='0'){response.setHeader?.('Connection','close');json(response,400,{error:'Provide one exact ZIP5 on an empty GET.'});return;}
 const controller=new AbortController();let gone=false,rejectAbort;const disconnect=()=>{if(!response.writableEnded){gone=true;controller.abort();}},aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('Aborted'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});aborted.catch(()=>{});
 const timer=setTimeout(()=>controller.abort(),30000);request.once?.('aborted',disconnect);response.once?.('close',disconnect);
 try{if(request.aborted||response.destroyed)disconnect();controller.signal.throwIfAborted();request.resume?.();const value=await Promise.race([reader({zip5,signal:controller.signal}),aborted]);controller.signal.throwIfAborted();await Promise.race([validateRetainedChildcareZipResponse(value,zip5,controller.signal),aborted]);controller.signal.throwIfAborted();if(value.zip5!==zip5||Buffer.byteLength(JSON.stringify(value))>200000)throw Error();if(!response.destroyed&&!response.writableEnded){response.setHeader?.('Cache-Control','no-store');json(response,200,value);}}
 catch{if(!gone&&!response.destroyed&&!response.writableEnded)json(response,503,{error:'Retained childcare evidence is unavailable or incompatible. No data was acquired or rebuilt.'});}
 finally{clearTimeout(timer);request.removeListener?.('aborted',disconnect);response.removeListener?.('close',disconnect);controller.signal.removeEventListener('abort',rejectAbort);}
}
