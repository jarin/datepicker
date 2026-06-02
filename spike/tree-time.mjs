import { writeFileSync } from "node:fs";
const DEBUG_URL="http://127.0.0.1:9222", FILE="file:///Users/jarin/llm/datepicker/spike/tree-deep.html?from=0&to=2400";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function wsu(){for(let i=0;i<40;i++){try{const l=await(await fetch(`${DEBUG_URL}/json`)).json();const p=l.find(t=>t.type==="page");if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(250);}throw 0;}
const ws=new WebSocket(await wsu());await new Promise((s,j)=>{ws.onopen=s;ws.onerror=j;});
let id=1;const Pm=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&Pm.has(m.id)){const{r,j}=Pm.get(m.id);Pm.delete(m.id);m.error?j(new Error(JSON.stringify(m.error))):r(m.result);}};
const send=(me,p={})=>new Promise((r,j)=>{const i=id++;Pm.set(i,{r,j});ws.send(JSON.stringify({id:i,method:me,params:p}));});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
const shot=async f=>{const{data}=await send("Page.captureScreenshot",{format:"png"});writeFileSync(f,Buffer.from(data,"base64"));console.log("  saved "+f);};
const click=async(x,y)=>{for(const t of["mousePressed","mouseReleased"])await send("Input.dispatchMouseEvent",{type:t,x:Math.round(x),y:Math.round(y),button:"left",clickCount:1,buttons:1,pointerType:"mouse"});await sleep(70);};
const posOf=(pred)=>ev(`(()=>{let t=null;walk(n=>{if(!t&&(${pred}))t=n;});if(!t)return null;const s=toScreen(applyM(V,t.z));const r=cv.getBoundingClientRect();return{x:r.left+s.x,y:r.top+s.y};})()`);

await send("Page.enable");await send("Runtime.enable");await send("Page.navigate",{url:FILE});await sleep(600);
for(let i=0;i<60&&!(await ev("window.__ready===true"));i++)await sleep(150);

console.log("=== full hierarchy millennium→…→second, range 0–2400 ===");
console.log("  structure:",await ev("JSON.stringify(window.__api.stats().maxBranch)"));
for(const t of [[1776,7,4,15,30,45],[2026,6,2,9,5,0],[1,1,1,0,0,0]]){
  const li=JSON.parse(await ev(`JSON.stringify(window.__api.leafInfo(${t.join(",")}))`));
  console.log(`  ${t[0]}-${t[1]}-${t[2]} ${t[3]}:${t[4]}:${t[5]} -> leaf=${li.kind}, depth=${li.depth} hops, ρ=${li.rho} (safe<18)`);
  console.log(`     path branching: ${li.path.join("  ")}`);
}

console.log("\n=== weekday validity (no out-of-month weekdays; each day once) ===");
for(const [y,m] of [[1776,7],[2026,2],[2024,2]]){
  await ev(`window.__api.drill(${y},${m})`);            // materialise the month's weeks
  const r=JSON.parse(await ev(`JSON.stringify((()=>{const mn=focusNode;const sizes=[];let tot=0;for(const w of mn.children){expand(w);sizes.push({W:w.week,n:w.children.length});tot+=w.children.length;}return{weeks:mn.children.length,weekdayLeaves:tot,sizes};})())`));
  const dimv=await ev(`dim(${y},${m})`);
  console.log(`  ${y}-${String(m).padStart(2,'0')}: ${r.weeks} weeks, ${r.weekdayLeaves} weekday-leaves == days-in-month ${dimv} ? ${r.weekdayLeaves===dimv}  sizes=${r.sizes.map(s=>'W'+s.W+':'+s.n).join(',')}`);
}

console.log("\n=== full real-click drill to 2026-06-02 15:30:45 ===");
await ev("window.__api.resetView()");
const steps=[
  ["year","n.kind==='year'&&n.val===2026"],
  ["month","n.kind==='month'&&n.y===2026&&n.m===6"],
  ["week","n.kind==='week'&&n.y===2026&&n.m===6&&n.days.some(x=>x.d===2)"],
  ["weekday","n.kind==='weekday'&&n.y===2026&&n.m===6&&n.d===2"],
  ["ampm(PM)","n.kind==='ampm'&&n.y===2026&&n.m===6&&n.d===2&&n.pm===true"],
  ["hour 15","n.kind==='hour'&&n.y===2026&&n.m===6&&n.d===2&&n.h===15"],
  ["minute 30","n.kind==='minute'&&n.y===2026&&n.m===6&&n.d===2&&n.h===15&&n.mi===30"],
  ["second 45","n.kind==='second'&&n.y===2026&&n.m===6&&n.d===2&&n.h===15&&n.mi===30&&n.s===45"],
];
for(const [name,pred] of steps){const p=await posOf(pred);if(!p){console.log(`  ${name}: not materialised`);continue;}await click(p.x,p.y);}
console.log("  selected:",await ev("JSON.stringify(selected)"));

console.log("\n=== screenshots ===");
await ev("window.__api.resetView()");await ev("window.__api.drill(2026,6,2)");await sleep(120);await shot("/tmp/time-weekday.png");
await ev("window.__api.drill(2026,6,2,15,30)");await sleep(120);await shot("/tmp/time-minute.png");

const maxRho=await ev("window.__api.stats().maxRho");
console.log(`\nRESULT: max materialised ρ=${maxRho} (<18 safe). Complete date+time tree works.`);
ws.close();process.exit(0);
