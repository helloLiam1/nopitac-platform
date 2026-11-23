import { spawn } from 'child_process';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9227;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

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

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('Launching headless Chrome...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1440,900'
  ]);

  await sleep(1500);

  try {
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
    const tabs = await listRes.json();
    const tab = tabs[0];
    console.log('Connecting to tab:', tab.webSocketDebuggerUrl);

    const client = new CDPClient(tab.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    const consoleLogs = [];
    client.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push(msg.params.args.map(a => a.value || a.description).join(' '));
      }
    });

    console.log('Navigating to http://localhost:5173/home.html ...');
    await client.send('Page.navigate', { url: 'http://localhost:5173/home.html' });

    // Screenshot at 1.0s (intro animation typing)
    await sleep(1000);
    const snap1 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/lottie_step_1s.png', Buffer.from(snap1.data, 'base64'));
    console.log('Captured: lottie_step_1s.png');

    // Screenshot at 2.6s (frame morph / red wipe)
    await sleep(1600);
    const snap2 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/lottie_step_2_6s.png', Buffer.from(snap2.data, 'base64'));
    console.log('Captured: lottie_step_2_6s.png');

    // Wait until animation completes (t=3.8s total)
    await sleep(1200);
    const snap3 = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/lottie_final_interactive.png', Buffer.from(snap3.data, 'base64'));
    console.log('Captured: lottie_final_interactive.png');

    // Verify console logs
    console.log('Console logs:', consoleLogs);

    client.close();
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);

