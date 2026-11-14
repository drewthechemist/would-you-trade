import {getStore} from '@netlify/blobs';
import {createHash} from 'node:crypto';
const store=()=>getStore('would-you-trade');
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,20);
const day=()=>new Date().toISOString().slice(0,10);
const DAY=86400000;
const ALLOWED_SPORTS=new Set(['basketball','football','baseball']);
// Longer, more specific set names must precede their shorter parent names.
const SETS=[
 'Bowman Chrome','Topps Chrome','Donruss Optic','Panini Prizm','Panini Select',
 'Panini Mosaic','Topps Finest','Bowman Draft','Bowman','Topps Update',
 'Topps Heritage','Topps','Donruss','Optic','Prizm','Select','Mosaic',
 'Upper Deck','Fleer Ultra','Fleer','SkyBox','Hoops'
];
const CANONICAL={
 'panini prizm':'Prizm','panini select':'Select','panini mosaic':'Mosaic',
 'optic':'Donruss Optic'
};
const BLOCKED=/\b(refractor|silver|gold|green|blue|red|purple|orange|pink|wave|shimmer|parallel|auto(?:graph)?|signed|signature|patch|numbered|lot|reprint|replica|proxy|custom|variation|variant|negative|sepia|xfractor|hyper|disco|pulsar|scope|fast break|choice|insert|draft picks|holo|hologram|laser|cracked ice|ice|sparkle|shimmer|velocity|checkerboard|die.cut|printing plate|superfractor|atomic|sapphire|mini|short print|ssp|sp|image variation|photo variation|one.of.one|1\/1)\b|\b\d+\s*\/\s*\d+\b/i;
const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const normSpace=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
function findSet(title){
 for(const name of SETS){
  if(new RegExp('(?:^|[^a-z])'+escapeRegExp(name).replace(/\\ /g,'\\s+')+'(?=$|[^a-z])','i').test(title))return CANONICAL[name.toLowerCase()]||name;
 }
 return null;
}
function cardNumber(title){
 // Do not guess card identity if the listing doesn't explicitly identify its number.
 return title.match(/(?:#|\b(?:card|no\.?|number)\s*#?\s*)([A-Z]{0,3}-?\d{1,4}[A-Z]?)\b/i)?.[1]?.toUpperCase()||null;
}
function normalize(r){
 const title=String(r.title||'').trim(),name=String(r.name||'').trim(),year=String(r.year||'').trim();
 const sport=String(r.sport||'').toLowerCase().trim();
 const grader=String(r.grader||'').toUpperCase().trim(),grade=String(r.grade||'').trim();
 const price=Number(r.price),date=String(r.date||'').slice(0,10),image=String(r.imageUrl||'');
 const set=findSet(title),number=cardNumber(title),t=Date.parse(date+'T00:00:00Z');
 if(!ALLOWED_SPORTS.has(sport)||!name||!set||!number||!/^\d{4}$/.test(year)||!['PSA','BGS','SGC'].includes(grader)||!/^\d+(?:\.5)?$/.test(grade)||!Number.isFinite(price)||price<10||price>1000000||!Number.isFinite(t)||Date.now()-t>180*DAY||t>Date.now()+DAY||!image.startsWith('https://')||BLOCKED.test(title))return null;
 const normalizedTitle=normSpace(title),normalizedName=normSpace(name);
 if(!(' '+normalizedTitle+' ').includes(' '+normalizedName+' ')||!new RegExp('(?:^|\\D)'+escapeRegExp(year)+'(?:\\D|$)').test(title)||!new RegExp('\\b'+grader+'\\s*'+escapeRegExp(grade)+'(?![\\d.])','i').test(title))return null;
 // The listing must identify the expected set explicitly, not merely a parent product.
 const id=[sport,year,set.toLowerCase(),name.toLowerCase(),number,grader,grade].join('|');
 return {id,saleId:String(r.id||r.source||''),name,sport,set,card:`${year} ${set} #${number}`,grade:`${grader} ${grade}`,price,date,image,title};
}
const median=arr=>{const a=[...arr].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2};
function candidates(rows){
 const groups=new Map(),seen=new Set();
 for(const row of rows){const r=normalize(row);if(!r||!r.saleId||seen.has(r.saleId))continue;seen.add(r.saleId);if(!groups.has(r.id))groups.set(r.id,[]);groups.get(r.id).push(r)}
 const out=[];
 for(const [id,sales] of groups){if(sales.length<3)continue;const mid=median(sales.map(x=>x.price));const clean=sales.filter(x=>x.price>=mid*.65&&x.price<=mid*1.35);if(clean.length<3)continue;clean.sort((a,b)=>b.date.localeCompare(a.date));const recent=clean.slice(0,10);out.push({...recent[0],id,value:median(recent.map(x=>x.price)),comps:recent.length})}
 return out;
}
async function generate(s,when){
 if(!/^20\d\d-\d\d-\d\d$/.test(when)||Number.isNaN(Date.parse(when)))return {ok:false,reason:'Invalid date'};
 const id='daily-'+when,existing=await s.get('matchup:'+id,{type:'json'});
 if(existing)return {ok:true,id,alreadyExists:true};
 const pool=await s.get('auto:pool',{type:'json'})||[],cards=candidates(pool),used=await s.get('auto:used',{type:'json'})||[];
 const recent=new Set(used.filter(x=>{const age=Date.parse(when)-Date.parse(x.date);return age>=0&&age<30*DAY}).flatMap(x=>x.cards));
 const options=[];
 for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
  const a=cards[i],b=cards[j];if(a.name.toLowerCase()===b.name.toLowerCase()||recent.has(a.id)||recent.has(b.id))continue;
  const ratio=Math.max(a.value,b.value)/Math.min(a.value,b.value);if(ratio>1.15)continue;
  options.push({a,b,score:(ratio-1)*100+2/Math.min(a.comps,b.comps)});
 }
 options.sort((a,b)=>a.score-b.score);
 if(!options.length)return {ok:false,reason:'No eligible matchup: need two different players with three comparable recent sales each, matching base-card identities, images, and values within 15%.',eligibleCards:cards.length};
 const pick=options[0],card=x=>({name:x.name,card:x.card,grade:x.grade,value:x.value,image:x.image,comps:x.comps,saleDate:x.date,sport:x.sport});
 const match={id,title:'Daily Trade • '+when,left:card(pick.a),right:card(pick.b),date:when,automatic:true};
 await s.setJSON('matchup:'+id,match);
 const index=await s.get('matchup-index',{type:'json'})||[];
 await s.setJSON('matchup-index',[id,...index.filter(x=>x!==id)].slice(0,365));
 await s.setJSON('auto:used',[...used,{date:when,cards:[pick.a.id,pick.b.id]}].slice(-90));
 return {ok:true,id,eligibleCards:cards.length,eligiblePairs:options.length};
}
export default async req=>{
 try{
  const token=process.env.ADMIN_TOKEN;
  if(!token||req.headers.get('authorization')!==`Bearer ${token}`)return reply({error:'Unauthorized'},401);
  const url=new URL(req.url),s=store();
  if(req.method==='POST'&&url.searchParams.get('action')==='import'){
   const body=await req.json();if(!Array.isArray(body.sales)||body.sales.length>10000)return reply({error:'Expected sales array (max 10000)'},400);
   const previous=await s.get('auto:pool',{type:'json'})||[];
   const merged=new Map();for(const r of [...previous,...body.sales]){if(normalize(r))merged.set(String(r.id||r.source),r)}
   const pool=[...merged.values()].slice(-10000);await s.setJSON('auto:pool',pool);
   return reply({ok:true,received:body.sales.length,accepted:pool.length,eligibleCards:candidates(pool).length});
  }
  if(req.method==='POST'&&url.searchParams.get('action')==='generate')return reply(await generate(s,url.searchParams.get('date')||day()));
  return reply({error:'Not found'},404);
 }catch(e){console.error('Automation error',e);return reply({error:'Automation error'},500)}
};
export const config={path:'/api/auto'};
