# NOPITAC — Names Of People I Think Are Cool

An interactive typographic canvas and creative social identity platform for creatives to store, curate, and explore the names of people who inspire them.

---

## Features

- **Dynamic Typography Engine**: Custom `Nopitac Helvetica` vector typography rendering with dynamic signature underlines, customized drop/rise glyph stems, and strict metric kerning.
- **Concentric Composition Board**: Interactive rotating concentric rings of names with differential speed motion and integrated vector centering panels.
- **Animated Home & Entry Screen**: Lottie definition transitions with full authentication (sign up & sign in).
- **Post-Auth Onboarding Experience**: Modulo 1:1 scroll-revolving options for creating a personal board or exploring community boards.
- **Community Explorer**: User profiles with composition icons, domain tag chips styled with the custom `DomainType` engine, live dwell tooltips, and 1:1 edge-revolving navigation.
- **Domain System**: Domain categories with custom colors that dynamically tint the board background upon person selection.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Installation

```bash
git clone https://github.com/helloLiam1/nopitac-platform.git
cd nopitac-platform
npm install
```

### Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to explore the entry screen.

### Production Build

```bash
npm run build
npm run preview
```

---

## Routes & Architecture

- `/` / `/index.html`: Home screen with Lottie definition animations and Sign Up / Sign In modals.
- `/landing.html`: After-signup screen with revolving "create your own board" and "explore boards" edge buttons.
- `/board.html`: Concentric rings composition board (`?user=henry%20who` for the creator board, or empty mode for new users).
- `/community.html`: Community page listing creative boards with domain chips and people counts.

---

## License

ISC License
