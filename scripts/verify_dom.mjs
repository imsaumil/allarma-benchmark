// Headless-Chrome DOM verifier (Phase C), zero npm deps. Speaks CDP over a
// hand-rolled RFC6455 WebSocket on Node's built-in net. Loads the dashboard,
// captures console errors + uncaught exceptions, runs optional interaction
// steps, then prints a JSON probe of the rendered retrieval section. Usage:
//   node scripts/verify_dom.mjs '<json-instructions>'
// instructions = { steps?: [ {click?:selector}|{eval?:jsExpr}, wait? ], probe: jsExpr }
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:8012/';
const PORT = 9222 + Math.floor(Math.random() * 600);
const instr = JSON.parse(process.argv[2] || '{"probe":"1"}');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
async function waitPort(p) {
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise((res) => {
      const s = net.connect(p, '127.0.0.1');
      s.on('connect', () => { s.end(); res(true); });
      s.on('error', () => res(false));
    });
    if (ok) return; await sleep(100);
  }
  throw new Error('CDP port never opened');
}

// ---- Minimal WebSocket client (client-to-server frames masked, text only) ----
class WS {
  constructor(wsUrl) {
    const u = new global.URL(wsUrl);
    this.handlers = [];
    this.buf = Buffer.alloc(0);
    this.ready = new Promise((resolve, reject) => {
      this.sock = net.connect(Number(u.port), u.hostname, () => {
        const key = crypto.randomBytes(16).toString('base64');
        this.sock.write(
          `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
          `Host: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      let handshakeDone = false;
      this.sock.on('data', (chunk) => {
        if (!handshakeDone) {
          this.buf = Buffer.concat([this.buf, chunk]);
          const idx = this.buf.indexOf('\r\n\r\n');
          if (idx === -1) return;
          handshakeDone = true;
          this.buf = this.buf.subarray(idx + 4);
          resolve();
          this._drain();
        } else {
          this.buf = Buffer.concat([this.buf, chunk]);
          this._drain();
        }
      });
      this.sock.on('error', reject);
    });
  }
  _drain() {
    while (this.buf.length >= 2) {
      const b1 = this.buf[1];
      let len = b1 & 0x7f; let off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (this.buf.length < off + len) return;
      const payload = this.buf.subarray(off, off + len).toString('utf8');
      this.buf = this.buf.subarray(off + len);
      try { const m = JSON.parse(payload); this.handlers.forEach((h) => h(m)); } catch {}
    }
  }
  send(obj) {
    const data = Buffer.from(JSON.stringify(obj));
    const len = data.length;
    let header;
    const mask = crypto.randomBytes(4);
    if (len < 126) { header = Buffer.from([0x81, 0x80 | len]); }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
    this.sock.write(Buffer.concat([header, mask, masked]));
  }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.sock.destroy(); } catch {} }
}

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/cdp-ret-' + PORT,
  URL,
], { stdio: 'ignore' });

(async () => {
  await waitPort(PORT);
  await sleep(300);
  const targets = await getJSON('/json');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WS(page.webSocketDebuggerUrl);
  await ws.ready;

  let mid = 1; const pending = new Map(); const errors = [];
  ws.on((m) => {
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const ed = m.params.exceptionDetails;
      errors.push('EXC: ' + (ed.exception?.description || ed.text));
    }
  });
  const send = (method, params) => new Promise((resolve) => {
    const id = mid++; pending.set(id, resolve); ws.send({ id, method, params });
  });

  await send('Runtime.enable');
  await send('Page.enable');
  for (let i = 0; i < 80; i++) {
    const r = await send('Runtime.evaluate', { expression: 'window.DASHBOARD_DATA && DASHBOARD_DATA.loaded===true', returnByValue: true });
    if (r.result?.result?.value === true) break;
    await sleep(150);
  }
  await sleep(400);

  for (const step of (instr.steps || [])) {
    if (step.click) {
      await send('Runtime.evaluate', { expression: `(document.querySelector(${JSON.stringify(step.click)})||{click(){}}).click()` });
    } else if (step.eval) {
      await send('Runtime.evaluate', { expression: step.eval });
    }
    await sleep(step.wait || 300);
  }

  const probe = await send('Runtime.evaluate', {
    expression: `(function(){try{return JSON.stringify(${instr.probe});}catch(e){return 'PROBE_ERR:'+e.message;}})()`,
    returnByValue: true,
  });

  console.log(JSON.stringify({ consoleErrors: errors, probe: probe.result?.result?.value }, null, 2));
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error('VERIFY FAIL:', e.message); try { chrome.kill(); } catch {} process.exit(1); });
