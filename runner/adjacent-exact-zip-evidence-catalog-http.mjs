export async function adjacentExactZipEvidenceCatalogHttp(request,response,url,reader,json){
  const headers=request.headers??{};
  if(request.method!=='GET'||[...url.searchParams.keys()].length||headers['transfer-encoding']!==undefined||(headers['content-length']!==undefined&&headers['content-length']!=='0')){response.setHeader?.('Connection','close');json(response,400,{error:'Adjacent exact-ZIP evidence catalog requires an empty GET.'});return;}
  const controller=new AbortController();let disconnected=false;const abort=()=>{if(!response.writableEnded){disconnected=true;controller.abort();}},timer=setTimeout(()=>controller.abort(),30000);request.once?.('aborted',abort);response.once?.('close',abort);request.resume?.();
  try{if(request.aborted||response.destroyed)abort();controller.signal.throwIfAborted();const result=await reader({signal:controller.signal});controller.signal.throwIfAborted();if(!response.writableEnded&&!response.destroyed){response.setHeader?.('Cache-Control','no-store');json(response,200,result);}}
  catch{if(!disconnected&&!response.destroyed&&!response.writableEnded)json(response,503,{error:'Adjacent exact-ZIP evidence catalog is unavailable or incompatible.'});}
  finally{clearTimeout(timer);request.removeListener?.('aborted',abort);response.removeListener?.('close',abort);}
}
