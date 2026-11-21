# AeroLab — 2D Wind Tunnel

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

AeroLab is a real-time, browser-based 2D computational fluid dynamics (CFD) workstation powered by a WebGL2 **D2Q9 Lattice-Boltzmann** solver with **Smagorinsky Large Eddy Simulation (LES)**. Load built-in or custom airfoils, reshape camber and thickness interactively, inspect live flow fields, and export graphs, data sheets, and flow snapshots directly from your browser.

---

## Features

### 3-Part Responsive Workstation
- **Results Panel (Left)**: Live lift coefficient ($C_L$), drag coefficient ($C_D$), lift-to-drag ratio ($L/D$), simulated Reynolds number ($Re$), flow separation state (`Attached` / `Separation %` / `Stall`), **Google Sign-In Pilot Profile** (past simulation results, personal best $L/D$, and uploaded airfoils), **NeuroFoil** surrogate & best-run comparator, interactive Plotly telemetry graph, and exportable data sheet.
- **Fixed 2D Wind Tunnel (Center)**: GPU-accelerated `640 × 320` lattice-Boltzmann viewport with adaptive step rate, live pause/resume, and PNG export.
- **Control Panel (Right)**: Built-in airfoil selector, drag-and-drop `.dat`/`.txt` uploader with public Firebase Community Library sharing, angle of attack ($\alpha$) slider and presets, flow field selector, Reynolds number control, interactive Bézier shape editor, and field guide.
- **Header Navigation**: Three workstation switches (**Results**, **Wind Tunnel**, **Controls**) that toggle panels on desktop and switch full-screen views on mobile and tablet displays.

### Pilot Profile & Community Firebase Repository
- **Google Sign-In Profile**: Sign in with Google to track personal stats (`Past Runs`, `Uploads`, `Best L/D`), re-apply saved $\alpha$ / $Re$ / airfoil test conditions in one click, and manage your uploaded airfoils.
- **Open Community Sharing**: Anyone can upload custom `.dat`/`.txt` airfoils or publish benchmark runs so any visitor can load, simulate, download, or compare against them.

### NeuroFoil Surrogate & Flow Comparison
- **Live Geometry Surrogate (`src/lib/neurofoil.ts`)**: Extracts 7 geometric descriptors (camber, camber location, thickness, thickness location, leading-edge radius, trailing-edge boat-tail angle, aft reflex) and predicts full $-8^\circ \dots +20^\circ$ viscous polars at the active Reynolds number.
- **Live Guidance & 1-Click Jump**: Reports predicted optimal incidence ($\alpha^*$), peak $L/D$, stall onset ($\alpha_{\text{stall}}$), flow regime, live LBM-vs-NeuroFoil agreement `%`, and a **`Jump α*`** action.
- **Reference File Overlay**: Load `.json`, `.csv`, or `.dat` comparison files (or pick any community airfoil as a reference) to overlay against live LBM curves and the leaderboard best run.

### Flow Visualization Modes
- **Velocity**: Local flow speed normalized to freestream speed ($\times U_\infty$).
- **Pressure ($C_p$)**: Surface and domain pressure coefficient field.
- **Vorticity**: Shear-layer and wake rotation rate ($U/c$), highlighting counter-clockwise and clockwise vortices.
- **Smoke**: Passive tracer dye streaks advected upstream to reveal streamlines, separation bubbles, and vortex shedding.

### Interactive Bézier Shape Editor
- Automatically fits a smooth Bézier camber and thickness representation to the active airfoil.
- Drag amber camber handles or blue thickness handles to deform the airfoil and observe the 2D wind tunnel respond in real time.
- Reset to the original geometry or download the modified coordinates as a `.dat` file.

### Graphs, Data Sheets & Exports
- **Telemetry Graph (Plotly.js)**: Switch between **History**, **$\alpha$ Polar** ($C_L$ / $C_D$ with NeuroFoil or reference overlay), and **L/D** efficiency polar with best-benchmark markers. Export any chart view as **PNG** or **SVG**.
- **Data Sheet**: Live tabular log of sample index, airfoil, $\alpha$, Reynolds number, $C_L$, $C_D$, $L/D$, separation percentage, and flow state. Log manual snapshots, clear history, and download as **CSV** or **JSON**.
- **Wind Tunnel & Geometry Exports**: Export the live flow viewport as a **PNG** image and export active airfoil coordinates in Selig **`.dat`** format.

