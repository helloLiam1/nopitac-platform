import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9224;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const data = await res.json();
      if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Chrome remote debugging not ready');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank'
  ]);

  try {
    const wsUrl = await getWsUrl();
    const client = new CDPClient(wsUrl);
    await client.connect();

    const { targetId } = await client.send('Target.createTarget', { url: 'http://localhost:5173/board.html' });
    const targetWsUrl = `ws://127.0.0.1:${PORT}/devtools/page/${targetId}`;
    const pageClient = new CDPClient(targetWsUrl);
    await pageClient.connect();

    await pageClient.send('Page.enable');
    await pageClient.send('DOM.enable');
    await pageClient.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await sleep(1500);

    // Open Add Person
    await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const widget = document.querySelector('.add-person-widget');
          widget.querySelector('.add-person-header').click();
        })()
      `
    });
    await sleep(600);

    // Type into inputs
    await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const nameInput = document.querySelector('input[data-field="name"]');
          const domainInput = document.querySelector('input[data-field="domain"]');
          const yearInput = document.querySelector('input[data-field="year"]');
          
          if (nameInput) {
            nameInput.value = 'micheal beirut';
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (domainInput) {
            domainInput.value = 'brand designer';
            domainInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (yearInput) {
            yearInput.value = '1957';
            yearInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `
    });
    await sleep(300);

    const filledScreenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_state_filled_form.png', Buffer.from(filledScreenshot.data, 'base64'));
    console.log('Saved board_state_filled_form.png');

    // Close form by clicking done
    await pageClient.send('Runtime.evaluate', {
      expression: `
        (() => {
          const doneBtn = document.querySelector('.done-action-btn');
          if (doneBtn) doneBtn.click();
        })()
      `
    });
    await sleep(500);

    // Scroll more
    await pageClient.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 720,
      y: 450,
      deltaX: 0,
      deltaY: 800
    });
    await sleep(600);

    const postClosedScreenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_state_post_close_scrolled.png', Buffer.from(postClosedScreenshot.data, 'base64'));
    console.log('Saved board_state_post_close_scrolled.png');

    pageClient.close();
    client.close();
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

