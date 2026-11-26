/**
 * BoardButtonsManager
 * Manages the contracted edge buttons (search, add person, sort) on the Nopitac board.
 * Buttons circulate clockwise on scroll down and anticlockwise on scroll up.
 * 
 * Rules:
 *  - Endless infinite scrolling in both directions (no end to scrolling or button revolving)
 *  - Button travel speed is EQUAL to the scroll speed (1:1 direct responsiveness)
 *  - Buttons circulate around the 3 edges: Left (up) -> Top (right) -> Right (down) -> Left (up)
 *  - Buttons do NOT attach to the bottom edge and do NOT cross the bottom black line (at y = viewportHeight - 80px)
 *  - When reaching corners, buttons disappear from one edge and appear on the next without rotating
 *  - Font: Helvetica Neue (21px bold for 'add person', 21px regular for 'search' and 'sort')
 *  - 'add person' button opens anywhere on the top edge
 */

import { AddPersonButton } from './AddPersonButton.js';
import { SortButton } from './SortButton.js';
import { BoardConcentricCircles } from './BoardConcentricCircles.js';
import { nopitacService } from '../lib/nopitacService.js';

export class BoardButtonsManager {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.bottomOffset = 78.6539; // Distance from bottom edge of viewport (guideline at y = 821.35px in 900px viewport)
    this.username = options.username || 'henry who';
    this.emptyMode = Boolean(options.emptyMode);
    this.isVisiting = Boolean(options.isVisiting);
    this.authUserId = options.authUserId || null;

    // Button configurations matching Illustrator SVGs:
    //  - button_edit board.svg (width 134.599) when nothing selected on own board
    //  - button_edit info.svg  (width 115.3034) when a person is selected on own board
    //  - button_save board.svg (width 142.8268) when visiting another user's board
    const primaryBtn = this.isVisiting
      ? (() => {
          const saved = this.isBoardSaved();
          return {
            id: 'save-board',
            label: saved ? 'board saved' : 'save board',
            length: saved ? 155.3 : 142.8268,
            weight: 400,
            initialTau: 0.1250,
            currentEdge: 'left'
          };
        })()
      : {
          id: 'edit',
          label: 'edit board',
          length: 134.599,
          weight: 400,
          initialTau: 0.1250,
          currentEdge: 'left'
        };

    this.buttons = [primaryBtn];
    if (!this.isVisiting) {
      this.buttons.push({
        id: 'add-person',
        label: 'add name',
        length: 146.12,
        weight: 700,
        initialTau: 0.3750,
        currentEdge: 'top'
      });
    }
    this.buttons.push({
      id: 'community',
      label: 'community',
      length: 144.9882,
      weight: 400,
      initialTau: 0.6250,
      currentEdge: 'top'
    });
    this.buttons.push({
      id: 'sort',
      label: 'sort',
      length: 79.40,
      weight: 400,
      initialTau: 0.8750,
      currentEdge: 'right'
    });

    // Scroll & logo state
    this.scrollOffset = 0;
    this.targetScrollOffset = 0;
    this.isTicking = false;
    this.elements = {};
    this.logoCount = 0;
    this.logoAnimFrameId = null;

