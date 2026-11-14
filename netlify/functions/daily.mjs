// Sync first, then generate. Failure stops publishing rather than using stale/fictional data.
export default async()=>{
 const base=process.env.URL||process.env.DEPLOY_PRIME_URL;
 if(!base||!process.env.ADMIN_TOKEN)throw Error('Missing URL or ADMIN_TOKEN');
 const auth={authorization:'Bearer '+process.env.ADMIN_TOKEN};
 const sync=await fetch(new URL('/api/sync',base),{method:'POST',headers:auth});
 const syncBody=await sync.json();console.log('CompQuest sync',syncBody);
 if(!sync.ok)throw Error('CompQuest sync failed: '+JSON.stringify(syncBody));
 const r=await fetch(new URL('/api/auto?action=generate',base),{method:'POST',headers:auth});
 const result=await r.json();console.log('Daily trade generation',result);
 if(!r.ok||!result.ok)throw Error(JSON.stringify(result));
};
export const config={schedule:'0 9 * * *'};
