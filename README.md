# AeroLab — 2D Wind Tunnel

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

AeroLab is a real-time, browser-based 2D computational fluid dynamics (CFD) workstation powered by a WebGL2 **D2Q9 Lattice-Boltzmann** solver with **Smagorinsky Large Eddy Simulation (LES)**. Load built-in or custom airfoils, reshape camber and thickness interactively, inspect live flow fields, compare against a physics-informed surrogate, and sync runs and profiles with Supabase.

---

## Features

### 3-Part Responsive Workstation (`/`)
- **Results Panel (Left)**: Live lift coefficient ($C_L$), drag coefficient ($C_D$), lift-to-drag ratio ($L/D$), simulated Reynolds number ($Re$), flow separation state (`Attached` / `Separation %` / `Stall`), **NeuroFoil** surrogate & best-run comparator, interactive **Plotly.js** telemetry charts, and exportable data sheets.
- **Fixed 2D Wind Tunnel (Center)**: GPU-accelerated `640 × 320` Lattice-Boltzmann viewport with adaptive step rate, live pause/resume, reset controls, and PNG flow-snapshot export.
- **Control Panel (Right)**: Built-in airfoil selector, drag-and-drop `.dat`/`.txt` uploader with public Supabase Community Library publishing, angle of attack ($\alpha$) slider and presets, flow field selector, Reynolds number control, interactive Bézier shape editor, and field guide.
- **Header Navigation**: Workstation toggles (**Results**, **Wind Tunnel**, **Controls**) that collapse/expand sidebars on desktop and switch full-screen views on mobile/tablet, plus direct access to the **Pilot Profile (`/profile`)**.

### Pilot Profile & Supabase Cloud Sync (`/profile`)
- **Authentication**: Clean email/password sign-in and account creation as well as Google OAuth via Supabase Auth.
- **Editable Pilot Identity & Avatar**: Upload or drag-and-drop a profile photo (`PNG`, `JPG`, `WebP` — auto-cropped to `256 × 256` on the client and synced to Supabase Storage when configured, with local persistence fallback), and edit your display name, role/title, organization/lab, location, and 280-character bio.
- **Flight Envelope & Simulation History**: KPI summary (`Saved Runs`, `Uploaded Airfoils`, `Personal Best L/D`, `Best Airfoil`), Flight Envelope Summary (`Mean L/D`, `Peak CL`, `Min CD`, top airfoils bar breakdown), searchable/sortable run table (`Recent`, `Best L/D`, `Max CL`), CSV flight log export, and 1-click **Run** replay back into the wind tunnel.
- **Uploaded Airfoil Vault**: Searchable list of user-uploaded airfoils with live SVG cross-section previews, camber/thickness metadata, 1-click tunnel loading, and `.dat` download.
- **Community Sharing**: Browse, simulate, download, and compare against public `.dat` airfoils and recorded benchmark runs synced via Supabase Realtime.

### NeuroFoil Surrogate & Flow Comparison
- **Live Geometry Surrogate (`src/lib/neurofoil.ts`)**: Extracts 7 geometric descriptors (camber, camber location, thickness, thickness location, leading-edge radius, trailing-edge boat-tail angle, aft reflex) and predicts $-8^\circ \dots +20^\circ$ viscous polars at the active Reynolds number.
- **Live Guidance & 1-Click Jump**: Reports predicted optimal incidence ($\alpha^*$), peak $L/D$, stall onset ($\alpha_{\text{stall}}$), flow regime, live LBM-vs-NeuroFoil agreement `%`, and a **`Jump α*`** action.
- **Reference File Overlay**: Load `.json`, `.csv`, or `.dat` comparison files (or pick any community airfoil as a reference) to overlay against live LBM curves and leaderboard runs.

