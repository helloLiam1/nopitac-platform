/**
 * NOPITAC Optical Glyph Anchors & Stem Calibration Database
 * Normalized relative to advance width [0..1]
 */

export const DEFAULT_ANCHORS = {
  // Lowercase
  'a': { left: 0.08, right: 0.86, leftStem: 0.12, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  'b': { left: 0.13, right: 0.90, leftStem: 0.14, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'c': { left: 0.09, right: 0.89, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'd': { left: 0.08, right: 0.87, leftStem: 0.12, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  'e': { left: 0.09, right: 0.91, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'f': { left: 0.28, right: 0.85, leftStem: 0.16, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'g': { left: 0.08, right: 0.87, leftStem: 0.12, rightStem: 0.14, hasDescender: true,  descenderDepth: 0.26 },
  'h': { left: 0.13, right: 0.87, leftStem: 0.14, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  'i': { left: 0.25, right: 0.75, leftStem: 0.36, rightStem: 0.36, hasDescender: false, descenderDepth: 0 },
  'j': { left: 0.22, right: 0.74, leftStem: 0.34, rightStem: 0.34, hasDescender: true,  descenderDepth: 0.25 },
  'k': { left: 0.13, right: 0.88, leftStem: 0.14, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  'l': { left: 0.32, right: 0.68, leftStem: 0.36, rightStem: 0.36, hasDescender: false, descenderDepth: 0 },
  'm': { left: 0.09, right: 0.91, leftStem: 0.10, rightStem: 0.10, hasDescender: false, descenderDepth: 0 },
  'n': { left: 0.13, right: 0.87, leftStem: 0.14, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  'o': { left: 0.08, right: 0.91, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'p': { left: 0.13, right: 0.90, leftStem: 0.14, rightStem: 0.12, hasDescender: true,  descenderDepth: 0.25 },
  'q': { left: 0.08, right: 0.87, leftStem: 0.12, rightStem: 0.14, hasDescender: true,  descenderDepth: 0.25 },
  'r': { left: 0.20, right: 0.92, leftStem: 0.18, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  's': { left: 0.10, right: 0.90, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  't': { left: 0.28, right: 0.92, leftStem: 0.24, rightStem: 0.22, hasDescender: false, descenderDepth: 0 },
  'u': { left: 0.13, right: 0.87, leftStem: 0.14, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  'v': { left: 0.05, right: 0.95, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'w': { left: 0.05, right: 0.95, leftStem: 0.10, rightStem: 0.10, hasDescender: false, descenderDepth: 0 },
  'x': { left: 0.06, right: 0.94, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'y': { left: 0.06, right: 0.94, leftStem: 0.12, rightStem: 0.12, hasDescender: true,  descenderDepth: 0.25 },
  'z': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },

  // Uppercase
  'A': { left: 0.04, right: 0.96, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'B': { left: 0.12, right: 0.88, leftStem: 0.13, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'C': { left: 0.07, right: 0.93, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'D': { left: 0.12, right: 0.88, leftStem: 0.13, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'E': { left: 0.12, right: 0.88, leftStem: 0.13, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'F': { left: 0.12, right: 0.86, leftStem: 0.13, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'G': { left: 0.07, right: 0.91, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'H': { left: 0.12, right: 0.88, leftStem: 0.13, rightStem: 0.13, hasDescender: false, descenderDepth: 0 },
  'I': { left: 0.30, right: 0.70, leftStem: 0.38, rightStem: 0.38, hasDescender: false, descenderDepth: 0 },
  'J': { left: 0.10, right: 0.78, leftStem: 0.15, rightStem: 0.22, hasDescender: false, descenderDepth: 0 },
  'K': { left: 0.12, right: 0.92, leftStem: 0.13, rightStem: 0.13, hasDescender: false, descenderDepth: 0 },
  'L': { left: 0.12, right: 0.88, leftStem: 0.13, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'M': { left: 0.08, right: 0.92, leftStem: 0.11, rightStem: 0.11, hasDescender: false, descenderDepth: 0 },
  'N': { left: 0.12, right: 0.88, leftStem: 0.13, rightStem: 0.13, hasDescender: false, descenderDepth: 0 },
  'O': { left: 0.06, right: 0.94, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'P': { left: 0.12, right: 0.87, leftStem: 0.13, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'Q': { left: 0.06, right: 0.94, leftStem: 0.12, rightStem: 0.14, hasDescender: true,  descenderDepth: 0.15 },
  'R': { left: 0.12, right: 0.92, leftStem: 0.13, rightStem: 0.13, hasDescender: false, descenderDepth: 0 },
  'S': { left: 0.09, right: 0.91, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'T': { left: 0.40, right: 0.60, leftStem: 0.20, rightStem: 0.20, hasDescender: false, descenderDepth: 0 },
  'U': { left: 0.12, right: 0.88, leftStem: 0.13, rightStem: 0.13, hasDescender: false, descenderDepth: 0 },
  'V': { left: 0.04, right: 0.96, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'W': { left: 0.04, right: 0.96, leftStem: 0.10, rightStem: 0.10, hasDescender: false, descenderDepth: 0 },
  'X': { left: 0.05, right: 0.95, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'Y': { left: 0.05, right: 0.95, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  'Z': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },

  // Numbers & Punctuation
  '0': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  '1': { left: 0.25, right: 0.75, leftStem: 0.25, rightStem: 0.25, hasDescender: false, descenderDepth: 0 },
  '2': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  '3': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  '4': { left: 0.06, right: 0.90, leftStem: 0.12, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  '5': { left: 0.08, right: 0.90, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  '6': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  '7': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.14, hasDescender: false, descenderDepth: 0 },
  '8': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  '9': { left: 0.08, right: 0.92, leftStem: 0.12, rightStem: 0.12, hasDescender: false, descenderDepth: 0 },
  '.': { left: 0.20, right: 0.80, leftStem: 0.30, rightStem: 0.30, hasDescender: false, descenderDepth: 0 },
  '-': { left: 0.05, right: 0.95, leftStem: 0.15, rightStem: 0.15, hasDescender: false, descenderDepth: 0 },
  '_': { left: 0.00, right: 1.00, leftStem: 0.10, rightStem: 0.10, hasDescender: false, descenderDepth: 0 }
};

const STORAGE_KEY = 'nopitac_glyph_anchors_v1';

export function loadCustomAnchors() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ANCHORS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ANCHORS, ...parsed };
  } catch (e) {
    console.warn('Failed to load custom anchors, falling back to defaults', e);
    return { ...DEFAULT_ANCHORS };
  }
}

export function saveCustomAnchor(char, update) {
  try {
    const current = loadCustomAnchors();
    current[char] = { ...(current[char] || DEFAULT_ANCHORS[char] || { left: 0.1, right: 0.9 }), ...update };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    return current;
  } catch (e) {
    console.error('Failed to save custom anchor', e);
    return DEFAULT_ANCHORS;
  }
}

export function resetAnchorsToDefault() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
  return { ...DEFAULT_ANCHORS };
}
