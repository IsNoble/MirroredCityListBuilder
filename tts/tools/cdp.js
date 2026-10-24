// Usage: Code.exe cdp.js <page-url> <page-script.js>
const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path"); const os = require("os");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 9400 + Math.floor(Math.random()*400);
const udd = fs.mkdtempSync(path.join(os.tmpdir(), "edge-cdp-"));
const url = process.argv[2]; const pageScript = fs.readFileSync(process.argv[3], "utf8");
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let targets = null;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  if (!targets) { console.log("edge did not start"); edge.kill(); process.exit(1); }
  const t = targets.find(x => x.type === "page");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = {};
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url });
  await sleep(1500);
  const res = await send("Runtime.evaluate", { expression: pageScript, awaitPromise: true, returnByValue: true });
  if (res.result.exceptionDetails) console.log("PAGE EXCEPTION:", JSON.stringify(res.result.exceptionDetails, null, 1));
  else console.log(typeof res.result.result.value === "string" ? res.result.result.value : JSON.stringify(res.result.result.value, null, 1));
  ws.close(); edge.kill(); await sleep(300);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();