    this.init();
  }

  init() {
    this.measureDimensions();
    this.renderConcentricCircles();
    this.renderButtons();
    this.renderLogo();
    this.updateLogoCount(this.concentricCircles?.people?.size ?? 0, { animate: false });
    this.renderUserBadge();
    this.bindEvents();
    this.update();
  }

  renderConcentricCircles() {
    this.concentricCircles = new BoardConcentricCircles({
      container: this.container,
      emptyMode: this.emptyMode,
      onSelectionChange: (selectedPersonId) => {
        if (!this.isVisiting) {
          this.updateEditButtonMode(Boolean(selectedPersonId));
        }
      },
      onPersonAdded: (newCount) => {
        this.updateLogoCount(newCount, { animate: true });
      }
    });
  }

  getSavedBoardNames() {
    try {
      const raw = localStorage.getItem('nopitac_saved_boards');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  isBoardSaved() {
    const key = (this.username || '').trim().toLowerCase();
    if (!key) return false;
    return this.getSavedBoardNames().includes(key);
  }

  updateEditButtonMode(hasSelection) {
    const editBtn = this.buttons.find((b) => b.id === 'edit');
    if (!editBtn) return;
    const nextLabel = hasSelection ? 'edit info' : 'edit board';
    const nextLength = hasSelection ? 115.3034 : 134.599;
    if (editBtn.label === nextLabel && editBtn.length === nextLength) return;
    editBtn.label = nextLabel;
    editBtn.length = nextLength;
    this.update();
  }

  handleEditButtonClick(e) {
    if (e) e.stopPropagation();
    if (!this.concentricCircles || !this.addPersonComponent) return;
    const selectedId = this.concentricCircles.selectedPersonId;
    if (!selectedId) {
      // 'edit board' clicked when nothing is selected (reserved for future instructions)
      return;
    }
    const person = this.concentricCircles.people.get(selectedId);
    if (!person) return;
    const domainColor = this.concentricCircles.getDomainColor(person.domain);
    this.addPersonComponent.openForEdit({
      ...person,
      domainColor
    });
  }

  handleSaveBoardClick(e) {
    if (e) e.stopPropagation();
    const key = (this.username || '').trim().toLowerCase();
    if (!key) return;

    const saved = this.getSavedBoardNames();
    const idx = saved.indexOf(key);
    let nowSaved = false;
    if (idx >= 0) {
      saved.splice(idx, 1);
      nowSaved = false;
    } else {
      saved.push(key);
      nowSaved = true;
    }

    try {
      localStorage.setItem('nopitac_saved_boards', JSON.stringify(saved));
      // Save profile metadata snapshot so visited boards appear properly in Community -> Saved Boards
      const profilesRaw = localStorage.getItem('nopitac_saved_board_profiles');
      const profiles = profilesRaw ? JSON.parse(profilesRaw) : {};
      if (nowSaved) {
        const domainCounts = [];
        const seenDomains = new Set();
        if (this.concentricCircles && this.concentricCircles.people) {
          for (const p of this.concentricCircles.people.values()) {
            const dn = (p.domain || 'artists').trim().toLowerCase();
            if (!seenDomains.has(dn)) {
              seenDomains.add(dn);
              domainCounts.push({
                name: dn,
                color: this.concentricCircles.getDomainColor(dn)
              });
            }
          }
        }
        profiles[key] = {
          name: key,
          composition: 'circle',
          domains: domainCounts.length > 0 ? domainCounts : [{ name: 'artists', color: '#27ff83' }],
          peopleCount: this.concentricCircles?.people?.size || 0
        };
      } else {
        delete profiles[key];
      }
      localStorage.setItem('nopitac_saved_board_profiles', JSON.stringify(profiles));
    } catch (err) {
      console.warn('Could not persist saved board:', err);
    }

    const saveBtn = this.buttons.find((b) => b.id === 'save-board');
    if (saveBtn) {
      saveBtn.label = nowSaved ? 'board saved' : 'save board';
      saveBtn.length = nowSaved ? 155.3 : 142.8268;
      this.update();
    }

    if (this.authUserId) {
      nopitacService.setSavedBoard(this.authUserId, key, nowSaved);
    }
  }

  measureDimensions() {
    this.viewportWidth = this.container.clientWidth || window.innerWidth || 1440;
    this.viewportHeight = this.container.clientHeight || window.innerHeight || 900;
    // The usable height bounded by the bottom guideline (y = H)
    this.usableHeight = Math.max(300, this.viewportHeight - this.bottomOffset);

    // Reference length for 1:1 speed track mapping (search button length = 104.16px)
    this.refLength = 104.16;
    this.segLeft = this.usableHeight - this.refLength;
    this.segTop = this.viewportWidth - this.refLength;
    this.segRight = this.usableHeight - this.refLength;
    // Total perimeter cycle length
    this.trackLength = this.segLeft + this.segTop + this.segRight;
  }

  formatLogoCount(count) {
    const safe = Math.max(0, Math.floor(Number(count) || 0));
    return String(safe).padStart(2, '0');
  }

  evalCubicBezierY(x, x1, y1, x2, y2) {
    const clampedX = Math.max(0, Math.min(1, x));
    const sampleX = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    const sampleY = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
    let lo = 0;
    let hi = 1;
    let mid = clampedX;
    for (let i = 0; i < 12; i++) {
      mid = (lo + hi) * 0.5;
      if (sampleX(mid) < clampedX) lo = mid;
      else hi = mid;
    }
    return sampleY(mid);
  }

  setLogoRestGeometry(count) {
    const label = this.formatLogoCount(count);
    if (this.logoBottomBarEl) this.logoBottomBarEl.setAttribute('width', '130.7477');
    if (this.logoRightTickEl) this.logoRightTickEl.setAttribute('x', '125.2283');
    if (this.logoCountTextEl) this.logoCountTextEl.removeAttribute('transform');
    if (this.logoCountSpanEl) this.logoCountSpanEl.textContent = label;
    if (this.logoEl) this.logoEl.setAttribute('aria-label', `Nopitac ${Math.max(0, Math.floor(Number(count) || 0))} logo`);
  }

  updateLogoCount(count, { animate = false } = {}) {
    const nextCount = Math.max(0, Math.floor(Number(count) || 0));
    const prevCount = this.logoCount;
    this.logoCount = nextCount;

    if (!this.logoEl || !this.logoCountSpanEl) return;

    if (animate && nextCount > prevCount) {
      this.playLogoAddAnimation(prevCount, nextCount);
    } else {
      if (this.logoAnimFrameId) {
        cancelAnimationFrame(this.logoAnimFrameId);
        this.logoAnimFrameId = null;
      }
      this.setLogoRestGeometry(nextCount);
    }
  }

  playLogoAddAnimation(fromCount, toCount) {
    if (this.logoAnimFrameId) {
      cancelAnimationFrame(this.logoAnimFrameId);
      this.logoAnimFrameId = null;
    }

    // Matches logo_when_person_added.json (24fps, expand frames 0->6, swap text at frame 6, contract frames 6->12)
    const halfDuration = 250;
    const totalDuration = 500;
    const maxShift = 12.78;
    const startLabel = this.formatLogoCount(fromCount);
    const endLabel = this.formatLogoCount(toCount);
    const startTime = performance.now();
    let swapped = false;

    if (this.logoCountSpanEl) this.logoCountSpanEl.textContent = startLabel;

    const step = (now) => {
      const elapsed = now - startTime;
      if (elapsed >= totalDuration) {
        this.logoAnimFrameId = null;
        this.setLogoRestGeometry(toCount);
        return;
      }

      let dx = 0;
      if (elapsed < halfDuration) {
        const u = this.evalCubicBezierY(elapsed / halfDuration, 0.219, 0, 0.262, 1);
        dx = maxShift * u;
      } else {
        if (!swapped) {
          swapped = true;
          if (this.logoCountSpanEl) this.logoCountSpanEl.textContent = endLabel;
        }
        const u = this.evalCubicBezierY((elapsed - halfDuration) / halfDuration, 0.697, 0, 0.667, 1);
        dx = maxShift * (1 - u);
      }

      if (this.logoBottomBarEl) this.logoBottomBarEl.setAttribute('width', (130.7477 + dx).toFixed(3));
      if (this.logoRightTickEl) this.logoRightTickEl.setAttribute('x', (125.2283 + dx).toFixed(3));
      if (this.logoCountTextEl) this.logoCountTextEl.setAttribute('transform', `translate(${dx.toFixed(3)} 0)`);

      this.logoAnimFrameId = requestAnimationFrame(step);
    };

    this.logoAnimFrameId = requestAnimationFrame(step);
  }

  renderLogo() {
    let logo = this.container.querySelector('#boardLogo');
    const initialLabel = this.formatLogoCount(this.logoCount);
    if (!logo) {
      logo = document.createElement('div');
      logo.className = 'board-logo';
      logo.id = 'boardLogo';
      logo.setAttribute('aria-label', `Nopitac ${this.logoCount} logo`);
      logo.innerHTML = `
        <svg class="board-logo-svg" viewBox="0 0 131.5249 49.8797" width="131.5249" height="49.8797" xmlns="http://www.w3.org/2000/svg">
          <path d="M113.3054,20.2456c0-6.5969,4.8461-11.1742,11.758-11.1742,2.6914,0,4.4352.7133,6.4615,1.4622v6.7796l-.3587.1347c-1.6725-1.7792-3.0514-2.7669-5.7442-2.7669-3.3656,0-5.6997,2.2887-5.6997,5.5647s2.3341,5.5647,5.6997,5.5647c2.6927,0,4.3076-1.0932,5.7442-2.9101l.3587.1793v6.6992c-2.2901.9308-3.8591,1.6411-6.5964,1.6411-6.777,0-11.6232-4.5773-11.6232-11.1742Z"/>
          <path d="M21.889,20.2484c0-6.2827,5.1158-11.219,11.7128-11.219,6.5519,0,11.6677,4.9363,11.6677,11.219s-5.1158,11.219-11.6677,11.219c-6.597,0-11.7128-4.9363-11.7128-11.219ZM33.6018,25.7682c3.0069,0,5.3403-2.4234,5.3403-5.5198s-2.3334-5.5198-5.3403-5.5198c-3.0514,0-5.3855,2.4234-5.3855,5.5198s2.3341,5.5198,5.3855,5.5198Z"/>
          <path d="M58.8402,9.0303c-2.4649,0-4.5778.718-6.055,2.1541l-.0897-1.705h-6.1514v30.3352h6.2822v-10.5492c1.4846,1.3946,3.5004,2.2023,6.0138,2.2023,6.061,0,10.5485-4.9361,10.5485-11.2187s-4.4875-11.2187-10.5485-11.2187ZM57.632,25.9446c-2.2923,0-3.9973-1.0767-4.8057-2.6439v-6.0617c.8084-1.705,2.6516-2.6924,4.8057-2.6924,3.2308,0,5.4259,2.4716,5.4259,5.7024,0,3.2726-2.1952,5.6956-5.4259,5.6956Z"/>
          <path d="M53.6093,39.6214l-.0485.1932h-.7315v-3.0376c.0202,1.4293.145,2.3267.78,2.8444Z"/>
          <path d="M45.7663,39.6214l.0485.1932h.7315v-3.0376c-.0202,1.4293-.145,2.3267-.78,2.8444Z"/>
          <path d="M45.7641,9.6732l.0485-.1932h.7315v3.0376c-.0202-1.4293-.145-2.3267-.78-2.8444Z"/>
          <g>
            <path d="M73.3853,0c-2.2437,0-3.9966,1.705-3.9966,3.9006,0,2.2023,1.7529,3.9077,3.9966,3.9077s3.9906-1.7054,3.9906-3.9077c0-2.1955-1.7468-3.9006-3.9906-3.9006Z"/>
            <g>
              <rect x="70.3757" y="9.4793" width="6.2822" height="21.5396"/>
              <path d="M69.5979,9.6725l.0485-.1932h.7315v3.0376c-.0202-1.4293-.145-2.3267-.78-2.8444Z"/>
              <path d="M69.5979,30.8256l.0485.1932h.7315v-3.0376c-.0202,1.4293-.145,2.3267-.78,2.8444Z"/>
              <path d="M77.4379,30.8256l-.0485.1932h-.7315v-3.0376c.0202,1.4293.145,2.3267.78,2.8444Z"/>
            </g>
          </g>
          <g>
            <path d="M85.4599,31.0187V14.9953h5.0573v-5.5159h-5.0573l-.2106-6.3841h-6.079v11.9001h.0067v16.0234h6.2828Z"/>
            <path d="M78.3903,3.2884l.0485-.1932h.7315v3.0376c-.0202-1.4293-.145-2.3267-.78-2.8444Z"/>
            <path d="M78.397,30.8256l.0485.1932h.7315v-3.0376c-.0202,1.4293-.145,2.3267-.78,2.8444Z"/>
            <path d="M86.2396,30.8256l-.0485.1932h-.7315v-3.0376c.0202,1.4293.145,2.3267.78,2.8444Z"/>
          </g>
          <g>
            <path d="M106.4218,9.472l-.1375,1.7054c-1.4778-1.436-3.5901-2.1541-6.055-2.1541-6.0617,0-10.5492,4.9361-10.5492,11.2187,0,6.2893,4.4875,11.2254,10.5492,11.2254,2.5545,0,4.5771-.8077,6.055-2.2437l.1375,1.7951h6.1035V9.472h-6.1035ZM106.1946,23.3902c-.8084,1.5257-2.5134,2.5542-4.7571,2.5542-3.2308,0-5.4259-2.4231-5.4259-5.7024,0-3.2311,2.1952-5.6956,5.4259-5.6956,2.1129,0,3.9488.9388,4.7571,2.6027v6.241Z"/>
            <path d="M113.3054,9.6652l-.0485-.1932h-.7315v3.0376c.0202-1.4293-.145-2.3267-.78-2.8444Z"/>
            <path d="M113.3054,30.8256l-.0485.1932h-.7315v-3.0376c.0202,1.4293.145,2.3267-.78,2.8444Z"/>
          </g>
          <g>
            <path d="M21.1089,17.8674v6.5586h-.0074v6.593h-6.2754v-12.834c0-1.9744-1.2978-3.4104-3.5894-3.4104-2.1541,0-3.5901,1.5257-4.1773,3.5416v7.8082c0,.7042-.0067,1.3187.0074,1.8571v3.0376H.7772V14.3673c0-.8353.0135-1.5604,0-2.1817v-2.7062h6.1514l.1308,2.7821c1.3052-2.0229,3.1418-3.2311,5.8824-3.2311,5.1158,0,8.1672,3.5419,8.1672,8.837Z"/>
            <path d="M14.046,30.8258l.0485.1932h.7315v-3.0376c-.0202,1.4293-.145,2.3267-.78,2.8444Z"/>
            <path d="M21.889,30.8258l-.0485.1932h-.7315v-3.0376c.0202,1.4293.145,2.3267.78,2.8444Z"/>
            <path d="M0,9.6729l.0485-.1932h.7315v3.0376c-.0202-1.4293-.145-2.3267-.78-2.8444Z"/>
          </g>
          <rect x=".7772" y="30.7193" width="6.2966" height="19.1603"/>
          <rect id="boardLogoRightTick" x="125.2283" y="35.3619" width="6.2966" height="14.5178"/>
          <rect id="boardLogoBottomBar" x=".7772" y="43.5831" width="130.7477" height="6.2966"/>
          <text id="boardLogoCountText" x="124.2" y="42.4499" text-anchor="end" style="font-family: 'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10.2687px; font-weight: 700; fill: #000000;"><tspan id="boardLogoCount" x="124.2" y="42.4499">${initialLabel}</tspan></text>
        </svg>
      `;
      this.container.appendChild(logo);
    }
    this.logoEl = logo;
    this.logoBottomBarEl = logo.querySelector('#boardLogoBottomBar');
    this.logoRightTickEl = logo.querySelector('#boardLogoRightTick');
    this.logoCountTextEl = logo.querySelector('#boardLogoCountText');
    this.logoCountSpanEl = logo.querySelector('#boardLogoCount');
  }

  renderUserBadge() {
    let badge = this.container.querySelector('#boardUserBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'board-user-badge';
      badge.id = 'boardUserBadge';
      badge.innerHTML = `
        <span class="board-user-by">by</span>
        <span class="board-user-name" id="boardUserName">${this.username}</span>
        <div class="board-user-menu" id="boardUserMenu">
          <button type="button" class="board-user-logout-btn" id="boardLogoutBtn" title="Log out and return to entry screen">sign out</button>
        </div>
      `;
      this.container.appendChild(badge);

      const logoutBtn = badge.querySelector('#boardLogoutBtn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await nopitacService.signOut();
          localStorage.removeItem('nopitac_user');
          window.location.replace('/');
        });
      }
    }
    this.userBadgeEl = badge;
    this.userNameEl = badge.querySelector('#boardUserName');
  }

  getCustomDomainsStorageKey() {
    const key = (this.username || 'new user').trim().toLowerCase();
    return `nopitac_custom_domains_${key}`;
  }

  getLocalCustomDomains() {
    try {
      const raw = localStorage.getItem(this.getCustomDomainsStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  persistCustomDomainLocal({ originalName = null, name, color }) {
    if (!name || !color) return;
    const normNext = name.replace(/\s+/g, ' ').trim().toLowerCase();
    const normPrev = originalName ? originalName.replace(/\s+/g, ' ').trim().toLowerCase() : null;
    try {
      const list = this.getLocalCustomDomains();
      const targetIdx = normPrev
        ? list.findIndex((d) => (d.name || '').replace(/\s+/g, ' ').trim().toLowerCase() === normPrev)
        : list.findIndex((d) => (d.name || '').replace(/\s+/g, ' ').trim().toLowerCase() === normNext);
      if (targetIdx >= 0) {
        list[targetIdx] = { name: normNext, color };
      } else {
        list.push({ name: normNext, color });
      }
      localStorage.setItem(this.getCustomDomainsStorageKey(), JSON.stringify(list));
    } catch (e) {}
  }

  setUsername(name) {
    this.username = name || 'henry who';
    if (this.userNameEl) {
      this.userNameEl.textContent = this.username;
    }
  }

  renderButtons() {
    // 1. Initialize AddPersonButton component on own board (hidden when visiting someone else's board)
    if (!this.isVisiting) {
      this.addPersonComponent = new AddPersonButton({
        container: this.container,
        edge: 'top',
        emptyMode: this.emptyMode,
        onDone: (data) => {
          console.log('Add/Edit person submitted from Board UI:', data);
          if (!data || !data.fullName || !this.concentricCircles) return;
          if (data.editingPersonId) {
            this.concentricCircles.updatePerson(data.editingPersonId, data);
          } else {
            this.concentricCircles.addPerson(data);
          }
          if (this.authUserId) {
            nopitacService.upsertPerson(this.authUserId, data, data.editingPersonId);
          }
        },
        onAddDomain: (newDomain) => {
          if (newDomain && newDomain.name && newDomain.color) {
            const cleanKey = newDomain.name.replace(/\s+/g, ' ').trim().toLowerCase();
            if (this.concentricCircles) {
              this.concentricCircles.registerDomainColor(cleanKey, newDomain.color);
            }
            if (this.sortComponent) {
              this.sortComponent.addDomain({ name: newDomain.name, color: newDomain.color });
            }
            this.persistCustomDomainLocal({ name: cleanKey, color: newDomain.color });
            if (this.authUserId) {
              nopitacService.saveDomain(this.authUserId, { name: cleanKey, color: newDomain.color });
            }
          }
        },
        onUpdateDomain: (updatedDomain) => {
          if (updatedDomain && updatedDomain.name && updatedDomain.color) {
            const prevKey = (updatedDomain.originalName || updatedDomain.name).replace(/\s+/g, ' ').trim().toLowerCase();
            const nextKey = updatedDomain.name.replace(/\s+/g, ' ').trim().toLowerCase();
            if (this.concentricCircles) {
              this.concentricCircles.updateDomain(prevKey, { name: nextKey, color: updatedDomain.color });
            }
            if (this.sortComponent) {
              this.sortComponent.updateDomain(prevKey, { name: updatedDomain.name, color: updatedDomain.color });
            }
            this.persistCustomDomainLocal({ originalName: prevKey, name: nextKey, color: updatedDomain.color });
            if (this.authUserId) {
              nopitacService.updateDomain(this.authUserId, {
                originalName: prevKey,
                name: nextKey,
                color: updatedDomain.color
              });
            }
          }
        }
      });
    } else {
      this.addPersonComponent = null;
    }

    // 2. Initialize SortButton component (handles Top, Left, and Right edges)
    this.sortComponent = new SortButton({
      container: this.container,
      edge: 'right',
      emptyMode: this.emptyMode,
      onBeforeOpen: () => {
        if (this.concentricCircles) {
          this.concentricCircles.deselectPerson();
        }
      },
      onSortChange: (data) => {
        console.log('Sort options changed from Board UI:', data);
        if (this.concentricCircles) {
          this.concentricCircles.deselectPerson();
          this.concentricCircles.applySortAndFilter(data);
        }
      }
    });

    // 3. Create DOM wrapper elements for circulating contracted buttons ('edit' or 'save-board')
    this.buttons.forEach((btn) => {
      if (btn.id === 'add-person' || btn.id === 'sort') return;
      const el = document.createElement('div');
      el.className = `board-moving-btn board-btn-${btn.id}`;
      el.id = `boardBtn_${btn.id.replace('-', '_')}`;
      el.setAttribute('data-btn-id', btn.id);
      el.setAttribute('title', btn.label);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');

      const handleClick = (e) => {
        if (btn.id === 'edit') {
          this.handleEditButtonClick(e);
        } else if (btn.id === 'save-board') {
          this.handleSaveBoardClick(e);
        } else if (btn.id === 'community') {
          if (e) e.stopPropagation();
          window.location.href = '/community.html';
        }
      };

      el.addEventListener('click', handleClick);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      });

      this.container.appendChild(el);
      this.elements[btn.id] = el;
    });
  }

  bindEvents() {
    // Helper to check if any expanded panel is active
    const isAnyExpanded = () =>
      (this.addPersonComponent && this.addPersonComponent.isExpanded) ||
      (this.sortComponent && this.sortComponent.isExpanded);

    // Mouse wheel / trackpad scrolling
    // passive: false allows e.preventDefault() to disable browser overscroll/rubber-band bounce
    // ensuring scrolling is completely endless and uninhibited in both directions
    const onWheel = (e) => {
      // Pause button motion while any form/panel is expanded
      if (isAnyExpanded()) {
        if (
          e.target.closest('.field-input-box') || 
          e.target.closest('.sort-content') ||
          e.target.closest('.domain-list-scroll') ||
          e.target.closest('.domain-panel-widget')
        ) return;
        e.preventDefault();
        return;
      }

      // Let native vertical scrolling work inside the text area when a non-photo person is selected,
      // while still allowing edge buttons to revolve on every wheel scroll anywhere on the board.
      const allowNativeCenterScroll =
        Boolean(e.target.closest('.center-info-panel.has-selection .center-info-scroll')) &&
        Boolean(this.concentricCircles && !this.concentricCircles.hasSelectedPhoto);
      if (!allowNativeCenterScroll) {
        e.preventDefault();
      }

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 20; // Lines mode (Windows notched wheels)
      else if (e.deltaMode === 2) dy *= window.innerHeight; // Pages mode

      // Speed of scroll EQUAL to speed of buttons (1:1 direct ratio, no attenuation)
      this.targetScrollOffset += dy;
      this.requestTick();
    };

    window.addEventListener('wheel', onWheel, { passive: false });

    // Touch events for mobile/trackpad swipe
    let touchStartY = 0;
    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
    }, { passive: true });

    this.container.addEventListener('touchmove', (e) => {
      if (isAnyExpanded()) {
        if (
          e.target.closest('.field-input-box') || 
          e.target.closest('.sort-content') ||
          e.target.closest('.domain-list-scroll') ||
          e.target.closest('.domain-panel-widget')
        ) return;
        return;
      }
      if (e.touches.length === 1) {
        const allowNativeCenterScroll =
          Boolean(e.target.closest('.center-info-panel.has-selection .center-info-scroll')) &&
          Boolean(this.concentricCircles && !this.concentricCircles.hasSelectedPhoto);
        if (!allowNativeCenterScroll) {
          e.preventDefault();
        }
        const dy = touchStartY - e.touches[0].clientY;
        touchStartY = e.touches[0].clientY;
        // Direct 1:1 speed with touch drag
        this.targetScrollOffset += dy;
        this.requestTick();
      }
    }, { passive: false });

    // Keyboard arrow keys
    window.addEventListener('keydown', (e) => {
      if (isAnyExpanded()) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        this.targetScrollOffset += 50;
        this.requestTick();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        this.targetScrollOffset -= 50;
        this.requestTick();
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.measureDimensions();
      this.updateBottomLinePosition();
      this.update();
    });
  }

  requestTick() {
    if (!this.isTicking) {
      this.isTicking = true;
      requestAnimationFrame(() => this.tick());
    }
  }

  tick() {
    try {
      const diff = this.targetScrollOffset - this.scrollOffset;
      if (Math.abs(diff) > 0.1) {
        // Snappy 0.50 interpolation catches up in 2-3 frames, providing immediate 1:1 feel
        // with zero perceptible lag while maintaining butter-smooth sub-pixel motion
        this.scrollOffset += diff * 0.5;
        this.update();
        requestAnimationFrame(() => this.tick());
      } else {
        this.scrollOffset = this.targetScrollOffset;
        this.update();
        this.isTicking = false;
      }
    } catch (err) {
      console.error('Error in BoardButtonsManager tick:', err);
      this.isTicking = false;
    }
  }

  /**
   * Calculates the edge and position of a button given its position on the track.
   * Continuous track circuit with uniform velocity:
   *  - Left edge (0 <= s < segLeft): moves UP from y = H - L to y = 0
   *  - Top edge (segLeft <= s < segLeft + segTop): moves RIGHT from x = 0 to x = W - L
   *  - Right edge (segLeft + segTop <= s < total): moves DOWN from y = 0 to y = H - L
   * 
   * Endless modulo wrapping: both positive (scroll down) and negative (scroll up)
   * offsets revolve indefinitely without ever reaching an end.
   */
  calculatePosition(btn, trackPos) {
    const H = this.usableHeight;
    const W = this.viewportWidth;
    const L = btn.length;
    const total = this.trackLength;

    // Endless modulo wrapping: works continuously for all values (-inf to +inf)
    const s = ((trackPos % total) + total) % total;

    if (s < this.segLeft) {
      // Left edge: moves UP
      const f = s / this.segLeft;
      const y = (1 - f) * (H - L);
      return { edge: 'left', x: 0, y: Math.max(0, Math.min(H - L, y)) };
    } else if (s < this.segLeft + this.segTop) {
      // Top edge: moves RIGHT
      const f = (s - this.segLeft) / this.segTop;
      const x = f * (W - L);
      return { edge: 'top', x: Math.max(0, Math.min(W - L, x)), y: 0 };
    } else {
      // Right edge: moves DOWN
      const f = (s - (this.segLeft + this.segTop)) / this.segRight;
      const y = f * (H - L);
      return { edge: 'right', x: W - 29.46, y: Math.max(0, Math.min(H - L, y)) };
    }
  }

  update() {
    this.buttons.forEach((btn) => {
      const initialOffset = btn.initialTau * this.trackLength;
      const trackPos = initialOffset + this.scrollOffset;
      const pos = this.calculatePosition(btn, trackPos);
      const isEdgeChange = btn.currentEdge !== pos.edge;
      btn.currentEdge = pos.edge;

      if (btn.id === 'add-person') {
        this.updateAddPersonButton(pos, isEdgeChange);
      } else if (btn.id === 'sort') {
        this.updateSortButton(pos, isEdgeChange);
      } else {
        this.updateStandardButton(btn, pos, isEdgeChange);
      }
    });
  }

  updateSortButton(pos, isEdgeChange) {
    if (!this.sortComponent) return;
    const widget = this.sortComponent.widget;
    if (!widget) return;

    // Edge switch handler: updates template and coordinates for Top, Left, or Right edge
    if (isEdgeChange || this.sortComponent.edge !== pos.edge) {
      this.sortComponent.setEdge(pos.edge);
    }

    const isExpanded = this.sortComponent.isExpanded;

    if (pos.edge === 'top') {
      const maxLeft = isExpanded
        ? Math.max(0, this.viewportWidth - 135)
        : Math.max(0, this.viewportWidth - 80);
      const leftPos = Math.min(Math.round(pos.x), maxLeft);
      widget.style.display = 'block';
      widget.style.left = `${leftPos}px`;
      widget.style.top = '0px';
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
    } else if (pos.edge === 'left') {
      // Left edge: bottom line is anchored firmly, panel expands upwards.
      // Contracted height is 79.4022px; expanded height is 114.3995px.
      const contractedH = 79.4022;
      const expandedH = 114.3995;
      const minBottom = 80; // Distance above the bottom boundary line
      const maxBottom = this.viewportHeight - (isExpanded ? expandedH + 10 : contractedH);
      const bottomY = pos.y + contractedH;
      const rawBottom = this.viewportHeight - bottomY;
      const bottomPos = Math.max(minBottom, Math.min(maxBottom, rawBottom));

      widget.style.display = 'block';
      widget.style.left = '0px';
      widget.style.right = 'auto';
      widget.style.top = 'auto';
      widget.style.bottom = `${bottomPos.toFixed(4)}px`;
    } else if (pos.edge === 'right') {
      const maxTop = isExpanded
        ? Math.max(0, this.usableHeight - 115)
        : Math.max(0, this.usableHeight - 80);
      const topPos = Math.min(Math.round(pos.y), maxTop);
      widget.style.display = 'block';
      widget.style.left = 'auto';
      widget.style.top = `${topPos}px`;
      widget.style.right = '0px';
      widget.style.bottom = 'auto';
    }

    if (isEdgeChange && typeof this.sortComponent.updateBorderPoints === 'function') {
      this.sortComponent.updateBorderPoints();
    }
  }

  updateAddPersonButton(pos, isEdgeChange) {
    if (!this.addPersonComponent) return;
    const widget = this.addPersonComponent.widget;
    if (!widget) return;

    // Edge switch handler: updates template and coordinates for Top, Left, or Right edge
    if (isEdgeChange || this.addPersonComponent.edge !== pos.edge) {
      this.addPersonComponent.setEdge(pos.edge);
    }

    const isExpanded = this.addPersonComponent.isExpanded;

    if (pos.edge === 'top') {
      const maxLeft = isExpanded
        ? Math.max(0, this.viewportWidth - 182)
        : Math.max(0, this.viewportWidth - 147);
      const leftPos = Math.min(Math.round(pos.x), maxLeft);
      widget.style.display = 'block';
      widget.style.left = `${leftPos}px`;
      widget.style.top = '0px';
      widget.style.right = 'auto';
    } else if (pos.edge === 'left') {
      // Left edge: bottom line is anchored firmly, panel expands upwards.
      const minTop = isExpanded ? 12 : 0;
      const topPos = Math.max(minTop, Math.min(Math.round(pos.y), this.usableHeight - 147));
      widget.style.display = 'block';
      widget.style.left = '0px';
      widget.style.top = `${topPos}px`;
      widget.style.right = 'auto';
    } else if (pos.edge === 'right') {
      const maxTop = isExpanded
        ? Math.max(0, this.usableHeight - 158)
        : Math.max(0, this.usableHeight - 147);
      const topPos = Math.min(Math.round(pos.y), maxTop);
      widget.style.display = 'block';
      widget.style.left = 'auto';
      widget.style.top = `${topPos}px`;
      widget.style.right = '0px';
    }

    if (isEdgeChange && typeof this.addPersonComponent.updateBorderPoints === 'function') {
      this.addPersonComponent.updateBorderPoints();
    }
  }

  updateStandardButton(btn, pos, isEdgeChange) {
    const el = this.elements[btn.id];
    if (!el) return;

    if (isEdgeChange || !el.innerHTML || el.dataset.renderedLabel !== btn.label) {
      el.innerHTML = this.getButtonSvg(pos.edge, btn.length, btn.label, btn.weight);
      el.className = `board-moving-btn board-btn-${btn.id} is-${pos.edge}`;
      el.dataset.renderedLabel = btn.label;
      el.setAttribute('title', btn.label);
    }

    if (pos.edge === 'top') {
      el.style.top = '0px';
      el.style.left = `${Math.round(pos.x)}px`;
      el.style.right = 'auto';
    } else if (pos.edge === 'left') {
      el.style.top = `${Math.round(pos.y)}px`;
      el.style.left = '0px';
      el.style.right = 'auto';
    } else if (pos.edge === 'right') {
      el.style.top = `${Math.round(pos.y)}px`;
      el.style.left = 'auto';
      el.style.right = '0px';
    }
  }

  getButtonSvg(edge, length, label, weight) {
    const isBold = weight === 700;
    const fontFamily = isBold
      ? "'HelveticaNeue-Bold', 'Helvetica Neue', Helvetica, Arial, sans-serif"
      : "'HelveticaNeue', 'Helvetica Neue', Helvetica, Arial, sans-serif";

    if (edge === 'top') {
      // Top edge: attached to y = 0
      const rightX = (length - 0.75).toFixed(4);
      return `
        <svg class="board-btn-svg" viewBox="0 0 ${length} 28.7768" width="${length}" height="28.7768" xmlns="http://www.w3.org/2000/svg">
          <polyline 
            points="${rightX} 10.5705 ${rightX} 28.0268 0.7500 28.0268 0.7500 0" 
            style="fill: none; stroke: #000; stroke-width: 1.5px; stroke-miterlimit: 10;" 
          />
          <text 
            transform="translate(7.4859 19.8519)" 
            style="font-family: ${fontFamily}; font-size: 21px; font-weight: ${weight}; fill: #000; pointer-events: none; user-select: none;"
          ><tspan x="0" y="0">${label}</tspan></text>
        </svg>
      `;
    } else if (edge === 'left') {
      // Left edge: attached to x = 0 (exact match to search left edge.svg)
      const lineBottom = (length - 1.5).toFixed(4);
      const textY = (length - 7.4855).toFixed(4);
      return `
        <svg class="board-btn-svg" viewBox="0 0 29.4692 ${length}" width="29.4692" height="${length}" xmlns="http://www.w3.org/2000/svg">
          <text 
            transform="translate(19.3685 ${textY}) rotate(-90)" 
            style="font-family: ${fontFamily}; font-size: 21px; font-weight: ${weight}; fill: #000; pointer-events: none; user-select: none;"
          ><tspan x="0" y="0">${label}</tspan></text>
          <path 
            d="M 10.8423 0.75 h 17.1845 v ${lineBottom} H 0" 
            style="fill: none; stroke: #000; stroke-width: 1.5px; stroke-miterlimit: 10;" 
          />
        </svg>
      `;
    } else if (edge === 'right') {
      // Right edge: attached to x = 100% (exact match to sort right edge.svg)
      const bottomY = (length - 0.75).toFixed(4);
      return `
        <svg class="board-btn-svg" viewBox="0 0 29.4628 ${length}" width="29.4628" height="${length}" xmlns="http://www.w3.org/2000/svg">
          <text 
            transform="translate(10.1006 7.4855) rotate(90)" 
            style="font-family: ${fontFamily}; font-size: 21px; font-weight: ${weight}; fill: #000; pointer-events: none; user-select: none;"
          ><tspan x="0" y="0">${label}</tspan></text>
          <polyline 
            points="18.9225 ${bottomY} 1.4662 ${bottomY} 1.4360 0.7500 29.4628 0.7500" 
            style="fill: none; stroke: #000; stroke-width: 1.5px; stroke-miterlimit: 10;" 
          />
        </svg>
      `;
    }
  }

  destroy() {
    if (this.addPersonComponent) {
      this.addPersonComponent.destroy();
    }
    if (this.sortComponent) {
      this.sortComponent.destroy();
    }
    Object.values(this.elements).forEach((el) => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    if (this.logoEl && this.logoEl.parentNode) {
      this.logoEl.parentNode.removeChild(this.logoEl);
    }
    if (this.userBadgeEl && this.userBadgeEl.parentNode) {
      this.userBadgeEl.parentNode.removeChild(this.userBadgeEl);
    }
    if (this.bottomLineEl && this.bottomLineEl.parentNode) {
      this.bottomLineEl.parentNode.removeChild(this.bottomLineEl);
    }
  }
}
