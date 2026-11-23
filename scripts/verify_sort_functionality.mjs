import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9243;
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'checks');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) =>
  new Promise((res, rej) =>
    http
      .get(u, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on('error', rej)
  );

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.cbs = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.id && this.cbs.has(m.id)) {
          const p = this.cbs.get(m.id);
          this.cbs.delete(m.id);
          m.error ? p.rej(m.error) : p.res(m.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((res, rej) => {
      this.cbs.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  }
  async shot(filename) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const out = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    console.log('Saved:', out);
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  const proc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=/tmp/chrome_verify_sort_${Date.now()}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  let failures = 0;
  const assert = (ok, msg) => {
    if (!ok) {
      console.error('FAIL:', msg);
      failures++;
    } else {
      console.log('PASS:', msg);
    }
  };

  try {
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      try {
        await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        break;
      } catch {}
    }
    const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const cdp = new CDP(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/board.html' });

    for (let i = 0; i < 40; i++) {
      await sleep(150);
      if (await cdp.ev('Boolean(window.__nopitacBoardButtons?.sortComponent)')) break;
    }
    await sleep(350);

    // Open Sort Panel
    await cdp.ev(`window.__nopitacBoardButtons.sortComponent.open();`);
    await sleep(480);

    // TEST 1: Sort by Name (A -> Z from inner circle outward)
    console.log('\n--- TEST 1: Sort by Name (A -> Z inner to outer) ---');
    await cdp.ev(`document.querySelector('#sortWidget [data-group="sortBy"][data-option="name"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
    await sleep(250);
    const byName = await cdp.ev(`(() => {
      const cc = window.__nopitacBoardButtons.concentricCircles;
      const rings = cc.rings.map(r => r.names);
      const flat = rings.flat();
      const sorted = [...flat].sort((a, b) => a.localeCompare(b));
      const allBlack = Array.from(document.querySelectorAll('.concentric-name-group')).every(g => g.getAttribute('fill') === '#000000');
      return { rings, isAZ: JSON.stringify(flat) === JSON.stringify(sorted), allBlack };
    })()`);
    console.log('Sort by Name rings:', byName.rings);
    assert(byName.isAZ, 'Names are strictly A -> Z from inner circle to outer circle');
    assert(byName.allBlack, 'All names remain black in sort-by-name mode');
    await cdp.shot('44_sort_by_name_az.png');

    // TEST 2: Sort by Domains (clubbed continuously across circles + colored in domain colors)
    console.log('\n--- TEST 2: Sort by Domains (clubbed + domain colors) ---');
    await cdp.ev(`document.querySelector('#sortWidget [data-group="sortBy"][data-option="domains"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
    await sleep(300);
    const byDomains = await cdp.ev(`(() => {
      const cc = window.__nopitacBoardButtons.concentricCircles;
      const rings = cc.rings.map(r => r.names.map(n => ({ name: n, domain: cc.people.get(n)?.domain })));
      const flatDomains = rings.flat().map(x => x.domain);
      // Verify domains are strictly clubbed (each domain appears in exactly 1 contiguous run)
      const seenFinished = new Set();
      let prev = null;
      let isContiguous = true;
      for (const d of flatDomains) {
        if (d !== prev) {
          if (prev !== null) seenFinished.add(prev);
          if (seenFinished.has(d)) isContiguous = false;
          prev = d;
        }
      }
      const hasSharedRing = rings.some(r => new Set(r.map(x => x.domain)).size > 1);
      const colorsByDomain = {};
      document.querySelectorAll('.concentric-name-group').forEach(g => {
        colorsByDomain[g.getAttribute('data-domain')] = g.getAttribute('fill');
      });
      return { rings, isContiguous, hasSharedRing, colorsByDomain };
    })()`);
    console.log('Sort by Domains colors (green bg):', byDomains.colorsByDomain);
    console.log('Ring 1 domains:', byDomains.rings[1]?.map(x => `${x.name} (${x.domain})`));
    assert(byDomains.isContiguous, 'People in the same domain are clubbed contiguously together');
    assert(byDomains.hasSharedRing, 'Next domain starts immediately on the same circle (not forced onto a separate circle)');
    assert(
      byDomains.colorsByDomain['copywriters'] === '#d8ff2a' &&
      byDomains.colorsByDomain['music composers'] === '#f5003a' &&
      byDomains.colorsByDomain['web designer'] === '#6a76ff' &&
      byDomains.colorsByDomain['artists'] === '#000000',
      'Other domains colored in true domain colors, active bg domain rendered in crisp black'
    );
    await cdp.shot('45_sort_by_domains_green_bg.png');

    // Click stefan sagmeister (music composers) while in sort-by-domains mode
    await cdp.ev(`window.__nopitacBoardButtons.concentricCircles.selectPerson('stefan sagmeister');`);
    await sleep(420);
    const redBgColors = await cdp.ev(`(() => {
      const colors = {};
      document.querySelectorAll('.concentric-name-group').forEach(g => {
        colors[g.getAttribute('data-domain')] = g.getAttribute('fill');
      });
      return { bg: getComputedStyle(document.getElementById('boardViewport')).backgroundColor, colors };
    })()`);
    console.log('Sort by Domains after selecting music composer (red bg):', redBgColors);
    assert(redBgColors.colors['artists'] === '#27ff83' && redBgColors.colors['music composers'] === '#000000', 'Switching selected person dynamically updates domain name colors against new bg');
    await cdp.shot('46_sort_by_domains_red_bg.png');

    // TEST 3: Date Added (records real timestamps when users add names)
    console.log('\n--- TEST 3: Sort by Date Added + Timestamp Recording ---');
    await cdp.ev(`window.__nopitacBoardButtons.concentricCircles.addPerson({ fullName: 'zaha hadid', domain: 'web designer', place: 'baghdad', year: '1950', whyCool: 'pioneering deconstructivist architect' });`);
    await sleep(60);
    await cdp.ev(`window.__nopitacBoardButtons.concentricCircles.addPerson({ fullName: 'dieter rams', domain: 'artists', place: 'wiesbaden', year: '1932', whyCool: 'less, but better' });`);
    await sleep(100);
    await cdp.ev(`window.__nopitacBoardButtons.sortComponent.open();`);
    await sleep(480);
    await cdp.ev(`document.querySelector('#sortWidget [data-group="sortBy"][data-option="date-added"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
    await sleep(250);
    const byDate = await cdp.ev(`(() => {
      const cc = window.__nopitacBoardButtons.concentricCircles;
      const flat = cc.rings.flatMap(r => r.names);
      const z = cc.people.get('zaha hadid');
      const d = cc.people.get('dieter rams');
      return {
        ring0: cc.rings[0]?.names,
        firstTwo: flat.slice(0, 2),
        zDate: z?.dateAdded,
        dDate: d?.dateAdded,
        dISO: d?.dateAddedISO
      };
    })()`);
    console.log('Sort by Date Added:', byDate);
    assert(byDate.dDate > byDate.zDate && Boolean(byDate.dISO), `Exact dateAdded timestamps recorded (${byDate.dISO})`);
    assert(byDate.firstTwo[0] === 'dieter rams' && byDate.firstTwo[1] === 'zaha hadid', `Newest entered names appear first in inner circle (${byDate.firstTwo.join(', ')})`);
    await cdp.shot('47_sort_by_date_added.png');

    // TEST 4: Domain filter chip in Sort panel
    console.log('\n--- TEST 4: Domain Filter Chip ---');
    await cdp.ev(`document.querySelector('#sortWidget [data-group="domains"][data-option="music composers"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));`);
    await sleep(250);
    const filtered = await cdp.ev(`(() => {
      const cc = window.__nopitacBoardButtons.concentricCircles;
      const names = cc.rings.flatMap(r => r.names);
      const domains = [...new Set(names.map(n => cc.people.get(n)?.domain))];
      return { count: names.length, domains };
    })()`);
    console.log('Filtered to music composers:', filtered);
    assert(filtered.count === 4 && filtered.domains.length === 1 && filtered.domains[0] === 'music composers', 'Domain filter chip filters circles cleanly to selected domain');

    cdp.close();
    console.log(`\n=== Sort Functionality Verification finished with ${failures} failure(s) ===`);
    process.exitCode = failures > 0 ? 1 : 0;
  } catch (err) {
    console.error('Error:', err);
    process.exitCode = 1;
  } finally {
    proc.kill();
  }
}

run();

