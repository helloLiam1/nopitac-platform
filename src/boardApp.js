import { BoardLoadingScreen } from './components/BoardLoadingScreen.js';
import { BoardButtonsManager } from './components/BoardButtonsManager.js';

// Boot the vector loading screen immediately so it displays with zero delay
const loadingScreen = new BoardLoadingScreen({ minDurationMs: 2483 });
window.__boardLoadingScreen = loadingScreen;

async function initBoard() {
  const viewport = document.getElementById('boardViewport');

  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  const modeParam = urlParams.get('mode');

  // Determine user identity and board mode
  let isEmptyMode = false;
  let username = 'new user';

  if (userParam) {
    username = userParam;
    if (userParam.toLowerCase() === 'henry who') {
      isEmptyMode = modeParam === 'empty'; // Henry Who's board is full by default
    } else {
      isEmptyMode = modeParam !== 'full'; // Other users start empty unless full requested
    }
  } else {
    // Check if user is logged in
    let loggedInUser = null;
    try {
      const stored = localStorage.getItem('nopitac_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u && u.name) loggedInUser = u.name;
        else if (u && u.email) loggedInUser = u.email.split('@')[0];
      }
    } catch (e) {
      console.warn('Could not parse user session:', e);
    }

    if (loggedInUser) {
      username = loggedInUser;
      isEmptyMode = true; // Logged-in new user starts with their own empty board
    } else {
      // New visitor without login: empty board ready to be created
      username = 'new user';
      isEmptyMode = true;
    }
  }

  // 2. Pre-warm and await typography / fonts
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {
    console.warn('Font ready check completed with notice:', e);
  }

  // 3. Initialize the Edge Buttons Manager (search, add person, sort + circles + logo + badge)
  const boardButtonsManager = new BoardButtonsManager({
    container: viewport,
    username: username,
    emptyMode: isEmptyMode
  });
  window.__nopitacBoardButtons = boardButtonsManager;
  window.__boardConcentricCircles = boardButtonsManager.concentricCircles;
  window.__addPersonButton = boardButtonsManager.addPersonComponent;
  window.__photoPanel = boardButtonsManager.addPersonComponent?.photoPanel;

  // 4. Run two requestAnimationFrame ticks to guarantee full layout calculation and GPU compositor caching
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // 5. Signal that the board is 100% ready to be displayed without any lag
  loadingScreen.markReady();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBoard);
} else {
  initBoard();
}
