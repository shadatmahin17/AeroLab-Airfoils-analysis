import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Gauge,
  Keyboard,
  Layers,
  Pause,
  Play,
  Radar,
  RotateCcw,
  SlidersHorizontal,
  Spline,
  TrendingUp,
  User,
  UserCheck,
  Wind,
} from "lucide-react";
import AirfoilPicker from "./components/AirfoilPicker.tsx";
import BenchmarkComparison from "./components/BenchmarkComparison.tsx";
import { useSupabase, type AppUser } from "./components/SupabaseProvider.tsx";
import ResultsAnalytics from "./components/ResultsAnalytics.tsx";
import ShapeEditor2D from "./components/ShapeEditor2D.tsx";
import { Alert, ParserBox, SliderField } from "./components/ui.tsx";
import ProfilePage from "./pages/ProfilePage.tsx";
import { LBM, createWindTunnel2D, lbmNaca4, lbmSimRe } from "./lib/lbm/tunnel2d.js";
import { EXAMPLE_AIRFOILS, downloadText, loadExample } from "./lib/files.js";
import { parseDatText } from "./lib/airfoilParser.js";
import { runNeuroFoilPrediction } from "./lib/neurofoil.ts";
import type {
  BenchmarkRunDoc,
  NeutralReferenceData,
  SharedAirfoilDoc,
  UserProfileDoc,
} from "./lib/airfoilRepository.ts";
import type {
  AirfoilSelection,
  Coord2D,
  TelemetrySample,
  TunnelController,
  TunnelStats,
} from "./types.ts";

const FIELD_MODES: Array<[string, string]> = [
  ["0", "Velocity"],
  ["1", "Pressure (Cp)"],
  ["2", "Vorticity"],
  ["3", "Smoke"],
];

const FIELD_GUIDE: Array<[string, string, string]> = [
  ["0", "Velocity", "Flow speed relative to freestream. Reveals suction peak & wake deficit."],
  ["1", "Pressure (Cp)", "Surface pressure distribution. Cool = suction, warm = stagnation."],
  ["2", "Vorticity", "Shear-layer rotation & trailing-edge vortex shedding."],
  ["3", "Smoke", "Upstream tracer dye streamlines showing separation & eddies."],
];

const DEFAULT_ALPHA = 6;
const DEFAULT_U0_MM = 60;

interface WorkstationViewProps {
  choice: string;
  setChoice: Dispatch<SetStateAction<string>>;
  airfoil: AirfoilSelection;
  activeCoords: Coord2D[];
  setActiveCoords: Dispatch<SetStateAction<Coord2D[]>>;
  onSelectAirfoil: (next: AirfoilSelection) => void;
  user: AppUser | null;
  userProfile: UserProfileDoc | null;
  benchmarks: BenchmarkRunDoc[];
  sharedAirfoils: SharedAirfoilDoc[];
  cloudError: string | null;
  customRef: NeutralReferenceData | null;
  setCustomRef: Dispatch<SetStateAction<NeutralReferenceData | null>>;
  alpha: number;
  setAlpha: Dispatch<SetStateAction<number>>;
  fieldMode: string;
  setFieldMode: Dispatch<SetStateAction<string>>;
  u0Scaled: number;
  setU0Scaled: Dispatch<SetStateAction<number>>;
  samples: TelemetrySample[];
  setSamples: Dispatch<SetStateAction<TelemetrySample[]>>;
  sampleIdRef: MutableRefObject<number>;
  appendSample: (next: TunnelStats) => void;
  tunnelRef: MutableRefObject<TunnelController | null>;
}