### Flow Visualization Modes
- **Velocity**: Local flow speed normalized to freestream speed ($\times U_\infty$).
- **Pressure ($C_p$)**: Surface and domain pressure coefficient field.
- **Vorticity**: Shear-layer and wake rotation rate ($U/c$), highlighting counter-clockwise and clockwise vortices.
- **Smoke**: Passive tracer dye streaks advected upstream to reveal streamlines, separation bubbles, and vortex shedding.

### Interactive Bézier Shape Editor
- Automatically fits a smooth Bézier camber and thickness representation to the active airfoil.
- Drag amber camber handles or blue thickness handles to deform the airfoil and watch the 2D wind tunnel respond in real time.
- Reset to the original geometry or download the modified coordinates as a Selig `.dat` file.

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

- **Frontend**: React 19, TypeScript, React Router DOM 7, Vite 8, Tailwind CSS v4, Plotly.js, Lucide Icons
- **Backend / Persistence**: Supabase Auth, Postgres with Row-Level Security & Realtime (`supabase/schema.sql`), and optional Supabase Storage (`avatars` bucket)
- **CFD Solver**: Custom WebGL2 `EXT_color_buffer_float` D2Q9 Smagorinsky LES engine (`src/lib/lbm/tunnel2d.js`)
- **Surrogate & Shape Parameterization**: NeuroFoil physics-informed surrogate (`src/lib/neurofoil.ts`) & Bézier fitter (`src/lib/lbm/bezierShape.js`)

```text
├── .env.example                    # Supabase environment variable template
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── examples/                   # Bundled .dat airfoil coordinate files
│   ├── aerolab-logo.png
│   └── favicon.png
├── supabase/
│   └── schema.sql                  # Supabase tables, RLS policies & Realtime setup
└── src/
    ├── App.tsx                     # Router & 3-part CFD workstation layout/state
    ├── main.tsx                    # React entry point + BrowserRouter + SupabaseProvider
    ├── theme.css                   # Tailwind v4 theme tokens & custom controls
    ├── types.ts                    # Shared TypeScript interfaces
    ├── plotly.d.ts                 # Type declarations for plotly.js-basic-dist-min
    ├── pages/
    │   └── ProfilePage.tsx         # Sign-in screen & Pilot Profile dashboard
    ├── components/
    │   ├── AirfoilPicker.tsx       # Bundled, custom & community airfoil browser
    │   ├── BenchmarkComparison.tsx # NeuroFoil surrogate & best-run comparator
    │   ├── ResultsAnalytics.tsx    # Plotly Graph (PNG/SVG) & Data Sheet (CSV/JSON)
    │   ├── ShapeEditor2D.tsx       # Interactive Bézier airfoil shape editor
    │   ├── SupabaseProvider.tsx    # Auth session, pilot profile & Realtime sync
    │   └── ui.tsx                  # Shared form & diagnostic primitives
    ├── utils/
    │   └── supabase.ts             # Supabase client initialization
    └── lib/
        ├── airfoilParser.js        # Selig/Lednicer .dat parser & geometry normalizer
        ├── airfoilRepository.ts    # Supabase CRUD, avatar processing & ref parsers
        ├── files.js                # FileReader, CSV serializer & download helpers
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
- *(Optional)* A Supabase project configured with `supabase/schema.sql` for authentication, pilot profiles, and community airfoil/benchmark sync

### Environment Variables
Copy `.env.example` to `.env` and fill in your Supabase project credentials if using cloud sync and pilot accounts:

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-anon-key"
```

The wind tunnel solver, Bézier editor, NeuroFoil surrogate, and local `.dat` uploads also run client-side without Supabase credentials.

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
| `npm run lint` | Run TypeScript type checks (`tsc --noEmit`) |
| `npm run clean` | Remove the `dist/` build directory |

---

## Acknowledgements

The 2D Lattice-Boltzmann solver is adapted from the [Kutta](https://github.com/crgimenes/kutta) open-source flow visualizer by Cesar Gimenes (MIT License).

---

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for details.
