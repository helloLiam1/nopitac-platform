import { BoardLoadingScreen } from './components/BoardLoadingScreen.js';
import { BoardButtonsManager } from './components/BoardButtonsManager.js';
import { nopitacService } from './lib/nopitacService.js';

// Boot the vector loading screen immediately so it displays with zero delay
const loadingScreen = new BoardLoadingScreen({ minDurationMs: 2483 });
window.__boardLoadingScreen = loadingScreen;

async function initBoard() {
  const viewport = document.getElementById('boardViewport');

  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get('user');
  const modeParam = urlParams.get('mode');
  const asParam = urlParams.get('as');

  // Determine user identity, own-vs-visited mode, and board mode
  let isEmptyMode = false;
  let username = 'new user';
  let loggedInUser = null;
  let authUserId = null;

  if (asParam && asParam.trim()) {
    loggedInUser = asParam.trim();
    try {
      localStorage.setItem('nopitac_user', JSON.stringify({ username: loggedInUser, name: loggedInUser }));
    } catch (e) {}
  } else {
    const sbUser = await nopitacService.getCurrentUser();
    if (sbUser) {
      loggedInUser = sbUser.username || sbUser.name;
      authUserId = sbUser.id;
      try {
        localStorage.setItem('nopitac_user', JSON.stringify(sbUser));
      } catch (e) {}
    } else {
      try {
        const stored = localStorage.getItem('nopitac_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (u && u.id) authUserId = u.id;
          if (u && u.username) loggedInUser = u.username;
          else if (u && u.name) loggedInUser = u.name;
          else if (u && u.email) loggedInUser = u.email.split('@')[0];
        }
      } catch (e) {
        console.warn('Could not parse user session:', e);
      }
    }
  }

  if (userParam) {
    username = userParam;
    if (userParam.toLowerCase() === 'henry who') {
      isEmptyMode = modeParam === 'empty'; // Henry Who's board is full by default
    } else {
      isEmptyMode = modeParam !== 'full'; // Other users start empty unless full requested
    }
  } else {
    if (loggedInUser) {
      username = loggedInUser;
      isEmptyMode = loggedInUser.trim().toLowerCase() === 'henry who' ? (modeParam === 'empty') : true;
    } else {
      // New visitor without login: empty board ready to be created
      username = 'new user';
      isEmptyMode = true;
    }
  }

  // Determine whether this is the active user's own board or someone else's board.
  // Default owner identity is 'henry who' unless signed in as another user.
  const ownerIdentity = (loggedInUser || 'henry who').trim().toLowerCase();
  const isVisiting = Boolean(
    userParam && userParam.trim().toLowerCase() !== ownerIdentity
  );

  // 2. Pre-warm and await typography / fonts
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {
    console.warn('Font ready check completed with notice:', e);
  }

  // 3. Initialize the Edge Buttons Manager (edit/save-board, add name, sort + circles + logo + badge)
  const boardButtonsManager = new BoardButtonsManager({
    container: viewport,
    username: username,
    emptyMode: isEmptyMode,
    isVisiting: isVisiting,
    authUserId: authUserId
  });
  window.__nopitacBoardButtons = boardButtonsManager;
  window.__boardConcentricCircles = boardButtonsManager.concentricCircles;
  window.__addPersonButton = boardButtonsManager.addPersonComponent;
  window.__photoPanel = boardButtonsManager.addPersonComponent?.photoPanel;

  // Hydrate board people & domains from Supabase if the board exists in DB
  if (username && username !== 'new user') {
    const dbBoard = await nopitacService.fetchBoardByUsername(username);
    if (dbBoard?.profile?.username) {
      boardButtonsManager.setUsername(dbBoard.profile.username);
    }
    if (dbBoard && (dbBoard.people.length > 0 || dbBoard.domains.length > 0)) {
      dbBoard.domains.forEach((d) => {
        boardButtonsManager.concentricCircles?.registerDomainColor(d.name, d.color);
        boardButtonsManager.sortComponent?.addDomain({ name: d.name, color: d.color });
        boardButtonsManager.addPersonComponent?.domainPanel?.addDomain?.({ name: d.name, color: d.color });
      });
      dbBoard.people.forEach((p) => {
        boardButtonsManager.concentricCircles?.addPerson({
          fullName: p.full_name,
          domain: p.domain,
          domainColor: p.domain_color,
          place: p.place,
          year: p.birth_year,
          whyCool: p.description,
          links: p.links,
          photo: p.photo_url ? { imageHref: p.photo_url, ...(p.photo_settings || {}) } : null
        }, { silent: true });
      });
      boardButtonsManager.concentricCircles?.deselectPerson();
      boardButtonsManager.updateLogoCount(
        boardButtonsManager.concentricCircles?.people?.size ?? 0,
        { animate: false }
      );
    }
  }

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
