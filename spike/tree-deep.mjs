import { writeFileSync } from "node:fs";
const DEBUG_URL = "http://127.0.0.1:9222";
const FILE = "file:///Users/jarin/llm/datepicker/spike/tree-deep.html?from=0&to=2400";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<40;i++){try{const l=await(await fetch(`${DEBUG_URL}/json`)).json();const p=l.find(t=>t.type==="page");if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error("no page");}
const ws=new WebSocket(await getWsUrl());await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=1;const pend=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}};
const send=(me,p={})=>new Promise((resolve,reject)=>{const i=id++;pend.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method:me,params:p}));});
const ev=async(x)=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
const shot=async(f)=>{const{data}=await send("Page.captureScreenshot",{format:"png"});writeFileSync(f,Buffer.from(data,"base64"));console.log("  saved "+f);};

await send("Page.enable");await send("Runtime.enable");
await send("Page.navigate",{url:FILE});await sleep(600);
for(let i=0;i<60&&!(await ev("window.__ready===true"));i++)await sleep(150);

console.log("=== structure for 0–2400 (full AD/CE: millennium→century→decade→year→month→day) ===");
const st=JSON.parse(await ev("JSON.stringify(window.__api.stats())"));
console.log("  skeleton counts:", JSON.stringify(st.counts));
console.log("  max branching per level:", JSON.stringify(st.maxBranch));

for(const [y,m,d] of [[1,1,1],[33,4,3],[1776,7,4],[2400,12,25]]){
  const lr=JSON.parse(await ev(`JSON.stringify(window.__api.leafRho(${y},${m},${d}))`));
  const ba=JSON.parse(await ev(`JSON.stringify(window.__api.branchAlong(${y},${m},${d}))`));
  console.log(`  ${String(y).padStart(4,'0')}-${m}-${d}: depth=${lr.depth} hops, leaf ρ=${lr.rho} (|z|=${lr.absz}; safe ρ≲18, collapse ~22)`);
  console.log(`     branching: ${ba.map(x=>x.kind+":"+x.children).join("  ")}  -> worst keystrokes ≈ ${ba.reduce((a,x)=>a+x.children,0)}`);
}

const px=await ev("window.__api.dayTargetPx(1776,7)");
console.log(`  day touch spacing at month focus: ${px}px (limited by the ~30-day fan, not the range; a 'week' level would lift it)`);

const RAD=274, r=Math.tanh(0.85), circ=2*Math.PI*r*RAD, nYears=2401;
console.log(`\n=== vs a FLAT fan of all ${nYears} years off the root ===`);
console.log(`  year target spacing ≈ ${(circ/nYears).toFixed(2)}px (utterly unclickable); keyboard worst ≈ ${nYears} presses`);
console.log(`  grouped: ≤~12 per grouping level → ~6 shallow hops regardless of range.`);

console.log("\n=== drill-down screenshots (1 Jan AD 1) ===");
await ev("window.__api.resetView()");await sleep(150);await shot("/tmp/deep-root.png");            // 0s / 1000s / 2000s
console.log("   root millennia: "+await ev("JSON.stringify(window.__api.stats().counts)"));
await ev("window.__api.recenterOnNode('mill',0)");await sleep(150);await shot("/tmp/deep-mill0.png"); // centuries of the 0s
await ev("window.__api.recenterOnNode('year',1)");await sleep(150);await shot("/tmp/deep-year1.png"); // months of AD 1
await ev("window.__api.recenterOnDate(1,1,1)");await sleep(150);await shot("/tmp/deep-day1.png");      // 1 Jan AD 1

const safe = st.maxRho < 18;
console.log(`\nRESULT: ${safe?"PASS":"FAIL"} — full AD/CE (0–2400, ${nYears} yrs) fits: max ρ=${st.maxRho} (<18 safe), branching ≤~31, ~6 shallow hops.`);
ws.close();process.exit(0);
