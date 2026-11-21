import { useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, FolderUp, Info, XCircle } from "lucide-react";

export function Label({ children, htmlFor, help }) {
  return (
    <label className="field-label" htmlFor={htmlFor}>
      {children}
      {help && <InfoTip text={help} />}
    </label>
  );
}

export function InfoTip({ text }) {
  return (
    <span className="infotip" tabIndex={0} aria-label={text}>
      <span aria-hidden="true">i</span>
      <span className="infotip-body" role="tooltip">{text}</span>
    </span>
  );
}

export function SliderField({ label, help, value, onChange, min, max, step, format = (v) => v, disabled }) {
  const id = useId();
  return (
    <div className="field">
      <div className="slider-head">
        {label && <Label htmlFor={id} help={help}>{label}</Label>}
        <span className="slider-value mono">{format(value)}</span>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function SelectField({ label, help, value, onChange, options }) {
  const id = useId();
  return (
    <div className="field">
      {label && <Label htmlFor={id} help={help}>{label}</Label>}
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>{text}</option>
        ))}
      </select>
    </div>
  );
}

export function Alert({ kind = "info", children }) {
  const Icon = kind === "error" ? XCircle : kind === "warn" ? AlertTriangle : Info;
  return (
    <div className={`alert alert-${kind}`}>
      <Icon size={16} className="alert-icon" aria-hidden="true" />
      <div className="alert-body">{children}</div>
    </div>
  );
}

export function FileDrop({ accept = ".dat,.txt", multiple = false, files = [], onFiles, label, hint }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (list) => {
    const arr = Array.from(list || []);
    if (arr.length) onFiles(multiple ? arr : arr.slice(0, 1));
  };
  return (
    <div
      className={`drop ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />
      <div className="drop-main">
        <span className="drop-icon" aria-hidden="true"><FolderUp size={18} /></span>
        <div>
          <div style={{ color: "var(--text)", fontSize: 13.5 }}>{label || "Drop file here"}</div>
          <div className="drop-hint">{hint || `${accept.replaceAll(",", " ")} · max 1 MB`}</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}>Browse</button>
      </div>
      {files.length > 0 && (
        <div className="drop-files mono">
          {files.map((f) => (
            <span key={f.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <FileText size={13} aria-hidden="true" style={{ color: "var(--accent)" }} />
              <span>{f.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ParserBox({ filename, fixes }) {
  const clean = !fixes?.length || (fixes.length === 1 && /No changes made/.test(fixes[0]));
  return (
    <div className="parser-box mono">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {clean
          ? <CheckCircle2 size={14} style={{ color: "#047857" }} aria-hidden="true" />
          : <AlertTriangle size={14} style={{ color: "#B45309" }} aria-hidden="true" />}
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{filename}</span>
        <span style={{ color: "var(--text-secondary)" }}>·</span>
        <span style={{ color: clean ? "#047857" : "#B45309" }}>
          {clean ? "Valid Selig format" : `${fixes.length} repair(s) applied`}
        </span>
      </div>
      {!clean && (
        <div style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", paddingLeft: 22, marginTop: 4 }}>
          {fixes.map((f) => `• ${f}`).join("\n")}
        </div>
      )}
    </div>
  );
}
