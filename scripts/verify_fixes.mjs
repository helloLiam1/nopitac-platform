import { spawn } from 'child_process';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9226;

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

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1440,900',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  try {
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then(r => r.json());
        if (res) break;
      } catch (e) {}
    }

    const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json());
    const pageTarget = targets.find(t => t.type === 'page');
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

    await client.send('Page.navigate', { url: 'http://localhost:5173/board.html' });
    await sleep(800);

    console.log('=== TEST 1: Corner Transition (Top -> Right Edge) ===');
    // Scroll across top-right corner from 810 to 840
    for (let s = 815; s <= 835; s += 5) {
      const state = await client.evaluate(`(() => {
        const mgr = window.__nopitacBoardButtons;
        mgr.targetScrollOffset = ${s};
        mgr.scrollOffset = ${s};
        mgr.update();
        const ap = mgr.addPersonComponent;
        const box = ap.widget.getBoundingClientRect();
        return {
          scroll: ${s},
          edge: ap.edge,
          className: ap.widget.className,
          styleLeft: ap.widget.style.left,
          styleRight: ap.widget.style.right,
          styleTop: ap.widget.style.top,
          box: { x: Math.round(box.x), y: Math.round(box.y), right: Math.round(box.right), width: Math.round(box.width), height: Math.round(box.height) }
        };
      })()`);
      console.log(JSON.stringify(state));
      if (state.edge === 'right') {
        if (state.box.right !== 1440) {
          throw new Error(`FAIL: Button not attached to right edge at scroll ${s}! box.right is ${state.box.right}`);
        }
        if (state.box.width > 35) {
          throw new Error(`FAIL: Button morphed/stretched at corner! width is ${state.box.width}`);
        }
      }
    }
    console.log('PASS: Corner transition cleanly snaps without morphing or jumping.\n');

    console.log('=== TEST 2: Right Edge Button Click & Expand Attachment ===');
    // On right edge at scroll 850
    const frameData = await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      mgr.targetScrollOffset = 850;
      mgr.scrollOffset = 850;
      mgr.update();
      
      const ap = mgr.addPersonComponent;
      const history = [];
      const origRender = ap.renderBorderPointsFor.bind(ap);
      ap.renderBorderPointsFor = function(w, h) {
        origRender(w, h);
        const box = ap.widget.getBoundingClientRect();
        const pts = ap.borderLine ? ap.borderLine.getAttribute('points') : '';
        const rightPointMatch = pts.match(/([0-9.]+) 0.7500$/);
        const rightPointX = rightPointMatch ? parseFloat(rightPointMatch[1]) : null;
        history.push({
          box_width: +box.width.toFixed(2),
          box_right: +box.right.toFixed(2),
          svg_rightX: rightPointX ? +rightPointX.toFixed(2) : null,
          gap_to_box_edge: rightPointX ? +(box.width - rightPointX).toFixed(2) : null,
          screen_right_edge: rightPointX ? +(box.left + rightPointX).toFixed(2) : null
        });
      };
      ap.open();
      return new Promise(resolve => {
        setTimeout(() => resolve(history), 500);
      });
    })()`);

    console.table(frameData.slice(0, 15));
    for (const row of frameData) {
      if (Math.abs(row.screen_right_edge - 1440) > 0.1) {
        throw new Error(`FAIL: Screen right edge moved! Value is ${row.screen_right_edge}`);
      }
    }
    console.log('PASS: screen_right_edge is 1440.00 across ALL frames (gap = 0.00)! ZERO BOUNCE!\n');

    console.log('=== TEST 3: Animation Timing (<= 750ms total) ===');
    const timingInfo = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const layers = ap.widget.querySelectorAll('.add-person-layer');
      const results = [];
      layers.forEach((layer, idx) => {
        const style = window.getComputedStyle(layer);
        const delaySec = parseFloat(style.transitionDelay);
        const durSec = parseFloat(style.transitionDuration);
        results.push({
          layer: idx + 1,
          delaySec,
          durSec,
          endSec: +(delaySec + durSec).toFixed(3)
        });
      });
      return results;
    })()`);
    console.log('Layer timings:');
    console.table(timingInfo);

    const maxEndSec = Math.max(...timingInfo.map(t => t.endSec));
    console.log(`Max animation end time: ${maxEndSec}s (${maxEndSec * 1000}ms)`);
    if (maxEndSec > 0.751) {
      throw new Error(`FAIL: Animation exceeds 750ms limit! End time is ${maxEndSec * 1000}ms`);
    }
    console.log('PASS: All layers complete within 750ms!\n');

    console.log('=== TEST 4: Top Edge Expansion Near Corner ===');
    // Close button, scroll to top edge at 815 (near corner), then click open
    await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      mgr.addPersonComponent.close(true);
      mgr.targetScrollOffset = 815;
      mgr.scrollOffset = 815;
      mgr.update();
      mgr.addPersonComponent.open();
    })()`);
    await sleep(450);

    const topState = await client.evaluate(`(() => {
      const ap = window.__nopitacBoardButtons.addPersonComponent;
      const box = ap.widget.getBoundingClientRect();
      return {
        edge: ap.edge,
        box: { x: Math.round(box.x), right: Math.round(box.right), width: Math.round(box.width) }
      };
    })()`);
    console.log('Top edge near corner expanded:', JSON.stringify(topState));
    if (topState.box.right > 1440) {
      throw new Error(`FAIL: Top edge expanded button overflows screen! box.right is ${topState.box.right}`);
    }
    console.log('PASS: Top edge expansion stays within viewport boundaries!\n');

    client.close();
  } finally {
    chromeProc.kill('SIGTERM');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

