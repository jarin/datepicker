import { writeFileSync } from "node:fs";
const DEBUG_URL = "http://127.0.0.1:9222";
const FILE = "file:///Users/jarin/llm/datepicker/spike/tree.html?range=5";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<40;i++){try{const l=await(await fetch(`${DEBUG_URL}/json`)).json();const p=l.find(t=>t.type==="page");if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error("no page");}
const ws=new WebSocket(await getWsUrl()); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=1;const pend=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}};
const send=(me,p={})=>new Promise((resolve,reject)=>{const i=id++;pend.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method:me,params:p}));});
const ev=async(x)=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
const shot=async(f)=>{const{data}=await send("Page.captureScreenshot",{format:"png"});writeFileSync(f,Buffer.from(data,"base64"));console.log("  saved "+f);};
const click=async(x,y)=>{for(const type of["mousePressed","mouseReleased"])await send("Input.dispatchMouseEvent",{type,x:Math.round(x),y:Math.round(y),button:"left",clickCount:1,buttons:1,pointerType:"mouse"});};

await send("Page.enable");await send("Runtime.enable");
await send("Page.navigate",{url:FILE});await sleep(500);
for(let i=0;i<40&&!(await ev("window.__ready===true"));i++)await sleep(150);
console.log(`tree: ${await ev("window.__api.nodes")} nodes, ${await ev("window.__api.leaves")} day-leaves (±5y)`);

console.log("drill-down screenshots:");
await ev("window.__api.resetView()"); await sleep(150); await shot("/tmp/tree-root.png");
await ev("window.__api.recenterOnYear(2026)"); await sleep(150); await shot("/tmp/tree-year.png");
await ev("window.__api.recenterOnMonth(2026,6)"); await sleep(150); await shot("/tmp/tree-month.png");

// selection correctness
const NOW=2026, yearIdx=[-5,-3,-1,0,1,3,5], days=[[1,15],[4,1],[6,2],[9,20],[12,25]];
const samples=[]; for(const yi of yearIdx)for(const[m,d]of days)samples.push({y:NOW+yi,m,d});
samples.push({y:2028,m:2,d:29},{y:2024,m:2,d:29});
const sel=()=>ev("JSON.stringify(window.__api.selected())");
const same=(s,t)=>s&&s.y===t.y&&s.m===t.m&&s.d===t.d;
let direct=0,drill=0;
for(const t of samples){
  // DIRECT from the root view
  await ev("window.__api.resetView()");
  const s=JSON.parse(await ev(`JSON.stringify(window.__api.screenOf(${t.y},${t.m},${t.d}))`));
  await click(s.x,s.y); if(same(JSON.parse(await sel()),t))direct++;
  // DRILL: year -> month -> day (the intended interaction), then click the day
  await ev("window.__api.resetView()");
  await ev(`window.__api.recenterOnYear(${t.y})`);
  await ev(`window.__api.recenterOnMonth(${t.y},${t.m})`);
  await ev(`window.__api.recenterOnDate(${t.y},${t.m},${t.d})`);
  const s2=JSON.parse(await ev(`JSON.stringify(window.__api.screenOf(${t.y},${t.m},${t.d}))`));
  await click(s2.x,s2.y); if(same(JSON.parse(await sel()),t))drill++;
}
const pct=(n)=>`${((100*n)/samples.length).toFixed(0)}%`;
console.log(`\nselection over ${samples.length} dates (incl. both leap days):`);
console.log(`  via DRILL (year→month→day, then click): ${pct(drill)}  <-- the intended interaction`);
console.log(`  DIRECT from root (one click, no drill):  ${pct(direct)}`);
console.log(`\nRESULT: ${drill===samples.length?"PASS":"FAIL"} — hierarchical drill resolves every date.`);
ws.close();process.exit(0);
