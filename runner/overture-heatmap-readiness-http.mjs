export async function overtureHeatmapReadinessHttp(request,response,loader,json){
 if(request.method!=='GET'){json(response,405,{error:'Method not allowed.'});return;}
 try{json(response,200,await loader());}
 catch{json(response,503,{error:'Retained Overture readiness evidence could not be verified. No source data was admitted.'});}
}
