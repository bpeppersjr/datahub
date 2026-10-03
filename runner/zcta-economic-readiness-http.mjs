export async function zctaEconomicReadinessHttp(request,response,url,reader,json){
 const zctas=url.searchParams.getAll('zcta'),headers=request.headers??{};
 if(request.method!=='GET'||zctas.length!==1||[...url.searchParams.keys()].some(key=>key!=='zcta')||!/^\d{5}$/.test(zctas[0])||headers['transfer-encoding']!==undefined||headers['content-length']!==undefined&&headers['content-length']!=='0'){
  response.setHeader?.('Connection','close');json(response,400,{error:'Readiness lookup requires one exact five-digit ZCTA on an empty GET.'});return;
 }
 const controller=new AbortController();let disconnected=false,rejectAbort;const abort=()=>{if(!response.writableEnded){disconnected=true;controller.abort();}};
 const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('Readiness lookup aborted.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});aborted.catch(()=>{});
 const timer=setTimeout(()=>controller.abort(),30000);request.once?.('aborted',abort);response.once?.('close',abort);request.resume?.();
 try{if(request.aborted||response.destroyed)abort();controller.signal.throwIfAborted();const result=await Promise.race([reader({zcta:zctas[0],signal:controller.signal}),aborted]);controller.signal.throwIfAborted();if(!response.writableEnded&&!response.destroyed){response.setHeader?.('Cache-Control','no-store');json(response,200,result);}}
 catch{if(!disconnected&&!response.destroyed&&!response.writableEnded)json(response,503,{error:'ZCTA readiness evidence is unavailable or incompatible.'});}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',rejectAbort);request.removeListener?.('aborted',abort);response.removeListener?.('close',abort);}
}
