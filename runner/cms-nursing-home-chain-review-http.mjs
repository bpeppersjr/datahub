const allowed=new Set(['chain_id','ccn','offset','limit']);
const canonicalInteger=value=>value==='0'||/^[1-9]\d{0,4}$/.test(value);
export async function cmsNursingHomeChainReviewHttp(request,response,url,review,json,signal){
 if(request.method!=='GET'){json(response,405,{error:'Method not allowed.'});return;}
 const hasBody=request.headers?.['transfer-encoding']!==undefined||request.headers?.['content-length']!==undefined&&request.headers['content-length']!=='0'||request.readableLength>0;
 if(hasBody){response.setHeader?.('Connection','close');json(response,400,{error:'Nursing-home chain review requests must have an empty body.'});return;}
 request.resume?.();
 if([...url.searchParams.keys()].some(key=>!allowed.has(key)||url.searchParams.getAll(key).length!==1)){json(response,400,{error:'Unsupported or repeated nursing-home chain review option.'});return;}
 const chainId=url.searchParams.get('chain_id')??undefined,ccn=url.searchParams.get('ccn')??undefined;
 const offsetText=url.searchParams.get('offset'),limitText=url.searchParams.get('limit');
 if(chainId!==undefined&&!/^\d{1,64}$/.test(chainId)||ccn!==undefined&&!/^[A-Za-z0-9]{6}$/.test(ccn)||offsetText!==null&&!canonicalInteger(offsetText)||limitText!==null&&!/^[1-9]\d{0,2}$/.test(limitText)){json(response,400,{error:'Nursing-home chain review selection is invalid.'});return;}
 try{json(response,200,await review({chainId,ccn,offset:offsetText===null?0:Number(offsetText),limit:limitText===null?50:Number(limitText),signal}));}
 catch(error){if(response.destroyed)return;json(response,error?.statusCode===400?400:error?.name==='AbortError'?499:503,{error:error?.statusCode===400?'Nursing-home chain review selection is invalid.':error?.name==='AbortError'?'Nursing-home chain review request was cancelled.':'Retained nursing-home chain assertions failed verification.'});}
}
