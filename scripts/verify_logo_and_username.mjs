import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9239;

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
    await sleep(1000);

    console.log('=== TEST 1: Bottom Black Line Removal ===');
    const bottomLineExists = await client.evaluate(`!!document.querySelector('.board-bottom-line')`);
    console.log('Bottom line exists in DOM:', bottomLineExists);
    if (bottomLineExists) {
      throw new Error('FAIL: .board-bottom-line was expected to be removed!');
    }
    console.log('PASS: Bottom black line is completely removed from DOM.');

    console.log('\n=== TEST 2: Logo Position & Geometry ===');
    const logoInfo = await client.evaluate(`
      (() => {
        const el = document.getElementById('boardLogo');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          bottom: r.bottom,
          distFromBottom: 900 - r.bottom,
          width: r.width,
          height: r.height,
          svgExists: !!el.querySelector('svg.board-logo-svg')
        };
      })()
    `);
    console.log('Logo info:', logoInfo);
    if (!logoInfo) throw new Error('FAIL: #boardLogo not found in DOM!');
    if (!logoInfo.svgExists) throw new Error('FAIL: logo svg missing inside #boardLogo!');
    if (Math.abs(logoInfo.left - 27.99) > 0.5) {
      throw new Error(`FAIL: Expected logo left ~27.99px, got ${logoInfo.left}`);
    }
    if (Math.abs(logoInfo.distFromBottom - 28.77) > 0.5) {
      throw new Error(`FAIL: Expected logo bottom ~28.77px from screen bottom, got ${logoInfo.distFromBottom}`);
    }
    if (Math.abs(logoInfo.width - 131.52) > 0.5 || Math.abs(logoInfo.height - 49.88) > 0.5) {
      throw new Error(`FAIL: Expected logo size ~131.52x49.88px, got ${logoInfo.width}x${logoInfo.height}`);
    }
    console.log('PASS: Logo geometry and location match Illustrator template!');

    console.log('\n=== TEST 3: User Badge & Typography ===');
    const badgeInfo = await client.evaluate(`
      (() => {
        const badge = document.getElementById('boardUserBadge');
        if (!badge) return null;
        const by = badge.querySelector('.board-user-by');
        const name = badge.querySelector('.board-user-name');
        const rBadge = badge.getBoundingClientRect();
        const rBy = by.getBoundingClientRect();
        const rName = name.getBoundingClientRect();
        const styleBy = window.getComputedStyle(by);
        const styleName = window.getComputedStyle(name);

        return {
          badge: {
            left: rBadge.left,
            right: rBadge.right,
            distFromRight: 1440 - rBadge.right,
            distFromBottom: 900 - rBadge.bottom,
            width: rBadge.width,
            height: rBadge.height
          },
          by: {
            left: rBy.left,
            right: rBy.right,
            text: by.textContent,
            fontFamily: styleBy.fontFamily,
            fontSize: styleBy.fontSize,
            fontWeight: styleBy.fontWeight
          },
          name: {
            left: rName.left,
            right: rName.right,
            distFromRight: 1440 - rName.right,
            text: name.textContent,
            fontFamily: styleName.fontFamily,
            fontSize: styleName.fontSize,
            fontWeight: styleName.fontWeight
          },
          leftAlignmentDiff: Math.abs(rBy.left - rName.left)
        };
      })()
    `);
    console.log('User Badge info:', JSON.stringify(badgeInfo, null, 2));
    if (!badgeInfo) throw new Error('FAIL: #boardUserBadge not found in DOM!');
    if (Math.abs(badgeInfo.badge.distFromRight - 28) > 0.5) {
      throw new Error(`FAIL: Expected badge right ~28px, got ${badgeInfo.badge.distFromRight}`);
    }
    if (Math.abs(badgeInfo.name.distFromRight - 28) > 0.5) {
      throw new Error(`FAIL: Expected username right-aligned to 28px margin, got ${badgeInfo.name.distFromRight}`);
    }
    if (badgeInfo.leftAlignmentDiff > 0.5) {
      throw new Error(`FAIL: "by" is not left-aligned with username! diff = ${badgeInfo.leftAlignmentDiff}px`);
    }
    if (badgeInfo.by.fontSize !== '18px' || badgeInfo.name.fontSize !== '18px') {
      throw new Error(`FAIL: Expected 18px font size, got by=${badgeInfo.by.fontSize}, name=${badgeInfo.name.fontSize}`);
    }
    console.log('PASS: User badge right-alignment and "by" left-alignment verified!');

    console.log('\n=== TEST 4: Dynamic Username Adaptation (Layout Intact) ===');
    // Test with a longer name
    await client.evaluate(`window.__nopitacBoardButtons.setUsername('jonathan barnbrook')`);
    await sleep(50);
    const longNameInfo = await client.evaluate(`
      (() => {
        const badge = document.getElementById('boardUserBadge');
        const by = badge.querySelector('.board-user-by');
        const name = badge.querySelector('.board-user-name');
        const rBadge = badge.getBoundingClientRect();
        const rBy = by.getBoundingClientRect();
        const rName = name.getBoundingClientRect();
        return {
          distFromRight: 1440 - rName.right,
          leftAlignmentDiff: Math.abs(rBy.left - rName.left),
          nameWidth: rName.width,
          text: name.textContent
        };
      })()
    `);
    console.log('Long name info ("jonathan barnbrook"):', longNameInfo);
    if (Math.abs(longNameInfo.distFromRight - 28) > 0.5) {
      throw new Error(`FAIL: Long username not right-aligned to 28px! got ${longNameInfo.distFromRight}`);
    }
    if (longNameInfo.leftAlignmentDiff > 0.5) {
      throw new Error(`FAIL: "by" lost left-alignment with long username! diff = ${longNameInfo.leftAlignmentDiff}px`);
    }

    // Test with a short name
    await client.evaluate(`window.__nopitacBoardButtons.setUsername('ali')`);
    await sleep(50);
    const shortNameInfo = await client.evaluate(`
      (() => {
        const badge = document.getElementById('boardUserBadge');
        const by = badge.querySelector('.board-user-by');
        const name = badge.querySelector('.board-user-name');
        const rBadge = badge.getBoundingClientRect();
        const rBy = by.getBoundingClientRect();
        const rName = name.getBoundingClientRect();
        return {
          distFromRight: 1440 - rName.right,
          leftAlignmentDiff: Math.abs(rBy.left - rName.left),
          nameWidth: rName.width,
          text: name.textContent
        };
      })()
    `);
    console.log('Short name info ("ali"):', shortNameInfo);
    if (Math.abs(shortNameInfo.distFromRight - 28) > 0.5) {
      throw new Error(`FAIL: Short username not right-aligned to 28px! got ${shortNameInfo.distFromRight}`);
    }
    if (shortNameInfo.leftAlignmentDiff > 0.5) {
      throw new Error(`FAIL: "by" lost left-alignment with short username! diff = ${shortNameInfo.leftAlignmentDiff}px`);
    }

    // Reset back to 'henry who'
    await client.evaluate(`window.__nopitacBoardButtons.setUsername('henry who')`);
    await sleep(50);

    console.log('\n=== TEST 5: Capture Final Visual Screenshot ===');
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(
      '/Users/liamfarishta/.gemini/antigravity/brain/1908aec6-13a5-41af-93b2-5236de2ca2d4/board_logo_username_final.png',
      Buffer.from(shot.data, 'base64')
    );
    console.log('Saved artifact: board_logo_username_final.png');

    console.log('\n>>> ALL LOGO & USERNAME TESTS PASSED SUCCESSFULLY! <<<');
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

