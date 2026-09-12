import {CREDENTIAL_COVERAGE_CATEGORIES, CREDENTIAL_COVERAGE_STATES} from './credential-coverage.mjs';

const invalid = () => Object.assign(new Error('Unsupported credential heatmap request.'), {statusCode:400});
export function credentialHeatmapQuery(parameters) {
  const filters={};
  for(const [key,value] of parameters) {
    if(!['state','category'].includes(key)||Object.hasOwn(filters,key)) throw invalid();
    if(!(key==='state'?CREDENTIAL_COVERAGE_STATES:CREDENTIAL_COVERAGE_CATEGORIES).includes(value)) throw invalid();
    filters[key]=value;
  }
  return filters;
}

/** Called only after the shared local control-plane authentication guard. */
export async function credentialHeatmapHttp(request,response,url,view,json) {
  const controller=new AbortController();
  const disconnected=()=>{if(!response.writableEnded)controller.abort();};
  request.once('aborted',disconnected);response.once('close',disconnected);
  try {
    if(!['GET','POST'].includes(request.method)) {json(response,405,{error:'Credential heatmap accepts GET or POST only.'});return;}
    const filters=credentialHeatmapQuery(url.searchParams);
    // POST means explicit recheck; filters live in the closed query, not a body.
    // Reject framing before consumption: an async iterator's early exit destroys
    // IncomingMessage, and waiting for an unended chunked body can hang forever.
    const headers=request.headers??{};
    if(headers['transfer-encoding']!==undefined||headers['content-length']!==undefined&&headers['content-length']!=='0') {
      response.setHeader?.('Connection','close');
      json(response,400,{error:'Credential heatmap requests must have an empty body.'});
      return;
    }
    request.resume();
    if(request.aborted||response.destroyed)controller.abort();
    controller.signal.throwIfAborted();
    const value=await view.get(filters,{signal:controller.signal,recheck:request.method==='POST'});
    if(!controller.signal.aborted&&!response.destroyed)json(response,200,value);
  } catch(error) {
    if(controller.signal.aborted||response.destroyed)return;
    json(response,error.statusCode===400?400:503,{error:error.statusCode===400?'Unsupported credential heatmap request.':'Credential heatmap evidence is unavailable. Recheck explicitly.'});
  } finally {request.removeListener('aborted',disconnected);response.removeListener('close',disconnected);}
}
