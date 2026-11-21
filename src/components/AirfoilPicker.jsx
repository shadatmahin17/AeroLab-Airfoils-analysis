import { useMemo, useState } from "react";
import { Cloud, CloudUpload, Download, Globe, Search, Trash2, Check } from "lucide-react";
import { Alert, FileDrop, SelectField } from "./ui.jsx";
import { downloadText, EXAMPLE_AIRFOILS, loadExample, readFileText } from "../lib/files.js";
import { parseDatText } from "../lib/airfoilParser.js";
import {
  buildBaselineFromGeometry,
  deleteSharedAirfoil,
  ensureUserProfile,
  uploadSharedAirfoil,
} from "../lib/airfoilRepository.ts";
import { runNeuroFoilPrediction } from "../lib/neurofoil.ts";

const MAX_BYTES = 1024 * 1024;

export default function AirfoilPicker({
  choice,
  onChoiceChange,
  uploadedFile,
  onSelectAirfoil,
  sharedAirfoils = [],
  sharedError = null,
  activeAirfoil,
  activeCoords,
  user = null,
  onUseAsNeutralRef,
}) {
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState(null);
  const [uploaderName, setUploaderName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [shareOnDrop, setShareOnDrop] = useState(true);

  const options = useMemo(
    () => [
      ...EXAMPLE_AIRFOILS.map(([n, f]) => [f, n]),
      ...sharedAirfoils.map((a) => [`cloud:${a.id}`, `${a.name} (Community)`]),
      ["upload", "Upload custom (.dat / .txt)"],
    ],
    [sharedAirfoils]
  );

  const filteredShared = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sharedAirfoils;
    return sharedAirfoils.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.uploaderName.toLowerCase().includes(q) ||
        a.filename.toLowerCase().includes(q)
    );
  }, [sharedAirfoils, searchTerm]);

  const loadSharedDoc = (docItem) => {
    setErr(null);
    setShareMsg(null);
    try {
      const { coords, fixes } = parseDatText(docItem.coordsText);
      onChoiceChange(`cloud:${docItem.id}`);
      onSelectAirfoil({
        id: docItem.id,
        name: docItem.name,
        filename: docItem.filename,
        coords,
        fixes,
        isCustom: false,
        isShared: true,
        uploaderName: docItem.uploaderName,
      });
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleChoice = async (nextChoice) => {
    onChoiceChange(nextChoice);
    setErr(null);
    setShareMsg(null);
    if (nextChoice === "upload") return;
    if (nextChoice.startsWith("cloud:")) {
      const id = nextChoice.slice(6);
      const found = sharedAirfoils.find((a) => a.id === id);
      if (found) loadSharedDoc(found);
      return;
    }
    setLoading(true);
    try {
      const content = await loadExample(nextChoice);
      const { coords, fixes } = parseDatText(content);
      const match = EXAMPLE_AIRFOILS.find(([, f]) => f === nextChoice);
      onSelectAirfoil({
        id: nextChoice,
        name: match ? match[0] : nextChoice,
        filename: nextChoice,
        coords,
        fixes,
        isCustom: false,
        isShared: false,
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (files) => {
    setErr(null);
    setShareMsg(null);
    if (!files.length) return;
    const f = files[0];
    if (f.size > MAX_BYTES) {
      setErr("File too large (max 1 MB).");
      return;
    }
    if (!/\.(dat|txt)$/i.test(f.name)) {
      setErr("Only .dat or .txt airfoil files are accepted.");
      return;
    }
    try {
      const content = await readFileText(f);
      const { coords, fixes } = parseDatText(content);
      const foilName = f.name.replace(/\.(dat|txt)$/i, "");
      onSelectAirfoil({
        id: f.name,
        name: foilName,
        filename: f.name,
        coords,
        fixes,
        isCustom: true,
        isShared: false,
      });

      if (shareOnDrop) {
        setSharing(true);
        try {
          const uploaded = await uploadSharedAirfoil({
            name: foilName,
            filename: f.name,
            coords,
            uploaderName: uploaderName || (user ? user.displayName || "Community" : "Community"),
          });
          onChoiceChange(`cloud:${uploaded.id}`);
          onSelectAirfoil({
            id: uploaded.id,
            name: uploaded.name,
            filename: uploaded.filename,
            coords,
            fixes,
            isCustom: true,
            isShared: true,
            uploaderName: uploaded.uploaderName,
          });
          if (user) {
            const nextUploads = sharedAirfoils.filter((a) => a.uploaderUid === user.uid).length + 1;
            void ensureUserProfile({ totalUploads: nextUploads }).catch(() => {});
          }
          setShareMsg(`Published "${uploaded.name}" to Community Library.`);
        } catch (uploadErr) {
          setErr(uploadErr?.message || "Failed to publish airfoil to Supabase.");
        } finally {
          setSharing(false);
        }
      }
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleShareActive = async () => {
    if (!activeCoords || activeCoords.length < 10) return;
    setErr(null);
    setShareMsg(null);
    setSharing(true);
    try {
      const baseName = activeAirfoil?.name || "Custom Airfoil";
      const uploaded = await uploadSharedAirfoil({
        name: baseName,
        filename: activeAirfoil?.filename || `${baseName.replace(/\s+/g, "_")}.dat`,
        coords: activeCoords,
        uploaderName: uploaderName || (user ? user.displayName || "Community" : "Community"),
      });
      onChoiceChange(`cloud:${uploaded.id}`);
      if (user) {
        const nextUploads = sharedAirfoils.filter((a) => a.uploaderUid === user.uid).length + 1;
        void ensureUserProfile({ totalUploads: nextUploads }).catch(() => {});
      }
      setShareMsg(`Published "${uploaded.name}" so anyone can access it.`);
    } catch (e) {
      setErr(e?.message || "Could not share airfoil.");
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = async (item) => {
    setErr(null);
    try {
      await deleteSharedAirfoil(item.id);
      if (choice === `cloud:${item.id}`) {
        handleChoice("naca0012.dat");
      }
    } catch (e) {
      setErr(e?.message || "Could not delete airfoil.");
    }
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <SelectField
        label="Active Airfoil Section"
        value={choice}
        onChange={handleChoice}
        options={options}
      />

      {choice === "upload" && (
        <div className="flex flex-col gap-2">
          <FileDrop
            files={uploadedFile ? [{ name: uploadedFile }] : []}
            onFiles={handleFiles}
            label="Drop airfoil .dat here"
            hint=".dat or .txt · Selig or Lednicer format"
          />
          <label className="flex items-center gap-2 text-xs text-[#5C6670] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={shareOnDrop}
              onChange={(e) => setShareOnDrop(e.target.checked)}
              className="accent-[#1769AA] w-3.5 h-3.5"
            />
            <span>Share uploaded airfoil publicly</span>
          </label>
        </div>
      )}

      {/* Share Active Airfoil to Public Library */}
      <div className="flex flex-col gap-2 pt-2.5 border-t border-[var(--border)]">
        <div className="text-[11px] font-bold text-[#5C6670]">
          Publish Active Geometry
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={uploaderName}
            onChange={(e) => setUploaderName(e.target.value)}
            placeholder={user?.displayName || "Attribution name (optional)"}
            maxLength={60}
            aria-label="Uploader attribution name"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[#1769AA]"
          />
          <button
            type="button"
            onClick={handleShareActive}
            disabled={sharing}
            title="Publish active airfoil geometry to shared community library"
            className="btn btn-primary-accent btn-sm shrink-0 whitespace-nowrap"
          >
            <CloudUpload size={13} aria-hidden="true" />
            <span>{sharing ? "Saving…" : "Share"}</span>
          </button>
        </div>
      </div>

      {loading && <div className="caption">Loading coordinates…</div>}
      {shareMsg && (
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#047857] bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          <Check size={13} className="shrink-0" aria-hidden="true" />
          <span>{shareMsg}</span>
        </div>
      )}
      {(err || sharedError) && <Alert kind="error">{err || sharedError}</Alert>}

      {/* Public Community Airfoils Browser */}
      <div className="flex flex-col gap-2 pt-2.5 border-t border-[var(--border)]">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#161A1D]">
            <Globe size={13} className="text-[#1769AA]" aria-hidden="true" />
            <span>Community Library ({sharedAirfoils.length})</span>
          </span>
          <span className="text-[11px] text-[#5C6670]">Open access</span>
        </div>

        {sharedAirfoils.length > 0 && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6670]" aria-hidden="true" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search community airfoils…"
              aria-label="Filter community airfoils"
              className="w-full pl-7 pr-2.5 py-1.5 rounded-lg text-xs bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[#1769AA]"
            />
          </div>
        )}

        <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-[var(--border)] bg-white divide-y divide-[var(--border)]">
          {filteredShared.length === 0 ? (
            <div className="text-xs text-[#5C6670] p-4 text-center leading-relaxed">
              {sharedAirfoils.length === 0
                ? "No community airfoils yet. Drop a .dat file or click Share above so anyone can test it."
                : "No matching community airfoils."}
            </div>
          ) : (
            filteredShared.map((item) => {
              const active = choice === `cloud:${item.id}`;
              const canDelete = Boolean(user && item.uploaderUid === user.uid);
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 transition-colors ${
                    active ? "bg-[var(--accent-light)]" : "hover:bg-[var(--bg)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => loadSharedDoc(item)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Cloud size={12} className="text-[#1769AA] shrink-0" aria-hidden="true" />
                      <span className="text-xs font-bold text-[#161A1D] truncate">{item.name}</span>
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-[#5C6670] truncate mt-0.5">
                      {item.uploaderName} · c {item.camberPct.toFixed(1)}% · t {item.thicknessPct.toFixed(1)}%
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {onUseAsNeutralRef && (
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            const { coords } = parseDatText(item.coordsText);
                            const pred = runNeuroFoilPrediction(item.name, coords, 2560);
                            onUseAsNeutralRef({
                              ...pred.asReference,
                              label: `${item.name} (Community NeuroFoil)`,
                              airfoilName: item.name,
                            });
                          } catch {
                            onUseAsNeutralRef(
                              buildBaselineFromGeometry(
                                item.name,
                                item.camberPct,
                                item.thicknessPct,
                                "airfoil",
                                `${item.name} (Community Ref)`
                              )
                            );
                          }
                        }}
                        title="Use NeuroFoil polar of this airfoil as comparison baseline"
                        className="px-2 py-1 rounded text-[10.5px] font-semibold bg-[var(--bg)] border border-[var(--border)] text-[#5C6670] hover:text-[#1769AA] hover:border-[#1769AA] cursor-pointer whitespace-nowrap"
                      >
                        Compare
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => downloadText(item.filename, item.coordsText)}
                      title="Download .dat file"
                      aria-label={`Download ${item.name}`}
                      className="p-1.5 rounded text-[#5C6670] hover:text-[#1769AA] cursor-pointer"
                    >
                      <Download size={12} aria-hidden="true" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        title="Delete your uploaded airfoil"
                        aria-label={`Delete ${item.name}`}
                        className="p-1.5 rounded text-[#5C6670] hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
