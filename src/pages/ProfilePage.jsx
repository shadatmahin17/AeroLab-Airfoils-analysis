import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Award,
  Check,
  Cloud,
  Download,
  History,
  LogIn,
  LogOut,
  Pencil,
  Play,
  Search,
  Trash2,
  User as UserIcon,
  Wind,
  X,
} from "lucide-react";
import { parseDatText } from "../lib/airfoilParser.js";
import {
  deleteBenchmarkRun,
  deleteSharedAirfoil,
  updateUserDisplayName,
} from "../lib/airfoilRepository.ts";
import { downloadText } from "../lib/files.js";

function formatShortDate(ms) {
  if (!ms) return "just now";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function ProfilePage({
  user,
  userProfile,
  authReady,
  authBusy,
  authError,
  authNotice,
  cloudError,
  onSignInWithEmail,
  onSignUpWithEmail,
  onSignInWithGoogle,
  onSignOut,
  sharedAirfoils = [],
  benchmarks = [],
  onLoadAirfoil,
  onApplyRun,
}) {
  const navigate = useNavigate();

  const [imgErr, setImgErr] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const [authMode, setAuthMode] = useState("signin");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [localAuthErr, setLocalAuthErr] = useState(null);

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [runQuery, setRunQuery] = useState("");
  const [runSort, setRunSort] = useState("recent");
  const [uploadQuery, setUploadQuery] = useState("");

  const myUploads = useMemo(
    () =>
      user
        ? sharedAirfoils
            .filter((a) => a.uploaderUid === user.uid)
            .slice()
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        : [],
    [sharedAirfoils, user]
  );

  const myRuns = useMemo(
    () =>
      user
        ? benchmarks
            .filter((b) => b.recorderUid === user.uid)
            .slice()
            .sort((a, b) =>
              runSort === "best"
                ? b.ld - a.ld || b.createdAtMs - a.createdAtMs
                : b.createdAtMs - a.createdAtMs
            )
        : [],
    [benchmarks, user, runSort]
  );

  const filteredRuns = useMemo(() => {
    const q = runQuery.trim().toLowerCase();
    if (!q) return myRuns;
    return myRuns.filter(
      (r) =>
        r.airfoilName.toLowerCase().includes(q) ||
        r.sourceLabel.toLowerCase().includes(q)
    );
  }, [myRuns, runQuery]);

  const filteredUploads = useMemo(() => {
    const q = uploadQuery.trim().toLowerCase();
    if (!q) return myUploads;
    return myUploads.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.filename.toLowerCase().includes(q)
    );
  }, [myUploads, uploadQuery]);

  const personalBestRun = useMemo(() => {
    if (!myRuns.length) return null;
    return myRuns.reduce((best, r) => (r.ld > best.ld ? r : best), myRuns[0]);
  }, [myRuns]);

  const personalBestLd = personalBestRun?.ld ?? (userProfile?.bestLd || null);
  const personalBestFoil =
    personalBestRun?.airfoilName || userProfile?.bestAirfoil || "—";

  const displayName =
    userProfile?.displayName ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Pilot";

  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");

  const handleStartEditName = () => {
    setDraftName(displayName);
    setEditingName(true);
    setErrMsg(null);
    setStatusMsg(null);
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) {
      setErrMsg("Display name cannot be empty.");
      return;
    }
    setSavingName(true);
    setErrMsg(null);
    try {
      await updateUserDisplayName(trimmed);
      setEditingName(false);
      setStatusMsg("Pilot display name updated.");
    } catch (err) {
      setErrMsg(err?.message || "Could not update display name.");
    } finally {
      setSavingName(false);
    }
  };

  const handleLoadUpload = (item) => {
    setErrMsg(null);
    try {
      const { coords, fixes } = parseDatText(item.coordsText);
      onLoadAirfoil?.({
        id: item.id,
        choice: `cloud:${item.id}`,
        name: item.name,
        filename: item.filename,
        coords,
        fixes,
        isCustom: false,
        isShared: true,
        uploaderName: item.uploaderName,
      });
      navigate("/");
    } catch (e) {
      setErrMsg(e?.message || "Could not parse airfoil coordinates.");
    }
  };

  const handleRunInTunnel = async (run) => {
    setErrMsg(null);
    try {
      await onApplyRun?.(run);
      navigate("/");
    } catch (e) {
      setErrMsg(e?.message || "Could not load run in wind tunnel.");
    }
  };

  const handleDeleteRun = async (id) => {
    setErrMsg(null);
    setStatusMsg(null);
    try {
      await deleteBenchmarkRun(id);
      setStatusMsg("Simulation run deleted.");
    } catch (e) {
      setErrMsg(e?.message || "Could not delete simulation run.");
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLocalAuthErr(null);
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setLocalAuthErr("Enter a valid email address.");
      return;
    }
    if (passwordInput.length < 6) {
      setLocalAuthErr("Password must be at least 6 characters.");
      return;
    }
    if (authMode === "signup") {
      await onSignUpWithEmail?.(trimmedEmail, passwordInput, nameInput);
    } else {
      await onSignInWithEmail?.(trimmedEmail, passwordInput);
    }
  };

  const handleDeleteUpload = async (id) => {
    setErrMsg(null);
    setStatusMsg(null);
    try {
      await deleteSharedAirfoil(id);
      setStatusMsg("Uploaded airfoil deleted.");
    } catch (e) {
      setErrMsg(e?.message || "Could not delete uploaded airfoil.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex flex-col font-sans">
      {/* Top Bar — 3-Zone Contract */}
      <header className="h-14 px-4 sm:px-6 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-8 sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded"
          >
            <img
              src="/aerolab-logo.png"
              alt="AeroLab"
              className="h-6 sm:h-7 w-auto object-contain shrink-0"
            />
            <span className="hidden sm:inline font-script text-xl leading-none text-[#1769AA] pt-0.5 whitespace-nowrap">
              Wind Tunnel
            </span>
          </Link>
          <span className="text-[var(--border)] hidden sm:inline" aria-hidden="true">
            /
          </span>
          <span className="hidden sm:inline text-xs font-semibold text-[#5C6670] whitespace-nowrap">
            Pilot Profile
          </span>
        </div>

        <nav aria-label="Profile navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-[#5C6670]">
          <Link
            to="/"
            className="hover:text-[#161A1D] transition-colors whitespace-nowrap shrink-0"
          >
            Wind Tunnel
          </Link>
          <span className="text-[#1769AA] font-semibold whitespace-nowrap shrink-0">
            Profile
          </span>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/"
            className="btn btn-primary-accent btn-sm whitespace-nowrap shrink-0"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            <span>Back to Tunnel</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {cloudError && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex flex-col gap-1">
            <span className="font-bold">Supabase Setup Notice</span>
            <span>{cloudError}</span>
          </div>
        )}

        {!authReady ? (
          <div className="antigravity-glass rounded-xl p-8 text-center text-sm text-[#5C6670]">
            Checking session…
          </div>
        ) : !user ? (
          <div className="max-w-md w-full mx-auto my-auto antigravity-glass rounded-xl p-6 sm:p-7 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-light)] text-[#1769AA] flex items-center justify-center shrink-0">
                  <UserIcon size={18} aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-[#161A1D]">Pilot Profile</h1>
                  <p className="text-xs text-[#5C6670]">
                    Sign in to access saved runs and uploaded airfoils
                  </p>
                </div>
              </div>
            </div>

            {/* Sign In / Create Account Mode Switcher */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 p-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-xs gap-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "signin"}
                onClick={() => {
                  setAuthMode("signin");
                  setLocalAuthErr(null);
                }}
                className={`py-1.5 px-3 rounded-md font-semibold transition-colors cursor-pointer ${
                  authMode === "signin"
                    ? "bg-[#1769AA] text-white"
                    : "text-[#5C6670] hover:text-[#161A1D]"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === "signup"}
                onClick={() => {
                  setAuthMode("signup");
                  setLocalAuthErr(null);
                }}
                className={`py-1.5 px-3 rounded-md font-semibold transition-colors cursor-pointer ${
                  authMode === "signup"
                    ? "bg-[#1769AA] text-white"
                    : "text-[#5C6670] hover:text-[#161A1D]"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
              {authMode === "signup" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="pilot-name" className="text-xs font-semibold text-[#161A1D]">
                    Display Name
                  </label>
                  <input
                    id="pilot-name"
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Amelia Earhart"
                    maxLength={80}
                    autoComplete="name"
                    className="input text-sm"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label htmlFor="pilot-email" className="text-xs font-semibold text-[#161A1D]">
                  Email
                </label>
                <input
                  id="pilot-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="pilot@example.com"
                  required
                  autoComplete="email"
                  className="input text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="pilot-password" className="text-xs font-semibold text-[#161A1D]">
                  Password
                </label>
                <input
                  id="pilot-password"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                  className="input text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={authBusy}
                className="btn btn-primary-accent w-full mt-1 whitespace-nowrap"
              >
                <LogIn size={15} aria-hidden="true" />
                <span>
                  {authBusy
                    ? authMode === "signup"
                      ? "Creating account…"
                      : "Signing in…"
                    : authMode === "signup"
                      ? "Create Account"
                      : "Sign In"}
                </span>
              </button>
            </form>

            {authNotice && (
              <div className="text-xs text-[#047857] bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                {authNotice}
              </div>
            )}

            {(localAuthErr || authError) && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {localAuthErr || authError}
              </div>
            )}

            <div className="flex items-center gap-3 text-[11px] text-[#5C6670]">
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span>or</span>
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {onSignInWithGoogle && (
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  disabled={authBusy}
                  className="btn btn-secondary flex-1 whitespace-nowrap text-xs"
                >
                  <span>Continue with Google</span>
                </button>
              )}
              <Link
                to="/"
                className="btn btn-secondary whitespace-nowrap text-xs"
              >
                <Wind size={14} aria-hidden="true" />
                <span>Wind Tunnel</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Pilot Header Surface */}
            <section
              aria-label="Pilot account overview"
              className="antigravity-glass rounded-xl p-5 sm:p-6 flex flex-col gap-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {user.photoURL && !imgErr ? (
                    <img
                      src={user.photoURL}
                      alt={displayName}
                      onError={() => setImgErr(true)}
                      className="w-14 h-14 rounded-full border border-[var(--border)] object-cover shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-[var(--accent-light)] border border-[#1769AA]/30 text-[#1769AA] font-bold text-lg flex items-center justify-center shrink-0">
                      {initials || "A"}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    {editingName ? (
                      <form onSubmit={handleSaveName} className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          maxLength={80}
                          aria-label="Pilot display name"
                          className="input max-w-xs py-1.5 text-sm"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={savingName}
                          className="btn btn-primary-accent btn-sm whitespace-nowrap"
                        >
                          <Check size={13} aria-hidden="true" />
                          <span>{savingName ? "Saving…" : "Save"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingName(false)}
                          className="btn btn-secondary btn-sm whitespace-nowrap"
                        >
                          <X size={13} aria-hidden="true" />
                          <span>Cancel</span>
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <h1 className="text-xl font-bold text-[#161A1D] truncate">
                          {displayName}
                        </h1>
                        <button
                          type="button"
                          onClick={handleStartEditName}
                          title="Edit display name"
                          aria-label="Edit display name"
                          className="p-1.5 rounded-md text-[#5C6670] hover:text-[#1769AA] hover:bg-[var(--bg)] transition-colors cursor-pointer shrink-0"
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-[#5C6670] mt-1">
                      <span className="truncate">{user.email}</span>
                      {userProfile?.createdAtMs ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Joined {formatShortDate(userProfile.createdAtMs)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onSignOut}
                    disabled={authBusy}
                    className="btn btn-secondary btn-sm hover:text-red-600 hover:border-red-300 whitespace-nowrap"
                  >
                    <LogOut size={13} aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>

              {/* 4-Column KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)] border-t border-[var(--border)] pt-4 -mx-1">
                <div className="px-3 py-1.5">
                  <div className="text-xs font-medium text-[#5C6670]">Saved Runs</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[#161A1D] mt-0.5">
                    {myRuns.length}
                  </div>
                </div>
                <div className="px-3 py-1.5">
                  <div className="text-xs font-medium text-[#5C6670]">Uploaded Airfoils</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[#161A1D] mt-0.5">
                    {myUploads.length}
                  </div>
                </div>
                <div className="px-3 py-1.5">
                  <div className="text-xs font-medium text-[#5C6670]">Personal Best L/D</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[#047857] mt-0.5">
                    {personalBestLd !== null && personalBestLd !== 0
                      ? personalBestLd.toFixed(2)
                      : "—"}
                  </div>
                </div>
                <div className="px-3 py-1.5">
                  <div className="text-xs font-medium text-[#5C6670]">Best Airfoil</div>
                  <div className="text-lg sm:text-xl font-bold text-[#1769AA] truncate mt-1">
                    {personalBestFoil}
                  </div>
                </div>
              </div>
            </section>

            {statusMsg && (
              <div className="flex items-center gap-2 text-xs font-medium text-[#047857] bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
                <Check size={14} className="shrink-0" aria-hidden="true" />
                <span>{statusMsg}</span>
              </div>
            )}
            {(errMsg || authError) && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                {errMsg || authError}
              </div>
            )}

            {/* Main 2-Column Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Past Simulation Runs */}
              <section
                aria-label="Past simulation results"
                className="lg:col-span-7 antigravity-glass rounded-xl overflow-hidden flex flex-col min-w-0"
              >
                <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-[#1769AA] shrink-0" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-[#161A1D]">
                      Past Simulation Results ({myRuns.length})
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-44">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6670]"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={runQuery}
                        onChange={(e) => setRunQuery(e.target.value)}
                        placeholder="Filter runs…"
                        aria-label="Filter simulation runs"
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[#1769AA]"
                      />
                    </div>
                    <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => setRunSort("recent")}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          runSort === "recent"
                            ? "bg-white text-[#161A1D] shadow-xs"
                            : "text-[#5C6670] hover:text-[#161A1D]"
                        }`}
                      >
                        Recent
                      </button>
                      <button
                        type="button"
                        onClick={() => setRunSort("best")}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          runSort === "best"
                            ? "bg-white text-[#161A1D] shadow-xs"
                            : "text-[#5C6670] hover:text-[#161A1D]"
                        }`}
                      >
                        Best L/D
                      </button>
                    </div>
                  </div>
                </div>

                {filteredRuns.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center gap-3">
                    <p className="text-sm text-[#5C6670] max-w-sm leading-relaxed">
                      {myRuns.length === 0
                        ? "No saved simulation runs yet. Run an airfoil in the Wind Tunnel and save your result from NeuroFoil."
                        : "No simulation runs match your search filter."}
                    </p>
                    {myRuns.length === 0 && (
                      <Link to="/" className="btn btn-primary-accent btn-sm">
                        <Wind size={13} aria-hidden="true" />
                        <span>Open Wind Tunnel</span>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-[var(--bg)] border-b border-[var(--border)] text-[#5C6670] font-semibold">
                        <tr>
                          <th className="text-left px-4 py-2.5">Airfoil</th>
                          <th className="text-right px-3 py-2.5">α</th>
                          <th className="text-right px-3 py-2.5">Re</th>
                          <th className="text-right px-3 py-2.5">CL</th>
                          <th className="text-right px-3 py-2.5">CD</th>
                          <th className="text-right px-3 py-2.5">L/D</th>
                          <th className="text-right px-4 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] bg-white font-mono tabular-nums">
                        {filteredRuns.map((run) => (
                          <tr key={run.id} className="hover:bg-[var(--bg)] transition-colors">
                            <td className="px-4 py-3 font-sans">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[#161A1D]">{run.airfoilName}</span>
                                {personalBestRun?.id === run.id && (
                                  <Award
                                    size={13}
                                    className="text-[#D97706] shrink-0"
                                    aria-label="Personal best"
                                  />
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-[#5C6670] mt-0.5">
                                {formatShortDate(run.createdAtMs)} · Sep {run.separationPct.toFixed(0)}%
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right text-[#161A1D]">
                              {run.alpha.toFixed(1)}°
                            </td>
                            <td className="px-3 py-3 text-right text-[#5C6670]">
                              {run.reynolds.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-[#1769AA]">
                              {run.cl.toFixed(3)}
                            </td>
                            <td className="px-3 py-3 text-right text-[#D97706]">
                              {run.cd.toFixed(3)}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-[#047857]">
                              {run.ld.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleRunInTunnel(run)}
                                  title="Re-run in Wind Tunnel"
                                  className="px-2 py-1 rounded-md text-[11px] font-sans font-semibold bg-[var(--accent-light)] text-[#1769AA] hover:bg-[#1769AA] hover:text-white transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                >
                                  <Play size={11} aria-hidden="true" />
                                  <span>Run</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRun(run.id)}
                                  title="Delete run"
                                  aria-label={`Delete run ${run.airfoilName}`}
                                  className="p-1.5 rounded-md text-[#5C6670] hover:text-red-600 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={13} aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Uploaded Airfoils */}
              <section
                aria-label="Uploaded airfoils"
                className="lg:col-span-5 antigravity-glass rounded-xl overflow-hidden flex flex-col min-w-0"
              >
                <div className="px-5 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Cloud size={16} className="text-[#1769AA] shrink-0" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-[#161A1D]">
                      My Uploaded Airfoils ({myUploads.length})
                    </h2>
                  </div>

                  {myUploads.length > 0 && (
                    <div className="relative sm:w-44">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6670]"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={uploadQuery}
                        onChange={(e) => setUploadQuery(e.target.value)}
                        placeholder="Search uploads…"
                        aria-label="Search uploaded airfoils"
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[#1769AA]"
                      />
                    </div>
                  )}
                </div>

                {filteredUploads.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center gap-3">
                    <p className="text-sm text-[#5C6670] max-w-xs leading-relaxed">
                      {myUploads.length === 0
                        ? "No airfoils uploaded while signed in yet. Upload or share an airfoil from Controls → Airfoils."
                        : "No uploaded airfoils match your search."}
                    </p>
                    {myUploads.length === 0 && (
                      <Link to="/" className="btn btn-secondary btn-sm">
                        <Wind size={13} aria-hidden="true" />
                        <span>Go to Controls</span>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)] bg-white">
                    {filteredUploads.map((item) => (
                      <div
                        key={item.id}
                        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg)] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handleLoadUpload(item)}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <div className="text-sm font-bold text-[#161A1D] truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#5C6670] truncate mt-0.5">
                            c {item.camberPct.toFixed(1)}% · t {item.thicknessPct.toFixed(1)}% ·{" "}
                            {item.pointCount} pts · {formatShortDate(item.createdAtMs)}
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadUpload(item)}
                            title="Load in Wind Tunnel"
                            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-[var(--accent-light)] text-[#1769AA] hover:bg-[#1769AA] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadText(item.filename, item.coordsText)}
                            title="Download .dat"
                            aria-label={`Download ${item.name}`}
                            className="p-1.5 rounded-md text-[#5C6670] hover:text-[#1769AA] transition-colors cursor-pointer"
                          >
                            <Download size={13} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUpload(item.id)}
                            title="Delete uploaded airfoil"
                            aria-label={`Delete ${item.name}`}
                            className="p-1.5 rounded-md text-[#5C6670] hover:text-red-600 transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
