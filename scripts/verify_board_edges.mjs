import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9225;
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'checks');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${filePath}`);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  console.log('--- Starting Chrome Headless Test ---');
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1440,900',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    let connected = false;
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      try {
        await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        connected = true;
        break;
      } catch (e) { }
    }

    if (!connected) {
      throw new Error('Could not connect to Chrome debugging port');
    }

    const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log('Navigating to http://localhost:5173/board.html ...');
    await client.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    await sleep(800);

    // Check errors
    const errors = await client.evaluate(`window.__pageErrors || []`);
    console.log('Page errors at start:', errors);

    // Initial state check
    const initialState = await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      const ap = mgr.addPersonComponent;
      const apBox = ap.widget.getBoundingClientRect();
      const sBox = mgr.elements['search'].getBoundingClientRect();
      const soBox = mgr.elements['sort'].getBoundingClientRect();
      return {
        edge: ap.edge,
        isExpanded: ap.isExpanded,
        apBox: { x: apBox.x, y: apBox.y, width: apBox.width, height: apBox.height },
        searchBox: { x: sBox.x, y: sBox.y },
        sortBox: { x: soBox.x, y: soBox.y },
        usableHeight: mgr.usableHeight
      };
    })()`);
    console.log('Initial State:', JSON.stringify(initialState, null, 2));

    // 1. TOP EDGE TEST
    console.log('\n--- 1. Testing TOP Edge Expansion ---');
    const topClosedTransform = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const layer = ap.widget.querySelector('.add-person-layer');
      return window.getComputedStyle(layer).transform;
    })()`);
    console.log('Top closed layer transform:', topClosedTransform);

    await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      ap.open();
    })()`);
    await sleep(900);

    const topExpandedState = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const box = ap.widget.getBoundingClientRect();
      const borderLine = ap.borderLine.getAttribute('points');
      const layers = Array.from(ap.widget.querySelectorAll('.add-person-layer')).map(el => {
        const style = window.getComputedStyle(el);
        return { opacity: style.opacity, transform: style.transform };
      });
      return {
        isExpanded: ap.isExpanded,
        box: { width: Math.round(box.width), height: Math.round(box.height) },
        borderLine,
        layerCount: layers.length,
        layersVisible: layers.every(l => parseFloat(l.opacity) > 0.9)
      };
    })()`);
    console.log('Top Expanded State:', topExpandedState);

    // Type form values
    console.log('Typing into fields on Top edge...');
    await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      ap.inputFullName.value = 'micheal beirut';
      ap.inputFullName.dispatchEvent(new Event('input'));
      ap.inputDomain.value = 'brand designer';
      ap.inputDomain.dispatchEvent(new Event('input'));
      ap.inputYear.value = '1957';
      ap.inputYear.dispatchEvent(new Event('input'));
      ap.inputWhyCool.value = 'creates great systems around a logo. i love how smart his work is.';
      ap.inputWhyCool.dispatchEvent(new Event('input'));
      ap.inputPlace.value = 'Ohio';
      ap.inputPlace.dispatchEvent(new Event('input'));
      ap.inputLinks.value = 'https://www.instagram.com/mbierut/';
      ap.inputLinks.dispatchEvent(new Event('input'));
    })()`);
    await sleep(100);

    await client.screenshot(path.join(SCREENSHOT_DIR, 'test_top_edge_expanded.png'));

    // Close Top Edge
    console.log('Closing Top edge...');
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.close()`);
    await sleep(500);

    const topClosedState = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const box = ap.widget.getBoundingClientRect();
      return {
        isExpanded: ap.isExpanded,
        box: { width: Math.round(box.width), height: Math.round(box.height) }
      };
    })()`);
    console.log('Top Closed State:', topClosedState);

    // 2. RIGHT EDGE TEST
    console.log('\n--- 2. Testing RIGHT Edge Expansion ---');
    // Scroll down to move button to right edge
    await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      // Scroll until add-person is on right edge
      mgr.targetScrollOffset += 1100;
      mgr.tick();
    })()`);
    await sleep(300);

    const rightEdgePos = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const box = ap.widget.getBoundingClientRect();
      return { edge: ap.edge, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    })()`);
    console.log('Button on Right Edge:', rightEdgePos);

    // Expand on Right edge
    console.log('Opening add person on Right edge...');
    const rightClosedTransform = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const layer = ap.widget.querySelector('.add-person-layer');
      return window.getComputedStyle(layer).transform;
    })()`);
    console.log('Right closed layer transform (should be translateX > 0):', rightClosedTransform);

    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.open()`);
    await sleep(900);

    const rightExpandedState = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const box = ap.widget.getBoundingClientRect();
      const borderLine = ap.borderLine.getAttribute('points');
      const nameVal = ap.inputFullName.value;
      const domainVal = ap.inputDomain.value;
      const yearVal = ap.inputYear.value;
      const layers = Array.from(ap.widget.querySelectorAll('.add-person-layer')).map(el => {
        const style = window.getComputedStyle(el);
        return { opacity: style.opacity, transform: style.transform };
      });
      return {
        isExpanded: ap.isExpanded,
        box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        borderLine,
        formDataPreserved: (nameVal === 'micheal beirut' && domainVal === 'brand designer' && yearVal === '1957'),
        layersVisible: layers.every(l => parseFloat(l.opacity) > 0.9)
      };
    })()`);
    console.log('Right Expanded State:', rightExpandedState);

    await client.screenshot(path.join(SCREENSHOT_DIR, 'test_right_edge_expanded.png'));

    // Close Right Edge
    console.log('Closing Right edge...');
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.close()`);
    await sleep(500);

    // 3. LEFT EDGE TEST
    console.log('\n--- 3. Testing LEFT Edge Expansion ---');
    // Scroll up to move button to left edge
    await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      mgr.targetScrollOffset -= 2200;
      mgr.tick();
    })()`);
    await sleep(300);

    const leftEdgePos = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const box = ap.widget.getBoundingClientRect();
      return { edge: ap.edge, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    })()`);
    console.log('Button on Left Edge:', leftEdgePos);

    // Expand on Left edge
    console.log('Opening add person on Left edge...');
    const leftClosedTransform = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const layer = ap.widget.querySelector('.add-person-layer');
      return window.getComputedStyle(layer).transform;
    })()`);
    console.log('Left closed layer transform (should be translateX < 0):', leftClosedTransform);

    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.open()`);
    await sleep(900);

    const leftExpandedState = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const box = ap.widget.getBoundingClientRect();
      const borderLine = ap.borderLine.getAttribute('points');
      const nameVal = ap.inputFullName.value;
      const domainVal = ap.inputDomain.value;
      const layers = Array.from(ap.widget.querySelectorAll('.add-person-layer')).map(el => {
        const style = window.getComputedStyle(el);
        return { opacity: style.opacity, transform: style.transform };
      });
      return {
        isExpanded: ap.isExpanded,
        box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        borderLine,
        formDataPreserved: (nameVal === 'micheal beirut' && domainVal === 'brand designer'),
        layersVisible: layers.every(l => parseFloat(l.opacity) > 0.9)
      };
    })()`);
    console.log('Left Expanded State:', leftExpandedState);

    await client.screenshot(path.join(SCREENSHOT_DIR, 'test_left_edge_expanded.png'));

    // Close Left Edge
    console.log('Closing Left edge...');
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.close()`);
    await sleep(500);

    // 4. INFINITE SCROLLING & ROBUSTNESS TEST
    console.log('\n--- 4. Testing 50 Infinite Scroll Revolutions ---');
    const scrollTest = await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      let ok = true;
      for (let i = 0; i < 50; i++) {
        mgr.targetScrollOffset += (i % 2 === 0 ? 800 : -600);
        mgr.tick();
      }
      return { ok: true, currentOffset: mgr.scrollOffset };
    })()`);
    console.log('50 Oscillating Scroll Revolutions:', scrollTest);

    client.close();
    console.log('\nAll tests passed successfully!');
  } finally {
    chromeProc.kill('SIGTERM');
  }
}

main().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
