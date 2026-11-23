import { spawn } from 'child_process';
import { promises as fs } from 'fs';

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

    console.log('--- TEST 1: Initial State of SortButton ---');
    const initInfo = await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      const sort = mgr.sortComponent;
      const widget = sort.widget;
      const text = widget.querySelector('#sortSvgText');
      const box = widget.getBoundingClientRect();
      const style = window.getComputedStyle(text);
      return {
        edge: sort.edge,
        isExpanded: sort.isExpanded,
        fontWeight: style.fontWeight,
        fontFamily: style.fontFamily,
        box: { x: box.x, y: box.y, right: box.right, width: box.width, height: box.height }
      };
    })()`);
    console.log('Initial Sort Info:', initInfo);
    if (initInfo.fontWeight !== '400') {
      throw new Error(`Expected font-weight 400 when contracted, got ${initInfo.fontWeight}`);
    }
    if (Math.round(initInfo.box.right) !== 1440) {
      throw new Error(`Expected box.right 1440, got ${initInfo.box.right}`);
    }

    console.log('--- TEST 2: Expand on Right Edge (Zero Bounce Verification) ---');
    // Click header to open
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.open()`);

    // Track frame-by-frame during expansion animation (500ms)
    let maxGap = 0;
    for (let f = 0; f < 10; f++) {
      await sleep(50);
      const frameInfo = await client.evaluate(`(() => {
        const sort = window.__nopitacBoardButtons.sortComponent;
        const box = sort.widget.getBoundingClientRect();
        const poly = sort.borderLine.getAttribute('points');
        return {
          width: box.width,
          right: box.right,
          gap: 1440 - box.right,
          poly
        };
      })()`);
      console.log(`Frame ${f}: w=${frameInfo.width.toFixed(2)}, right=${frameInfo.right.toFixed(2)}, gap=${frameInfo.gap.toFixed(2)}`);
      if (Math.abs(frameInfo.gap) > maxGap) maxGap = Math.abs(frameInfo.gap);
    }
    if (maxGap > 0.5) {
      throw new Error(`Right edge bounced during animation! Max gap was ${maxGap}px`);
    }

    // Check expanded state
    await sleep(300);
    const expandedInfo = await client.evaluate(`(() => {
      const sort = window.__nopitacBoardButtons.sortComponent;
      const widget = sort.widget;
      const text = widget.querySelector('#sortSvgText');
      const box = widget.getBoundingClientRect();
      const style = window.getComputedStyle(text);
      const label = widget.querySelector('.sort-option-label');
      const labelStyle = window.getComputedStyle(label);
      return {
        isExpanded: sort.isExpanded,
        strokeWidth: style.strokeWidth,
        rawStroke: text.style.strokeWidth,
        labelFontSize: labelStyle.fontSize,
        box: { width: Math.round(box.width), height: Math.round(box.height), right: Math.round(box.right) }
      };
    })()`);
    console.log('Expanded Sort Info:', expandedInfo);
    const strokeNum = parseFloat(expandedInfo.rawStroke || expandedInfo.strokeWidth);
    if (strokeNum < 0.75) {
      throw new Error(`Expected bold stroke width >= 0.75px when expanded, got ${expandedInfo.strokeWidth}`);
    }
    if (expandedInfo.labelFontSize !== '14px') {
      throw new Error(`Expected label font-size 14px, got ${expandedInfo.labelFontSize}`);
    }
    if (expandedInfo.box.width !== 356 || expandedInfo.box.height !== 114) {
      throw new Error(`Expected size 356x114 on right edge, got ${expandedInfo.box.width}x${expandedInfo.box.height}`);
    }
    if (expandedInfo.box.right !== 1440) {
      throw new Error(`Expected box.right 1440, got ${expandedInfo.box.right}`);
    }

    console.log('--- TEST 3: Tick Box Interaction & States ---');
    // Check tick box initial state (all deselected)
    const tickInit = await client.evaluate(`(() => {
      const widget = window.__nopitacBoardButtons.sortComponent.widget;
      const nameRow = widget.querySelector('[data-option="name"]');
      const rect = nameRow.querySelector('.sort-tick-rect');
      const underline = nameRow.querySelector('.sort-tick-underline');
      return {
        nameSelected: nameRow.classList.contains('is-selected'),
        rectFill: window.getComputedStyle(rect).fill,
        underlineOpacity: window.getComputedStyle(underline).opacity
      };
    })()`);
    console.log('Tick box initial state:', tickInit);
    if (tickInit.nameSelected) throw new Error('Expected deselected initially');
    if (parseFloat(tickInit.underlineOpacity) > 0.1) throw new Error('Expected underline opacity 0 when deselected');

    // Click 'name' row to select
    await client.evaluate(`(() => {
      const widget = window.__nopitacBoardButtons.sortComponent.widget;
      const nameRow = widget.querySelector('[data-option="name"]');
      nameRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    })()`);
    await sleep(200);

    const clickName = await client.evaluate(`(() => {
      const widget = window.__nopitacBoardButtons.sortComponent.widget;
      const nameRow = widget.querySelector('[data-option="name"]');
      const rect = nameRow.querySelector('.sort-tick-rect');
      const underline = nameRow.querySelector('.sort-tick-underline');
      return {
        nameSelected: nameRow.classList.contains('is-selected'),
        rectFill: window.getComputedStyle(rect).fill,
        underlineOpacity: window.getComputedStyle(underline).opacity,
        selectedSortBy: window.__nopitacBoardButtons.sortComponent.selectedOptions.sortBy
      };
    })()`);
    console.log('After clicking name:', clickName);
    if (!clickName.nameSelected || clickName.selectedSortBy !== 'name') {
      throw new Error('Option name was not selected!');
    }
    // Fill should be #b3b3b3 -> rgb(179, 179, 179)
    if (!clickName.rectFill.includes('179')) {
      throw new Error(`Expected fill rgb(179, 179, 179), got ${clickName.rectFill}`);
    }
    if (parseFloat(clickName.underlineOpacity) < 0.9) {
      throw new Error(`Expected underline opacity 1 when selected, got ${clickName.underlineOpacity}`);
    }

    // Click a domain option: 'artists'
    await client.evaluate(`(() => {
      const widget = window.__nopitacBoardButtons.sortComponent.widget;
      const artistRow = widget.querySelector('[data-option="artists"]');
      artistRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    })()`);
    await sleep(200);

    const clickDomain = await client.evaluate(`(() => {
      const widget = window.__nopitacBoardButtons.sortComponent.widget;
      const artistRow = widget.querySelector('[data-option="artists"]');
      const rect = artistRow.querySelector('.sort-tick-rect');
      const underline = artistRow.querySelector('.sort-tick-underline');
      return {
        artistSelected: artistRow.classList.contains('is-selected'),
        rectFill: window.getComputedStyle(rect).fill,
        underlineOpacity: window.getComputedStyle(underline).opacity,
        domains: Array.from(window.__nopitacBoardButtons.sortComponent.selectedOptions.domains)
      };
    })()`);
    console.log('After clicking artists:', clickDomain);
    if (!clickDomain.artistSelected || !clickDomain.domains.includes('artists')) {
      throw new Error('Option artists was not selected!');
    }

    console.log('--- TEST 4: Close and Test Edge Revolving ---');
    // Close
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.close()`);
    await sleep(500);

    const closedInfo = await client.evaluate(`(() => {
      const sort = window.__nopitacBoardButtons.sortComponent;
      const text = sort.widget.querySelector('#sortSvgText');
      return {
        isExpanded: sort.isExpanded,
        strokeWidth: window.getComputedStyle(text).strokeWidth,
        rawStroke: text.style.strokeWidth
      };
    })()`);
    console.log('After close:', closedInfo);
    const closedStroke = parseFloat(closedInfo.rawStroke || closedInfo.strokeWidth);
    if (closedStroke > 0.1) {
      throw new Error(`Expected stroke width 0px after close, got ${closedInfo.strokeWidth}`);
    }

    console.log('--- TEST 5: Top Edge Expansion & Selection Persistence ---');
    // Scroll until sort is on Top edge
    await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      // trackLength is segLeft + segTop + segRight
      // segLeft ~ 716, segTop ~ 1336
      // initialTau for sort is 0.8786 -> let's set scrollOffset so sort is on Top edge
      for (let s = 100; s < 4000; s += 100) {
        mgr.targetScrollOffset = s;
        mgr.scrollOffset = s;
        mgr.update();
        if (mgr.sortComponent.edge === 'top') {
          break;
        }
      }
    })()`);

    const topEdgeState = await client.evaluate(`(() => {
      const sort = window.__nopitacBoardButtons.sortComponent;
      return { edge: sort.edge };
    })()`);
    console.log('Sort moved to edge:', topEdgeState.edge);
    if (topEdgeState.edge !== 'top') {
      throw new Error('Failed to move sort to top edge');
    }

    // Expand on top edge
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.open()`);
    await sleep(450);

    const topExpanded = await client.evaluate(`(() => {
      const sort = window.__nopitacBoardButtons.sortComponent;
      const widget = sort.widget;
      const text = widget.querySelector('#sortSvgText');
      const box = widget.getBoundingClientRect();
      const style = window.getComputedStyle(text);
      const nameRow = widget.querySelector('[data-option="name"]');
      const artistRow = widget.querySelector('[data-option="artists"]');
      return {
        box: { width: Math.round(box.width), height: Math.round(box.height), top: Math.round(box.top) },
        strokeWidth: style.strokeWidth,
        rawStroke: text.style.strokeWidth,
        nameSelected: nameRow ? nameRow.classList.contains('is-selected') : false,
        artistSelected: artistRow ? artistRow.classList.contains('is-selected') : false
      };
    })()`);
    console.log('Top Edge Expanded Info:', topExpanded);
    if (topExpanded.box.top !== 0) throw new Error('Expected attached to top 0');
    if (topExpanded.box.width !== 134 || topExpanded.box.height !== 282) {
      throw new Error(`Expected 134x282 on top edge, got ${topExpanded.box.width}x${topExpanded.box.height}`);
    }
    const topStroke = parseFloat(topExpanded.rawStroke || topExpanded.strokeWidth);
    if (topStroke < 0.75) throw new Error(`Expected stroke width >= 0.75px on top expanded, got ${topExpanded.strokeWidth}`);
    if (!topExpanded.nameSelected) throw new Error('Expected name selection persisted to top edge');
    if (!topExpanded.artistSelected) throw new Error('Expected artists selection persisted to top edge');

    // Capture screenshot of Top edge Sort
    const topShot = await client.send('Page.captureScreenshot');
    await fs.writeFile('/tmp/sort_top_14px.png', Buffer.from(topShot.data, 'base64'));

    console.log('--- TEST 6: Left Edge Expansion ---');
    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.close()`);
    await sleep(350);

    // Scroll until sort is on Left edge
    await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      for (let s = 1000; s < 6000; s += 100) {
        mgr.targetScrollOffset = s;
        mgr.scrollOffset = s;
        mgr.update();
        if (mgr.sortComponent.edge === 'left') {
          break;
        }
      }
    })()`);

    const leftEdgeState = await client.evaluate(`(() => {
      return { edge: window.__nopitacBoardButtons.sortComponent.edge };
    })()`);
    console.log('Sort moved to edge:', leftEdgeState.edge);
    if (leftEdgeState.edge !== 'left') throw new Error('Failed to move sort to left edge');

    await client.evaluate(`window.__nopitacBoardButtons.sortComponent.open()`);
    await sleep(450);

    const leftExpanded = await client.evaluate(`(() => {
      const sort = window.__nopitacBoardButtons.sortComponent;
      const box = sort.widget.getBoundingClientRect();
      const style = window.getComputedStyle(sort.svgText);
      const label = sort.widget.querySelector('.sort-option-label');
      const labelStyle = window.getComputedStyle(label);
      return {
        box: { width: Math.round(box.width), height: Math.round(box.height), left: Math.round(box.left) },
        strokeWidth: style.strokeWidth,
        rawStroke: sort.svgText.style.strokeWidth,
        labelFontSize: labelStyle.fontSize
      };
    })()`);
    console.log('Left Edge Expanded Info:', leftExpanded);
    if (leftExpanded.box.left !== 0) throw new Error('Expected attached to left 0');
    if (leftExpanded.box.width !== 356 || leftExpanded.box.height !== 114) {
      throw new Error(`Expected 356x114 on left edge, got ${leftExpanded.box.width}x${leftExpanded.box.height}`);
    }
    if (leftExpanded.labelFontSize !== '14px') {
      throw new Error(`Expected label font-size 14px on left edge, got ${leftExpanded.labelFontSize}`);
    }
    const leftStroke = parseFloat(leftExpanded.rawStroke || leftExpanded.strokeWidth);
    if (leftStroke < 0.75) throw new Error(`Expected stroke width >= 0.75px on left expanded, got ${leftExpanded.strokeWidth}`);

    // Capture screenshot of Left edge Sort
    const leftShot = await client.send('Page.captureScreenshot');
    await fs.writeFile('/tmp/sort_left_14px.png', Buffer.from(leftShot.data, 'base64'));

    console.log('--- TEST 7: Mutual Exclusion & Typography Comparison with AddPerson ---');
    await client.evaluate(`window.__nopitacBoardButtons.addPersonComponent.open()`);
    await sleep(450);

    const mutualState = await client.evaluate(`(() => {
      const mgr = window.__nopitacBoardButtons;
      const addPersonLabel = mgr.addPersonComponent.widget.querySelector('#labelFullName');
      const addPersonStyle = window.getComputedStyle(addPersonLabel);
      return {
        addPersonExpanded: mgr.addPersonComponent.isExpanded,
        sortExpanded: mgr.sortComponent.isExpanded,
        addPersonLabelFontSize: addPersonStyle.fontSize,
        addPersonBox: {
          width: Math.round(mgr.addPersonComponent.widget.getBoundingClientRect().width),
          height: Math.round(mgr.addPersonComponent.widget.getBoundingClientRect().height)
        }
      };
    })()`);
    console.log('AddPerson Comparison state:', mutualState);
    if (!mutualState.addPersonExpanded || mutualState.sortExpanded) {
      throw new Error('Mutual exclusion failed: Sort should be closed when AddPerson opens');
    }
    if (mutualState.addPersonLabelFontSize !== '14px') {
      throw new Error(`Expected AddPerson label to be 14px, got ${mutualState.addPersonLabelFontSize}`);
    }

    // Capture screenshot of Add Person for direct visual comparison
    const addShot = await client.send('Page.captureScreenshot');
    await fs.writeFile('/tmp/add_person_top_14px.png', Buffer.from(addShot.data, 'base64'));

    console.log('\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<');
  } finally {
    chromeProc.kill();
  }
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
