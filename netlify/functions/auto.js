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
const DAILY_COUNT=5;
const COOLDOWN_DAYS=Number(process.env.SHOWDOWN_REUSE_DAYS||2);
async function generate(s,when){
 if(!/^20\d\d-\d\d-\d\d$/.test(when)||new Date(when+'T00:00:00Z').toISOString().slice(0,10)!==when)return {ok:false,reason:'Invalid date'};
 const pool=await s.get('auto:pool',{type:'json'})||[],cards=candidates(pool);
 const used=await s.get('auto:used',{type:'json'})||[];
 const existingIndex=await s.get('matchup-index',{type:'json'})||[];
 const prefix='daily-'+when;
 const ids=[prefix,...Array.from({length:DAILY_COUNT},(_,i)=>prefix+'-'+(i+1))];
 const found=(await Promise.all(ids.map(id=>s.get('matchup:'+id,{type:'json'})))).filter(Boolean);
 const chosen=new Set();
 for(const m of found){if(Array.isArray(m.cardIds))m.cardIds.forEach(id=>chosen.add(id));else for(const side of [m.left,m.right]){const match=cards.find(c=>c.name===side?.name&&c.card===side?.card&&c.grade===side?.grade);if(match)chosen.add(match.id)}}
 const recent=new Set(used.filter(x=>{const age=Date.parse(when)-Date.parse(x.date);return age>=0&&age<COOLDOWN_DAYS*DAY}).flatMap(x=>x.cards||[]));
 const allPairs=[];
 for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
  const a=cards[i],b=cards[j];
  if(a.name.toLowerCase()===b.name.toLowerCase())continue;
  const ratio=Math.max(a.value,b.value)/Math.min(a.value,b.value);
  if(ratio>1.15)continue;
  allPairs.push({a,b,score:(ratio-1)*100+2/Math.min(a.comps,b.comps)});
 }
 // Prefer fresh cards, but fall back to older cards when the small pool cannot support five battles.
 allPairs.sort((a,b)=>a.score-b.score);
 const newMatches=[];
 const slots=found.length?ids.filter(id=>!found.some(m=>m.id===id)).slice(0,DAILY_COUNT-found.length):ids.slice(1);
 // A legacy daily-YYYY-MM-DD matchup counts as one of the five; otherwise use numbered IDs.
 const targetIds=found.length?slots:ids.slice(1);
 const card=x=>({name:x.name,card:x.card,grade:x.grade,value:x.value,image:x.image,comps:x.comps,saleDate:x.date,sport:x.sport});
 for(const id of targetIds){
  const options=allPairs.filter(p=>!chosen.has(p.a.id)&&!chosen.has(p.b.id));
  if(!options.length)break;
  const pick=options.find(p=>!recent.has(p.a.id)&&!recent.has(p.b.id))||options[0];
  chosen.add(pick.a.id);chosen.add(pick.b.id);
  const match={id,title:'Daily Showdown • '+when,left:card(pick.a),right:card(pick.b),date:when,automatic:true,cardIds:[pick.a.id,pick.b.id]};
  await s.setJSON('matchup:'+id,match);newMatches.push(match);
 }
 if(newMatches.length){
  await s.setJSON('matchup-index',[...newMatches.map(m=>m.id),...existingIndex.filter(id=>!newMatches.some(m=>m.id===id))].slice(0,500));
  await s.setJSON('auto:used',[...used,...newMatches.map(m=>({date:when,cards:m.cardIds}))].slice(-300));
 }
 const generated=found.length+newMatches.length;
 return {ok:generated>0,date:when,generated,created:newMatches.length,alreadyExists:found.length,eligibleCards:cards.length,eligiblePairs:allPairs.length,complete:generated>=DAILY_COUNT,reason:generated<DAILY_COUNT?'Not enough distinct eligible pairs for five battles; no duplicate cards within generated battles.':undefined};
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