---

## Airfoil Support & `.dat` Parser

Built-in airfoils:
- **NACA 0012** (`public/examples/naca0012.dat`)
- **NACA 4412** (`public/examples/naca4412.dat`)
- **Clark Y** (`public/examples/clarky.dat`)
- **Selig S1223** (`public/examples/s1223.dat`)
- **Eppler 387** (`public/examples/e387.dat`)

Custom `.dat` / `.txt` uploads support both **Selig** (trailing edge → upper surface → leading edge → lower surface → trailing edge) and **Lednicer** (separate upper and lower LE → TE sections) coordinate files up to 1 MB, with automatic winding-order repair, duplicate point removal, and mixed-whitespace normalization.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Pause / Resume simulation |
| `↑` / `↓` | Adjust angle of attack ($\pm 0.5^\circ$, range $-20^\circ$ to $+25^\circ$) |
| `←` / `→` | Adjust simulated Reynolds flow speed |
| `R` | Reset flow parameters and lattice state |

---

## Tech Stack & Project Structure

- **Frontend**: React 19, Vite 8, Tailwind CSS v4, Plotly.js, Lucide Icons
- **Backend / Persistence**: Firebase Auth (Google Sign-In) & Cloud Firestore (`firebase-blueprint.json`, `firestore.rules`)
- **CFD Solver**: Custom WebGL2 `EXT_color_buffer_float` D2Q9 Smagorinsky LES engine (`src/lib/lbm/tunnel2d.js`)
- **Surrogate & Shape Parameterization**: NeuroFoil physics-informed surrogate (`src/lib/neurofoil.ts`) & Bézier fitter (`src/lib/lbm/bezierShape.js`)

```text
├── firebase-blueprint.json
├── firestore.rules
├── index.html
├── package.json
├── public/
│   ├── examples/                   # Bundled .dat airfoil coordinate files
│   ├── aerolab-logo.png
│   └── favicon.png
└── src/
    ├── App.jsx                     # 3-part CFD workstation layout & state
    ├── main.jsx                    # React entry point + FirebaseProvider
    ├── theme.css                   # Tailwind v4 theme tokens & custom controls
    ├── components/
    │   ├── AirfoilPicker.jsx       # Bundled, custom & Firebase airfoil browser
    │   ├── BenchmarkComparison.jsx # NeuroFoil surrogate & best-run comparator
    │   ├── FirebaseProvider.tsx    # Auth, profile & public collection sync
    │   ├── ResultsAnalytics.jsx    # Plotly Graph (PNG/SVG) & Data Sheet (CSV/JSON)
    │   ├── ShapeEditor2D.jsx       # Interactive Bézier airfoil shape editor
    │   ├── UserProfileCard.jsx     # Google Pilot Profile (Past Results & Uploads)
    │   └── ui.jsx                  # Shared form & diagnostic primitives
    └── lib/
        ├── airfoilParser.js        # Selig/Lednicer .dat parser & geometry normalizer
        ├── airfoilRepository.ts    # Firestore CRUD, user profile & ref parsers
        ├── files.js                # FileReader, CSV serializer & download helpers
        ├── firebase.ts             # Firebase SDK init, Google Auth & error handler
        ├── neurofoil.ts            # NeuroFoil geometry feature extractor & surrogate
        └── lbm/
            ├── bezierShape.js      # Bézier airfoil fitting & curve generation
            └── tunnel2d.js         # WebGL2 D2Q9 Lattice-Boltzmann 2D wind tunnel
```

---

## Local Development

### Prerequisites
- Node.js 18+
- A browser with **WebGL2** and `EXT_color_buffer_float` support

### Setup & Commands

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

| Script | Description |
|---|---|
| `npm run dev` | Start Vite development server on port `3000` |
| `npm run build` | Build production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run TypeScript checks (`tsc --noEmit`) |

---

## Acknowledgements

The 2D Lattice-Boltzmann solver is adapted from the [Kutta](https://github.com/crgimenes/kutta) open-source flow visualizer by Cesar Gimenes (MIT License).

---

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.
