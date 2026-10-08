import pin from '../config/national-status-contract.json' with { type: 'json' };

// Only the existing Host/Origin guard may call this. Browser preflight declares
// the Authorization header; protected GET requests still require its bearer.
export function nationalStatusPreflight(request,response,json) {
  const h=request.headers??{};
  if(typeof h.origin!=='string' || h['access-control-request-method']!=='GET' || String(h['access-control-request-headers']??'').trim().toLowerCase()!=='authorization' || h['transfer-encoding']!==undefined || h['content-length']!==undefined&&h['content-length']!=='0') {json(response,400,{error:'National Status preflight requires an empty GET declaration with Authorization.'});return;}
  response.setHeader('Access-Control-Allow-Methods','GET');response.setHeader('Access-Control-Allow-Headers','Authorization');response.writeHead(204);response.end();
}

export async function nationalStatusHttp(request,response,url,reader,json) {
  if(request.method!=='GET'){json(response,405,{error:'Method not allowed.'});return;}
  const kind=url.pathname.split('/').at(-1).replace('national-status-',''),key=kind==='state'?'state':kind==='zip'?'zip':null;
  const values=key?url.searchParams.getAll(key):[];
  if(!['summary','state','zip'].includes(kind) || Number(request.headers?.['content-length']??0)!==0 || request.headers?.['transfer-encoding'] || [...url.searchParams.keys()].some(k=>k!==key) || key && (values.length!==1 || (key==='state'?!Object.hasOwn(pin.state_scopes,values[0]):!/^\d{5}$/.test(values[0])))) {json(response,400,{error:'Supply an empty GET with the required single state/DC or five-digit ZIP selector.'});return;}
  const controller=new AbortController(),abort=()=>{if(!response.writableEnded)controller.abort()};request.once?.('aborted',abort);response.once?.('close',abort);
  try{const value=await reader({kind,state:key==='state'?values[0]:null,zip:key==='zip'?values[0]:null,signal:controller.signal});if(!controller.signal.aborted&&!response.destroyed)json(response,200,value);}
  catch{if(!controller.signal.aborted&&!response.destroyed)json(response,503,{error:'Verified National Status is unavailable. Existing Industry Status remains available.'});}
  finally{request.removeListener?.('aborted',abort);response.removeListener?.('close',abort);}
}
