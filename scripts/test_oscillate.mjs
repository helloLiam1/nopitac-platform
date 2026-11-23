import { spawn } from 'child_process';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9227;

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
    this.onEvent = null;
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
        } else if (msg.method && this.onEvent) {
          this.onEvent(msg.method, msg.params);
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

    let errorCount = 0;
    pageClient.onEvent = (method, params) => {
      if (method === 'Runtime.exceptionThrown' || (method === 'Runtime.consoleAPICalled' && params.type === 'error')) {
        errorCount++;
        console.error('Error caught:', JSON.stringify(params));
      }
    };

    await pageClient.connect();
    await pageClient.send('Runtime.enable');

    await sleep(1000);

    console.log('Oscillating directly over corner transition boundaries 50 times...');
    for (let i = 0; i < 50; i++) {
      const dy = (i % 2 === 0) ? 60 : -60;
      await pageClient.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 720,
        y: 450,
        deltaX: 0,
        deltaY: dy
      });
      await sleep(20);
    }

    await sleep(500);

    console.log('Oscillation test completed. Total errors:', errorCount);
    if (errorCount > 0) {
      process.exit(1);
    }

    pageClient.close();
    client.close();
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

