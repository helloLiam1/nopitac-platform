import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9251;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { if (this.ws) this.ws.close(); }
}

async function run() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank'
  ]);

  await sleep(1500);
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const tabs = await res.json();
  const client = new CDPClient(tabs[0].webSocketDebuggerUrl);
  await client.connect();

  await client.send('Page.enable');
  await client.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(800);

  // Clear session to ensure we are on entry screen
  await client.send('Runtime.evaluate', { expression: `localStorage.clear()` });
  await client.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(1200);

  // 1. Capture Full Form of Nopitac during typing intro (e.g. frame 130 in comp_1 -> root frame 260)
  console.log('--- 1. Testing Full Form of Nopitac ---');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      window.anim.goToAndStop(320, true);
    })()`
  });
  await sleep(100);
  const shotFullForm = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/entry_full_form_palette.png', Buffer.from(shotFullForm.data, 'base64'));
  console.log('Saved entry_full_form_palette.png');

  // 2. Test the 4 stages in exact order:
  // Stage 0: Red (#f5003a) at frame 800
  // Stage 1: Blue (#6a76ff) at frame 1100
  // Stage 2: Green (#27ff83) at frame 1400
  // Stage 3: Yellow (#d8ff2a) at frame 1600
  const stagesToTest = [
    { name: 'stage0_red', frame: 800, expectedColor: '#f5003a' },
    { name: 'stage1_blue', frame: 1100, expectedColor: '#6a76ff' },
    { name: 'stage2_green', frame: 1400, expectedColor: '#27ff83' },
    { name: 'stage3_yellow', frame: 1600, expectedColor: '#d8ff2a' }
  ];

  for (const s of stagesToTest) {
    const stageData = await client.send('Runtime.evaluate', {
      expression: `(() => {
        window.anim.goToAndStop(${s.frame}, true);
        const accentVar = getComputedStyle(document.documentElement).getPropertyValue('--current-accent-color').trim();
        return {
          frame: ${s.frame},
          accentVar: accentVar
        };
      })()`,
      returnByValue: true
    });
    console.log(`Stage check [${s.name}]:`, stageData.result.value);

    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/entry_${s.name}.png`, Buffer.from(shot.data, 'base64'));
  }

  client.close();
  chrome.kill();
  console.log('=== PALETTE VERIFICATION COMPLETE ===');
}

run();
