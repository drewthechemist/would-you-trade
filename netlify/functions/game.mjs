import {getStore} from '@netlify/blobs';
import {createHash,randomUUID} from 'node:crypto';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const store=()=>getStore({name:'would-you-trade'});
const initial=[
{id:'lebron-wade',title:'Legends of 2003',left:{name:'LeBron James',card:'2003 Topps Chrome #111',grade:'PSA 9',value:1800,image:''},right:{name:'Dwyane Wade',card:'2003 Topps Chrome #115',grade:'PSA 10',value:1750,image:''}},
{id:'curry-durant',title:'Modern Icons',left:{name:'Stephen Curry',card:'2009 Topps #321',grade:'PSA 9',value:900,image:''},right:{name:'Kevin Durant',card:'2007 Topps Chrome #131',grade:'PSA 9',value:875,image:''}},
{id:'jordan-kobe',title:'All-Time Greats',left:{name:'Michael Jordan',card:'1986 Fleer #57',grade:'PSA 5',value:4200,image:''},right:{name:'Kobe Bryant',card:'1996 Topps Chrome #138',grade:'PSA 9',value:4100,image:''}}
];
const hash=s=>createHash('sha256').update(s).digest('hex');
const admin=req=>{const token=process.env.ADMIN_TOKEN;return Boolean(token&&req.headers.get('authorization')===`Bearer ${token}`)};
const read=async(s,k)=>await s.get(k,{type:'json'});
const validate=m=>{if(!m||typeof m.id!=='string'||!/^[a-z0-9-]{3,70}$/.test(m.id)||typeof m.title!=='string'||m.title.length>120)return false;for(const c of [m.left,m.right]){if(!c||!['name','card','grade'].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<=140)||!Number.isFinite(c.value)||c.value<=0||typeof c.image!=='string'||c.image.length>1000||c.image&&!/^https:\/\//.test(c.image))return false}return Math.max(m.left.value,m.right.value)/Math.min(m.left.value,m.right.value)<=1.15};
export default async(req)=>{try{
const s=store(),url=new URL(req.url),method=req.method;
if(method==='GET'&&url.searchParams.get('action')==='list'){let ids=await read(s,'matchup-index');if(!ids){ids=[];await s.setJSON('matchup-index',ids)}const matches=(await Promise.all(ids.map(id=>read(s,'matchup:'+id)))).filter(Boolean);return json({matches:matches.map(({id,title,left,right})=>({id,title,left,right}))});}
if(method==='GET'&&url.searchParams.get('action')==='results'){const id=url.searchParams.get('id');if(!id)return json({error:'Missing id'},400);const m=await read(s,'matchup:'+id);if(!m)return json({error:'Not found'},404);const votes=await read(s,'votes:'+id)||{left:0,right:0};return json({votes,total:votes.left+votes.right});}
if(method==='POST'&&url.searchParams.get('action')==='vote'){
const {id,side}=await req.json();if(!/^[a-z0-9-]{3,70}$/.test(id||'')||!['left','right'].includes(side))return json({error:'Invalid vote'},400);if(!await read(s,'matchup:'+id))return json({error:'Not found'},404);
const cookie=req.headers.get('cookie')||'';const raw=cookie.match(/(?:^|;\s*)wyt_device=([a-f0-9-]{36})/)?.[1]||randomUUID();const voter=hash(raw+':'+id);const voteKey='voter:'+id+':'+voter;const previous=await read(s,voteKey);if(previous)return json({error:'Already voted on this matchup'},409);
// Blobs are eventually consistent: low-traffic MVP storage, not atomic ballot accounting.
await s.setJSON(voteKey,{side,at:Date.now()});const counts=await read(s,'votes:'+id)||{left:0,right:0};counts[side]++;await s.setJSON('votes:'+id,counts);
const res=json({votes:counts,total:counts.left+counts.right});res.headers.append('set-cookie',`wyt_device=${raw}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);return res;}
if(method==='POST'&&url.searchParams.get('action')==='admin'){
if(!admin(req))return json({error:'Unauthorized'},401);const m=await req.json();if(!validate(m))return json({error:'Invalid matchup. Values must be within 15% and images must be HTTPS URLs.'},400);let ids=await read(s,'matchup-index')||initial.map(x=>x.id);if(!ids.includes(m.id))ids=[m.id,...ids];await s.setJSON('matchup:'+m.id,m);await s.setJSON('matchup-index',ids);return json({ok:true});}
return json({error:'Not found'},404);
}catch(e){console.error(e);return json({error:'Server error'},500)}};
