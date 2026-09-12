/** Authenticated caller only. Fixed read-only request, bounded response lifetime. */
export async function handleNationalReportingTen(request,response,url,read,json){
 if(request.method!=='GET'){json(response,405,{error:'Ten-source representation is read-only.'});return;}
 const headers=request.headers??{};
 if(url.search||headers['transfer-encoding']!==undefined||headers['content-length']!==undefined&&headers['content-length']!=='0'){response.setHeader('Connection','close');json(response,400,{error:'Ten-source representation accepts no query or body.'});return;}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000),disconnect=()=>controller.abort();let rejectAbort;
 const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('Read aborted.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
 aborted.catch(()=>{}); // A pre-aborted request can exit before entering the race.
 request.once('aborted',disconnect);response.once('close',disconnect);request.resume();
 try {if(request.aborted||response.destroyed)controller.abort();controller.signal.throwIfAborted();const result=await Promise.race([read({signal:controller.signal}),aborted]);controller.signal.throwIfAborted();if(!response.destroyed)json(response,200,result);}
 catch {if(!response.destroyed)json(response,503,{error:'Ten-source representation could not finish within its read boundary.'});}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',rejectAbort);request.removeListener('aborted',disconnect);response.removeListener('close',disconnect);}
}