function WorkstationView({
  choice,
  setChoice,
  airfoil,
  activeCoords,
  setActiveCoords,
  onSelectAirfoil,
  user,
  userProfile,
  benchmarks,
  sharedAirfoils,
  cloudError,
  customRef,
  setCustomRef,
  alpha,
  setAlpha,
  fieldMode,
  setFieldMode,
  u0Scaled,
  setU0Scaled,
  samples,
  setSamples,
  sampleIdRef,
  appendSample,
  tunnelRef,
}: WorkstationViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [stepsPerFrame, setStepsPerFrame] = useState(10);
  const [glError, setGlError] = useState<string | null>(null);

  const [mobileTab, setMobileTab] = useState<"results" | "tunnel" | "controls">("tunnel");
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [resultsTab, setResultsTab] = useState<"analytics" | "neurofoil">("analytics");
  const [controlsTab, setControlsTab] = useState<"flow" | "airfoils" | "shape">("flow");

  const [stats, setStats] = useState<TunnelStats>({
    cl: null,
    cd: null,
    reynolds: Math.round(lbmSimRe(u0Scaled / 1000) / 10) * 10,
    separationPct: 0,
  });

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return undefined;
    const ctrl = createWindTunnel2D(cv, {
      coords: activeCoords,
      name: airfoil.name,
      alphaDeg: alpha,
      u0: u0Scaled / 1000,
      fieldMode: Number(fieldMode),
      onStats: (next: TunnelStats) => {
        setStats(next);
        appendSample(next);
      },
      onSteps: (s: number) => setStepsPerFrame(s),
      onError: (msg: string) => setGlError(msg),
    }) as TunnelController;
    tunnelRef.current = ctrl;
    return () => {
      ctrl.destroy();
      tunnelRef.current = null;
    };
  }, [appendSample, tunnelRef]);

  const handleAlphaChange = (val: number) => {
    setAlpha(val);
    tunnelRef.current?.setAlpha(val);
  };

  const handleFieldChange = (val: string) => {
    setFieldMode(val);
    tunnelRef.current?.setField(Number(val));
  };

  const handleReynoldsChange = (val: number) => {
    setU0Scaled(val);
    tunnelRef.current?.setU0(val / 1000);
  };

  const handleTogglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      tunnelRef.current?.setPaused(next);
      return next;
    });
  }, [tunnelRef]);

  const handleResetAll = useCallback(() => {
    setAlpha(DEFAULT_ALPHA);
    setFieldMode("0");
    setU0Scaled(DEFAULT_U0_MM);
    setPaused(false);
    setActiveCoords(airfoil.coords);
    const t = tunnelRef.current;
    if (t) {
      t.setPaused(false);
      t.setField(0);
      t.setU0(DEFAULT_U0_MM / 1000);
      t.setCoords(airfoil.coords, airfoil.name);
      t.setAlpha(DEFAULT_ALPHA);
      t.resetFlow();
    }
  }, [airfoil, setActiveCoords, setAlpha, setFieldMode, setU0Scaled, tunnelRef]);

  const handleDownloadDat = () => {
    const base = (airfoil.name || "airfoil").replace(/\.(dat|txt)$/i, "");
    const text =
      `${base}\n` +
      activeCoords.map(([x, y]) => `${x.toFixed(6).padStart(10)} ${y.toFixed(6).padStart(10)}`).join("\n") +
      "\n";
    downloadText(`${base.replace(/[^\w.-]+/g, "_")}.dat`, text);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePause();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setAlpha((prev) => {
          const next = Math.min(25, +(prev + 0.5).toFixed(1));
          tunnelRef.current?.setAlpha(next);
          return next;
        });
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setAlpha((prev) => {
          const next = Math.max(-20, +(prev - 0.5).toFixed(1));
          tunnelRef.current?.setAlpha(next);
          return next;
        });
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setU0Scaled((prev) => {
          const next = Math.min(100, prev + 2);
          tunnelRef.current?.setU0(next / 1000);
          return next;
        });
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setU0Scaled((prev) => {
          const next = Math.max(30, prev - 2);
          tunnelRef.current?.setU0(next / 1000);
          return next;
        });
      } else if (e.key === "r" || e.key === "R") {
        handleResetAll();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleResetAll, handleTogglePause, setAlpha, setU0Scaled, tunnelRef]);

  const handleHeaderClick = (section: "results" | "tunnel" | "controls") => {
    setMobileTab(section);
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      if (section === "results") setShowLeftSidebar((p) => !p);
      else if (section === "controls") setShowRightSidebar((p) => !p);
      else if (section === "tunnel") {
        const nextOpen = !(showLeftSidebar && showRightSidebar);
        setShowLeftSidebar(nextOpen);
        setShowRightSidebar(nextOpen);
      }
    }
  };

  const simRe = Math.round(lbmSimRe(u0Scaled / 1000) / 10) * 10;
  const sepPct = stats.separationPct;
  const isStalled = sepPct >= 25;
  const flowState =
    sepPct < 5
      ? { label: "Attached", color: "#047857", Icon: CheckCircle2 }
      : sepPct < 25
        ? { label: `${sepPct}% Sep`, color: "#B45309", Icon: AlertTriangle }
        : { label: `Stall (${sepPct}%)`, color: "#DC2626", Icon: AlertTriangle };

  const liftToDrag =
    stats.cl !== null && stats.cd !== null && stats.cd > 0.001
      ? (stats.cl / stats.cd).toFixed(2)
      : "—";

  const activeFieldLabel =
    FIELD_MODES.find(([value]) => value === fieldMode)?.[1] || "Velocity";

  const neurofoilPrediction = useMemo(
    () => runNeuroFoilPrediction(airfoil.name, activeCoords, stats.reynolds),
    [airfoil.name, activeCoords, stats.reynolds]
  );

  const profileLabel =
    userProfile?.displayName ||
    user?.displayName?.split(/\s+/)[0] ||
    (user ? "Profile" : "Sign in");

  return (
    <div className="h-screen h-[100dvh] w-full overflow-hidden bg-[var(--bg)] text-[var(--text)] flex flex-col font-sans select-none selection:bg-[var(--accent-light)] selection:text-[var(--accent)]">
      <header className="h-12 sm:h-14 px-3 sm:px-5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2 sm:gap-4 z-30 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="flex items-center gap-2">
            <img
              src="/aerolab-logo.png"
              alt="AeroLab"
              className="h-5 min-[400px]:h-6 sm:h-7 w-auto object-contain shrink-0"
            />
            <span className="hidden md:inline font-script text-xl leading-none text-[#1769AA] pt-0.5 whitespace-nowrap">
              Wind Tunnel
            </span>
          </div>

          <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-[var(--border)] text-xs font-mono tabular-nums text-[#5C6670] whitespace-nowrap">
            <span className="font-sans font-semibold text-[#161A1D]">{airfoil.name}</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#1769AA] font-semibold">
              α {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}°
            </span>
            <span aria-hidden="true">·</span>
            <span>Re {simRe.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: flowState.color }} className="font-semibold">
              {flowState.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <nav
            aria-label="Workstation sections"
            className="flex items-center p-0.5 sm:p-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] gap-0.5 sm:gap-1 shrink-0"
          >
            <button
              type="button"
              onClick={() => handleHeaderClick("results")}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mobileTab === "results"
                  ? "bg-[#1769AA] text-white lg:bg-[var(--surface)] lg:text-[#161A1D]"
                  : "text-[#5C6670] hover:text-[#161A1D]"
              } ${showLeftSidebar ? "lg:bg-[var(--accent-light)] lg:text-[#1769AA]" : "lg:bg-transparent lg:text-[#5C6670]"}`}
            >
              <Gauge size={13} className="hidden min-[380px]:inline shrink-0" aria-hidden="true" />
              <span>Results</span>
            </button>

            <button
              type="button"
              onClick={() => handleHeaderClick("tunnel")}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mobileTab === "tunnel"
                  ? "bg-[#1769AA] text-white"
                  : "text-[#5C6670] hover:text-[#161A1D]"
              } lg:bg-[#1769AA] lg:text-white`}
            >
              <Wind size={13} className="hidden min-[380px]:inline shrink-0" aria-hidden="true" />
              <span>Wind Tunnel</span>
            </button>

            <button
              type="button"
              onClick={() => handleHeaderClick("controls")}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mobileTab === "controls"
                  ? "bg-[#1769AA] text-white lg:bg-[var(--surface)] lg:text-[#161A1D]"
                  : "text-[#5C6670] hover:text-[#161A1D]"
              } ${showRightSidebar ? "lg:bg-[var(--accent-light)] lg:text-[#1769AA]" : "lg:bg-transparent lg:text-[#5C6670]"}`}
            >
              <SlidersHorizontal size={13} className="hidden min-[380px]:inline shrink-0" aria-hidden="true" />
              <span>Controls</span>
            </button>
          </nav>

          <Link
            to="/profile"
            aria-label="Open pilot profile page"
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold bg-[var(--bg)] border border-[var(--border)] text-[#161A1D] hover:border-[#1769AA] hover:text-[#1769AA] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={profileLabel}
                className="w-4 h-4 rounded-full object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : user ? (
              <UserCheck size={13} className="text-[#1769AA] shrink-0" aria-hidden="true" />
            ) : (
              <User size={13} className="text-[#1769AA] shrink-0" aria-hidden="true" />
            )}
            <span className="hidden sm:inline max-w-28 truncate">{profileLabel}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 min-w-0 relative pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <aside
          id="results"
          aria-label="Results section"
          className={`
            ${showLeftSidebar ? "lg:flex lg:w-80 xl:w-[22rem] 2xl:w-[25rem]" : "lg:hidden"}
            ${mobileTab === "results" ? "flex flex-1 w-full" : "hidden"}
            min-w-0 flex-shrink-0 h-full overflow-y-auto overscroll-contain custom-scrollbar lg:border-r border-[var(--border)] bg-[var(--bg)] p-3 sm:p-4 flex-col gap-3 z-20
          `}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <Gauge size={15} className="text-[#1769AA]" aria-hidden="true" />
              <h2 className="text-xs font-bold tracking-wide uppercase text-[#161A1D]">Results</h2>
            </div>
            <span className="text-[11px] font-mono text-[#5C6670] truncate">
              {airfoil.name} · {alpha.toFixed(1)}°
            </span>
          </div>

          <div className="antigravity-glass rounded-xl overflow-hidden shrink-0">
            <div className="grid grid-cols-2 divide-x divide-y divide-[var(--border)]">
              <div className="p-2.5">
                <div className="text-[10.5px] font-medium text-[#5C6670]">Lift Coeff (CL)</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#161A1D] mt-0.5">
                  {stats.cl === null ? "—" : stats.cl.toFixed(3)}
                </div>
              </div>
              <div className="p-2.5 border-t-0">
                <div className="text-[10.5px] font-medium text-[#5C6670]">Drag Coeff (CD)</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#161A1D] mt-0.5">
                  {stats.cd === null ? "—" : stats.cd.toFixed(3)}
                </div>
              </div>
              <div className="p-2.5">
                <div className="text-[10.5px] font-medium text-[#5C6670]">Lift / Drag</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#1769AA] mt-0.5">
                  {liftToDrag}
                </div>
              </div>
              <div className="p-2.5">
                <div className="text-[10.5px] font-medium text-[#5C6670]">Reynolds (Re)</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#161A1D] mt-0.5">
                  {stats.reynolds.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between gap-2 text-xs">
              <span
                className="font-mono font-bold flex items-center gap-1.5"
                style={{ color: flowState.color }}
              >
                <flowState.Icon size={14} aria-hidden="true" />
                <span>{flowState.label}</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-[#5C6670]">
                {sepPct}% chord · {activeCoords.length} pts
              </span>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Results views"
            className="grid grid-cols-2 p-0.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11.5px] gap-0.5 shrink-0"
          >
            {(
              [
                { id: "analytics", label: "Analytics", Icon: TrendingUp },
                { id: "neurofoil", label: "NeuroFoil", Icon: Radar },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = resultsTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setResultsTab(id)}
                  className={`py-1.5 px-2 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-[#1769AA] text-white"
                      : "text-[#5C6670] hover:text-[#161A1D]"
                  }`}
                >
                  <Icon size={12} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {resultsTab === "analytics" && (
            <ResultsAnalytics
              samples={samples}
              airfoilName={airfoil.name}
              neutralRef={customRef || neurofoilPrediction.asReference}
              bestBenchmark={benchmarks[0] || null}
              onRecordSnapshot={() => appendSample(stats)}
              onClearSamples={() => {
                sampleIdRef.current = 0;
                setSamples([]);
              }}
            />
          )}

          {resultsTab === "neurofoil" && (
            <BenchmarkComparison
              stats={stats}
              alpha={alpha}
              airfoil={airfoil}
              benchmarks={benchmarks}
              neurofoilPrediction={neurofoilPrediction}
              customRef={customRef}
              onCustomRefChange={setCustomRef}
              onJumpToAlpha={handleAlphaChange}
              user={user}
            />
          )}
        </aside>

        <section
          id="tunnel"
          aria-label="2D Wind Tunnel Viewport"
          className={`
            ${mobileTab === "tunnel" ? "flex flex-1 w-full" : "hidden lg:flex"}
            flex-1 min-w-0 h-full min-h-0 relative flex-col overflow-hidden bg-[var(--bg)] p-2.5 sm:p-3.5 gap-2
          `}
        >
          <div className="tunnel-stage flex-1 min-h-0 w-full">
            <div className="tunnel-card rounded-xl border border-[var(--border)] bg-[var(--dark)] flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--dark-surface)] flex items-center justify-between gap-2 flex-shrink-0 bg-[#11161A]">
                <div className="flex items-center gap-2 min-w-0">
                  <Wind size={15} className="text-[#38BDF8] shrink-0" aria-hidden="true" />
                  <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                    2D Wind Tunnel
                  </span>
                  <span className="hidden sm:inline text-slate-600" aria-hidden="true">·</span>
                  <span className="hidden sm:inline text-xs font-mono text-slate-400 truncate">
                    {airfoil.name} · {activeFieldLabel}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="hidden md:inline text-[11px] font-mono tabular-nums text-slate-400 mr-1">
                    {paused ? "Paused" : `${stepsPerFrame} steps/f`}
                  </span>
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold bg-[#1B2228] hover:bg-[#252E36] text-slate-200 border border-slate-700/70 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
                    <span>{paused ? "Resume" : "Pause"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => tunnelRef.current?.savePng()}
                    className="px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold bg-[#1769AA] hover:bg-[#12568C] text-white transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Download size={12} aria-hidden="true" />
                    <span className="hidden min-[420px]:inline">Save PNG</span>
                  </button>
                </div>
              </div>

              {glError && (
                <div className="p-2.5 flex-shrink-0">
                  <Alert kind="error">{glError}</Alert>
                </div>
              )}

              <canvas
                ref={canvasRef}
                width={640}
                height={320}
                className="tunnel-canvas bg-[#0D1114]"
              />

              <div className="px-3 py-1.5 border-t border-[var(--dark-surface)] flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400 flex-shrink-0 bg-[#11161A]">
                <span className="truncate">640 × 320 D2Q9 Smagorinsky LES</span>
                <span className="shrink-0">
                  α = {alpha.toFixed(1)}° · Re ≈ {simRe.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="lg:hidden flex flex-col gap-2 flex-shrink-0">
            <div className="grid grid-cols-4 divide-x divide-[var(--border)] antigravity-glass rounded-lg overflow-hidden [@media(max-height:520px)]:hidden">
              <div className="px-2 py-1.5 text-center">
                <div className="text-[10px] font-semibold text-[#5C6670]">CL</div>
                <div className="text-xs font-bold font-mono tabular-nums text-[#161A1D]">
                  {stats.cl === null ? "—" : stats.cl.toFixed(2)}
                </div>
              </div>
              <div className="px-2 py-1.5 text-center">
                <div className="text-[10px] font-semibold text-[#5C6670]">CD</div>
                <div className="text-xs font-bold font-mono tabular-nums text-[#161A1D]">
                  {stats.cd === null ? "—" : stats.cd.toFixed(3)}
                </div>
              </div>
              <div className="px-2 py-1.5 text-center">
                <div className="text-[10px] font-semibold text-[#5C6670]">L/D</div>
                <div className="text-xs font-bold font-mono tabular-nums text-[#1769AA]">
                  {liftToDrag}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileTab("results")}
                className="px-2 py-1.5 text-center cursor-pointer"
              >
                <div className="text-[10px] font-semibold text-[#5C6670]">Flow</div>
                <div
                  className="text-[11px] font-bold font-mono truncate"
                  style={{ color: flowState.color }}
                >
                  {flowState.label}
                </div>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-lg border border-[var(--border)]">
                <span className="text-[10.5px] text-[var(--text-secondary)] font-mono pl-1 pr-0.5">AoA:</span>
                {[-5, 0, 6, 12].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAlphaChange(preset)}
                    className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                      Math.abs(alpha - preset) < 0.3
                        ? "bg-[#1769AA] text-white font-semibold"
                        : "bg-[var(--bg)] text-[var(--text)] hover:text-[#1769AA]"
                    }`}
                  >
                    {preset}°
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Field view"
                  value={fieldMode}
                  onChange={(e) => handleFieldChange(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
                >
                  {FIELD_MODES.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </section>

        <form
          id="controls"
          aria-label="Control panel"
          onSubmit={(e) => e.preventDefault()}
          className={`
            ${showRightSidebar ? "lg:flex lg:w-80 xl:w-[22rem] 2xl:w-[25rem]" : "lg:hidden"}
            ${mobileTab === "controls" ? "flex flex-1 w-full" : "hidden"}
            min-w-0 flex-shrink-0 h-full overflow-y-auto overscroll-contain custom-scrollbar lg:border-l border-[var(--border)] bg-[var(--bg)] p-3 sm:p-4 flex-col gap-3 z-20
          `}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal size={15} className="text-[#1769AA]" aria-hidden="true" />
              <h2 className="text-xs font-bold tracking-wide uppercase text-[#161A1D]">
                Controls
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[#5C6670]">{activeFieldLabel}</span>
          </div>

          <div
            role="tablist"
            aria-label="Control sections"
            className="grid grid-cols-3 p-0.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11.5px] gap-0.5 shrink-0"
          >
            {(
              [
                { id: "flow", label: "Flow", Icon: SlidersHorizontal },
                { id: "airfoils", label: "Airfoils", Icon: Layers },
                { id: "shape", label: "Shape", Icon: Spline },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = controlsTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setControlsTab(id)}
                  className={`py-1.5 px-2 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-[#1769AA] text-white"
                      : "text-[#5C6670] hover:text-[#161A1D]"
                  }`}
                >
                  <Icon size={12} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {controlsTab === "flow" && (
            <div className="flex flex-col gap-3">
              <div className="antigravity-glass rounded-xl p-3.5 flex flex-col gap-3.5">
                <div className="flex flex-col gap-2">
                  <SliderField
                    label="Angle of attack"
                    value={alpha}
                    min={-20}
                    max={25}
                    step={0.5}
                    onChange={handleAlphaChange}
                    format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}°`}
                  />
                  <div className="grid grid-cols-5 gap-1">
                    {[-5, 0, 6, 12].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`py-1.5 rounded-md text-[11.5px] font-mono font-semibold border transition-colors cursor-pointer ${
                          Math.abs(alpha - preset) < 0.2
                            ? "bg-[#1769AA] border-[#1769AA] text-white"
                            : "bg-[var(--bg)] border-[var(--border)] text-[#161A1D] hover:border-[#1769AA]"
                        }`}
                        onClick={() => handleAlphaChange(preset)}
                      >
                        {preset}°
                      </button>
                    ))}
                    <button
                      type="button"
                      title={`Jump to NeuroFoil optimal angle (${neurofoilPrediction.optimalAlpha.toFixed(1)}°)`}
                      onClick={() => handleAlphaChange(neurofoilPrediction.optimalAlpha)}
                      className={`py-1.5 rounded-md text-[11px] font-mono font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                        Math.abs(alpha - neurofoilPrediction.optimalAlpha) < 0.3
                          ? "bg-[#047857] border-[#047857] text-white"
                          : "bg-emerald-50 border-emerald-200 text-[#047857] hover:bg-emerald-100"
                      }`}
                    >
                      α* {neurofoilPrediction.optimalAlpha.toFixed(0)}°
                    </button>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[var(--border)]">
                  <SliderField
                    label="Reynolds number"
                    help="Simulated lattice Reynolds number (U·c/ν). Higher values produce thinner boundary layers and stronger wake shedding."
                    value={u0Scaled}
                    min={30}
                    max={100}
                    step={2}
                    onChange={handleReynoldsChange}
                    format={() => simRe.toLocaleString()}
                  />
                </div>
              </div>

              <div className="antigravity-glass rounded-xl p-3.5 flex flex-col gap-2">
                <div className="text-[11.5px] font-bold text-[#161A1D]">
                  Field Visualization
                </div>
                <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden bg-white">
                  {FIELD_GUIDE.map(([modeKey, title, desc]) => {
                    const active = fieldMode === modeKey;
                    return (
                      <button
                        key={title}
                        type="button"
                        onClick={() => handleFieldChange(modeKey)}
                        className={`w-full text-left px-3 py-2 transition-colors cursor-pointer ${
                          active
                            ? "bg-[var(--accent-light)]"
                            : "hover:bg-[var(--bg)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${active ? "text-[#1769AA]" : "text-[#161A1D]"}`}>
                            {title}
                          </span>
                          {active && (
                            <span className="text-[10.5px] font-mono font-semibold text-[#1769AA]">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] leading-snug text-[#5C6670] mt-0.5">{desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="antigravity-glass rounded-xl p-3.5 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={handleTogglePause}>
                    {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
                    <span>{paused ? "Resume" : "Pause"}</span>
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={handleResetAll}>
                    <RotateCcw size={13} aria-hidden="true" />
                    <span>Reset Flow</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-primary-accent btn-sm whitespace-nowrap" onClick={() => tunnelRef.current?.savePng()}>
                    <Download size={13} aria-hidden="true" />
                    <span>Save PNG</span>
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={handleDownloadDat}>
                    <Download size={13} aria-hidden="true" />
                    <span>Save .dat</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {controlsTab === "airfoils" && (
            <div className="antigravity-glass rounded-xl p-3.5 flex flex-col gap-2.5">
              <AirfoilPicker
                choice={choice}
                onChoiceChange={setChoice}
                uploadedFile={airfoil.isCustom ? airfoil.filename : null}
                onSelectAirfoil={onSelectAirfoil}
                sharedAirfoils={sharedAirfoils}
                sharedError={cloudError}
                activeAirfoil={airfoil}
                activeCoords={activeCoords}
                user={user}
                onUseAsNeutralRef={(refData) => {
                  setCustomRef(refData);
                  setResultsTab("neurofoil");
                  setMobileTab("results");
                }}
              />
              {airfoil.isCustom && airfoil.fixes && (
                <ParserBox filename={airfoil.filename} fixes={airfoil.fixes} />
              )}
            </div>
          )}

          {controlsTab === "shape" && (
            <div className="antigravity-glass rounded-xl p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border)]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#161A1D]">
                  <Spline size={13} className="text-[#1769AA]" aria-hidden="true" />
                  <span>Bézier Geometry Editor</span>
                </div>
                <span className="text-[11px] font-mono text-[#5C6670] truncate">{airfoil.name}</span>
              </div>

              <ShapeEditor2D
                sourceCoords={airfoil.coords}
                currentCoords={activeCoords}
                foilName={airfoil.name}
                onCoordsChange={(coords) => {
                  setActiveCoords(coords);
                  tunnelRef.current?.setCoords(coords, airfoil.name);
                }}
                onResetSource={() => {
                  setActiveCoords(airfoil.coords);
                  tunnelRef.current?.setCoords(airfoil.coords, airfoil.name);
                }}
              />
            </div>
          )}
        </form>
      </main>

      <footer className="min-h-7 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-5 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2 text-[11px] text-[#5C6670] z-30 flex-shrink-0 overflow-hidden">
        <div className="hidden xl:flex items-center gap-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1 text-[#161A1D] font-semibold">
            <Keyboard size={13} className="text-[#1769AA]" aria-hidden="true" />
            <span>Shortcuts:</span>
          </div>
          <span className="font-mono text-[10px] bg-[var(--bg)] border border-[var(--border)] px-1.5 rounded text-[#161A1D]">Space</span> Pause
          <span className="font-mono text-[10px] bg-[var(--bg)] border border-[var(--border)] px-1.5 rounded text-[#161A1D]">↑/↓</span> Pitch AoA
          <span className="font-mono text-[10px] bg-[var(--bg)] border border-[var(--border)] px-1.5 rounded text-[#161A1D]">←/→</span> Re Speed
          <span className="font-mono text-[10px] bg-[var(--bg)] border border-[var(--border)] px-1.5 rounded text-[#161A1D]">R</span> Reset
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-[#5C6670] tabular-nums whitespace-nowrap">
          <span>640 × 320 D2Q9</span>
          <span aria-hidden="true">·</span>
          <span>{isStalled ? "Separated Wake" : "Attached Flow"}</span>
        </div>

        <div className="hidden min-[480px]:flex items-center gap-2 text-[10.5px] font-medium text-[#161A1D] whitespace-nowrap">
          <span>AeroLab · 2D Wind Tunnel</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const tunnelRef = useRef<TunnelController | null>(null);
  const userSelectedAirfoilRef = useRef(false);

  const [choice, setChoice] = useState("naca0012.dat");
  const [airfoil, setAirfoil] = useState<AirfoilSelection>(() => ({
    name: "NACA 0012",
    filename: "naca0012.dat",
    coords: lbmNaca4(0, 4, 12, 60),
    fixes: null,
    isCustom: false,
  }));
  const [activeCoords, setActiveCoords] = useState<Coord2D[]>(() => lbmNaca4(0, 4, 12, 60));

  const {
    user,
    userProfile,
    authReady,
    authBusy,
    authError,
    authNotice,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    updateProfile,
    sharedAirfoils,
    benchmarks,
    cloudError,
  } = useSupabase();
  const [customRef, setCustomRef] = useState<NeutralReferenceData | null>(null);

  const [alpha, setAlpha] = useState(DEFAULT_ALPHA);
  const [fieldMode, setFieldMode] = useState("0");
  const [u0Scaled, setU0Scaled] = useState(DEFAULT_U0_MM);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);

  const alphaRef = useRef(alpha);
  const airfoilNameRef = useRef(airfoil.name);
  const fieldModeRef = useRef(fieldMode);
  const sampleIdRef = useRef(0);
  alphaRef.current = alpha;
  airfoilNameRef.current = airfoil.name;
  fieldModeRef.current = fieldMode;

  const appendSample = useCallback((nextStats: TunnelStats) => {
    if (nextStats.cl === null || nextStats.cd === null) return;
    sampleIdRef.current += 1;
    const sep = nextStats.separationPct;
    const stateLabel = sep < 5 ? "Attached" : sep < 25 ? "Sep" : "Stall";
    const fieldLabel = FIELD_MODES.find(([v]) => v === fieldModeRef.current)?.[1] || "Velocity";
    const ld = nextStats.cd > 0.001 ? nextStats.cl / nextStats.cd : null;
    const row: TelemetrySample = {
      id: sampleIdRef.current,
      airfoil: airfoilNameRef.current,
      alpha: alphaRef.current,
      reynolds: nextStats.reynolds,
      cl: nextStats.cl,
      cd: nextStats.cd,
      ld,
      separationPct: sep,
      stateLabel,
      fieldLabel,
      timestamp: new Date().toISOString(),
    };
    setSamples((prev) => (prev.length >= 180 ? [...prev.slice(-179), row] : [...prev, row]));
  }, []);

  useEffect(() => {
    let alive = true;
    loadExample("naca0012.dat")
      .then((txt) => {
        if (!alive || userSelectedAirfoilRef.current) return;
        const { coords, fixes } = parseDatText(txt);
        setAirfoil({
          name: "NACA 0012",
          filename: "naca0012.dat",
          coords,
          fixes,
          isCustom: false,
        });
        setActiveCoords(coords);
        tunnelRef.current?.setCoords(coords, "NACA 0012");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleSelectAirfoil = useCallback((next: AirfoilSelection) => {
    userSelectedAirfoilRef.current = true;
    setAirfoil(next);
    setActiveCoords(next.coords);
    tunnelRef.current?.setCoords(next.coords, next.name);
  }, []);

  const handleApplyRun = useCallback(
    async (run: BenchmarkRunDoc) => {
      const clampedAlpha = Math.max(-20, Math.min(25, Number(run.alpha) || DEFAULT_ALPHA));
      setAlpha(clampedAlpha);
      tunnelRef.current?.setAlpha(clampedAlpha);

      if (Number.isFinite(run.reynolds) && run.reynolds > 0) {
        const lbmConstants = LBM as typeof LBM & { NU: number; CHORD_L: number };
        const targetU0 = (run.reynolds * lbmConstants.NU) / lbmConstants.CHORD_L;
        const scaled = Math.max(30, Math.min(100, Math.round(targetU0 * 1000)));
        setU0Scaled(scaled);
        tunnelRef.current?.setU0(scaled / 1000);
      }

      const targetId = (run.airfoilId || "").trim();
      const targetName = (run.airfoilName || "").trim().toLowerCase();
      const matchedShared = sharedAirfoils.find(
        (a) => a.id === targetId || a.name.toLowerCase() === targetName
      );
      if (matchedShared) {
        try {
          const { coords, fixes } = parseDatText(matchedShared.coordsText);
          setChoice(`cloud:${matchedShared.id}`);
          handleSelectAirfoil({
            id: matchedShared.id,
            name: matchedShared.name,
            filename: matchedShared.filename,
            coords,
            fixes,
            isCustom: false,
            isShared: true,
            uploaderName: matchedShared.uploaderName,
          });
          return;
        } catch {
          // fall through to bundled check
        }
      }

      const matchedExample = EXAMPLE_AIRFOILS.find(
        ([label, file]) => file === targetId || label.toLowerCase() === targetName
      );
      if (matchedExample) {
        try {
          const txt = await loadExample(matchedExample[1]);
          const { coords, fixes } = parseDatText(txt);
          setChoice(matchedExample[1]);
          handleSelectAirfoil({
            id: matchedExample[1],
            name: matchedExample[0],
            filename: matchedExample[1],
            coords,
            fixes,
            isCustom: false,
            isShared: false,
          });
        } catch {
          // keep current airfoil if example fetch fails
        }
      }
    },
    [sharedAirfoils, handleSelectAirfoil]
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          <WorkstationView
            choice={choice}
            setChoice={setChoice}
            airfoil={airfoil}
            activeCoords={activeCoords}
            setActiveCoords={setActiveCoords}
            onSelectAirfoil={handleSelectAirfoil}
            user={user}
            userProfile={userProfile}
            benchmarks={benchmarks}
            sharedAirfoils={sharedAirfoils}
            cloudError={cloudError}
            customRef={customRef}
            setCustomRef={setCustomRef}
            alpha={alpha}
            setAlpha={setAlpha}
            fieldMode={fieldMode}
            setFieldMode={setFieldMode}
            u0Scaled={u0Scaled}
            setU0Scaled={setU0Scaled}
            samples={samples}
            setSamples={setSamples}
            sampleIdRef={sampleIdRef}
            appendSample={appendSample}
            tunnelRef={tunnelRef}
          />
        }
      />
      <Route
        path="/profile"
        element={
          <ProfilePage
            user={user}
            userProfile={userProfile}
            authReady={authReady}
            authBusy={authBusy}
            authError={authError}
            authNotice={authNotice}
            cloudError={cloudError}
            onSignInWithEmail={signInWithEmail}
            onSignUpWithEmail={signUpWithEmail}
            onSignInWithGoogle={signInWithGoogle}
            onSignOut={signOut}
            onUpdateProfile={updateProfile}
            sharedAirfoils={sharedAirfoils}
            benchmarks={benchmarks}
            onLoadAirfoil={(loaded) => {
              setChoice(loaded.choice);
              handleSelectAirfoil(loaded);
            }}
            onApplyRun={handleApplyRun}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
