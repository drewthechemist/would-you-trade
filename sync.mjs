// Pull verified sales from a separately deployed CompQuest API without exposing secrets to browsers.
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function sync(){
 const source=process.env.COMPQUEST_EXPORT_URL,token=process.env.COMPQUEST_BRIDGE_TOKEN,admin=process.env.ADMIN_TOKEN;
 const base=process.env.URL||process.env.DEPLOY_PRIME_URL;
 if(!source||!token||!admin||!base)throw Error('Missing COMPQUEST_EXPORT_URL, COMPQUEST_BRIDGE_TOKEN, ADMIN_TOKEN or URL');
 const url=new URL(source);
 if(url.protocol!=='https:')throw Error('Export URL must be HTTPS');
 const r=await fetch(url,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error(`CompQuest export returned HTTP ${r.status}`);
 const payload=await r.json();if(!Array.isArray(payload.sales))throw Error('CompQuest export must return {sales:[]}');
 const target=await fetch(new URL('/api/auto?action=import',base),{method:'POST',headers:{authorization:`Bearer ${admin}`,'content-type':'application/json'},body:JSON.stringify({sales:payload.sales}),signal:AbortSignal.timeout(20000)});
 if(!target.ok)throw Error(`Would You Trade import returned HTTP ${target.status}`);
 return await target.json();
}
export default async req=>{try{if(req.method!=='POST')return json({error:'Method not allowed'},405);if(!process.env.ADMIN_TOKEN||req.headers.get('authorization')!==`Bearer ${process.env.ADMIN_TOKEN}`)return json({error:'Unauthorized'},401);return json({ok:true,import:await sync()});}catch(e){console.error('Sync failed',e);return json({error:'Sync failed',detail:String(e.message)},500)}};
export const config={path:'/api/sync'};
