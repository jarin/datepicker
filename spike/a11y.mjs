import { writeFileSync } from "node:fs";
const DEBUG_URL = "http://127.0.0.1:9222";
const FILE = "file:///Users/jarin/llm/datepicker/spike/tree-a11y.html?range=5";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl(){for(let i=0;i<40;i++){try{const l=await(await fetch(`${DEBUG_URL}/json`)).json();const p=l.find(t=>t.type==="page");if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(250);}throw new Error("no page");}
const ws=new WebSocket(await getWsUrl());await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=1;const pend=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){const{resolve,reject}=pend.get(m.id);pend.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}};
const send=(me,p={})=>new Promise((resolve,reject)=>{const i=id++;pend.set(i,{resolve,reject});ws.send(JSON.stringify({id:i,method:me,params:p}));});
const ev=async(x)=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
const KEYS={ArrowDown:[40,'ArrowDown'],ArrowUp:[38,'ArrowUp'],ArrowRight:[39,'ArrowRight'],ArrowLeft:[37,'ArrowLeft'],Enter:[13,'Enter']};
async function key(name){const[vk,code]=KEYS[name];
  await send("Input.dispatchKeyEvent",{type:"keyDown",key:name,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});
  await send("Input.dispatchKeyEvent",{type:"keyUp",key:name,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});
  await sleep(6);}

await send("Page.enable");await send("Runtime.enable");await send("DOM.enable");
await send("Page.navigate",{url:FILE});await sleep(500);
for(let i=0;i<40&&!(await ev("window.__ready===true"));i++)await sleep(150);

console.log("=== ARIA audit ===");
await ev("window.__a11y.resetFocus()");
const aria=JSON.parse(await ev("JSON.stringify(window.__a11y.ariaInfo())"));
console.log("  "+JSON.stringify(aria));

console.log("\n=== keyboard-only selection (no mouse) ===");
const NOW=2026,FIRST=NOW-5;
const yearIdx=[-5,-3,0,1,5], days=[[1,15],[3,10],[6,2],[12,25]];
const samples=[]; for(const yi of yearIdx)for(const[m,d]of days)samples.push({y:NOW+yi,m,d});
samples.push({y:2028,m:2,d:29});
let hits=0,totalKeys=0,worst=0;
for(const t of samples){
  await ev("window.__a11y.resetFocus()");      // focus = first year
  let n=0;
  for(let i=0;i<(t.y-FIRST);i++){await key("ArrowDown");n++;}   // to target year
  await key("ArrowRight");n++;                                   // into months (focus Jan)
  for(let i=0;i<(t.m-1);i++){await key("ArrowDown");n++;}        // to target month
  await key("ArrowRight");n++;                                   // into days (focus day 1)
  for(let i=0;i<(t.d-1);i++){await key("ArrowDown");n++;}        // to target day
  await key("Enter");n++;                                        // select
  const sel=JSON.parse(await ev("JSON.stringify(window.__a11y.selected())"));
  const ok=sel&&sel.y===t.y&&sel.m===t.m&&sel.d===t.d; hits+=ok?1:0;
  totalKeys+=n; worst=Math.max(worst,n);
}
console.log(`  selected ${hits}/${samples.length} by keyboard alone`);
console.log(`  keystrokes: avg ${(totalKeys/samples.length).toFixed(0)}, worst ${worst}  (flat date input baseline: ~3)`);
const af=JSON.parse(await ev("JSON.stringify(window.__a11y.ariaInfo())"));
console.log(`  after select: aria-selected count=${af.selectedCount}, focus is activeElement=${af.focusIsActiveElement}, live="${af.live}"`);

console.log("\n=== touch target size (a month focused) ===");
const px=await ev("window.__a11y.dayTargetPx(2026,6)");
console.log(`  min adjacent day spacing when June 2026 is focused: ${px}px  (WCAG min 24px, comfy touch 44px)`);
{const{data}=await send("Page.captureScreenshot",{format:"png"});writeFileSync("/tmp/tree-a11y.png",Buffer.from(data,"base64"));console.log("  saved /tmp/tree-a11y.png");}

const pass = hits===samples.length && aria.treeRole==="tree" && aria.focusedRole==="treeitem";
console.log(`\nRESULT: ${pass?"PASS":"FAIL"} — accessible via parallel ARIA tree + keyboard; selection 100% keyboard-only.`);
console.log(`  Caveat (honest): interaction cost is far above a normal picker, and the canvas itself stays aria-hidden.`);
ws.close();process.exit(0);
