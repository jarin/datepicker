import { writeFileSync } from "node:fs";
const DEBUG_URL = "http://127.0.0.1:9222";
const FILE = "file:///Users/jarin/llm/datepicker/spike/tiling.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try { const list = await (await fetch(`${DEBUG_URL}/json`)).json();
      const page = list.find((t) => t.type === "page"); if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  } throw new Error("no page");
}
const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) {
  const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
  m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } };
const send = (me, p = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method: me, params: p })); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };

await send("Page.enable"); await send("Runtime.enable");

const configs = [
  { p: 7, q: 3, tiles: 1200 },
  { p: 7, q: 3, tiles: 2200 },
  { p: 5, q: 4, tiles: 2200 },
  { p: 8, q: 3, tiles: 3000 },
];
const rows = [];
for (const c of configs) {
  const url = `${FILE}?p=${c.p}&q=${c.q}&tiles=${c.tiles}`;
  await send("Page.navigate", { url });
  await sleep(500);
  // wait for the 4s measurement window to finish
  for (let i = 0; i < 60; i++) { if (await ev("window.__perfReady===true")) break; await sleep(250); }
  const perf = await ev("JSON.stringify(window.__perf||null)");
  const p = JSON.parse(perf);
  rows.push(p);
  console.log(`${p.pq} tiles=${String(p.tiles).padStart(4)} drawn=${String(p.drawn).padStart(4)} ` +
    `| avg ${String(p.avgFps).padStart(5)}fps  avgMs ${p.avgMs}  p95 ${p.p95ms}ms  worst ${p.worstMs}ms`);
  // screenshot the densest one
  if (c === configs[1]) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync("/tmp/tiling.png", Buffer.from(data, "base64"));
    console.log("  (saved screenshot /tmp/tiling.png)");
  }
}
const ok = rows.every((r) => r.avgFps >= 55) ? "PASS" : (rows.every((r) => r.avgFps >= 30) ? "MARGINAL" : "FAIL");
console.log(`\nRESULT: ${ok} — rendering+Möbius navigation perf (headless; real GPU typically faster)`);
ws.close(); process.exit(0);
