import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ArrowUpDown,
  Check,
  Copy,
  Download,
  Eye,
  FlipVertical2,
  Minus,
  Redo2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { Coord2D } from "../types.ts";
import { BZ } from "../lib/lbm/bezierShape.js";
import { lbmNaca4 } from "../lib/lbm/tunnel2d.js";
import { downloadText } from "../lib/files.js";

const W = 340;
const H = 192;
const DPR = 2;
const SC = 280;
const X0 = 30;
const Y0 = 96;

const toPx = (x: number, y: number, yScale: number): [number, number] => [
  X0 + x * SC,
  Y0 - y * SC * yScale,
];
const toW = (px: number, py: number, yScale: number): [number, number] => [
  (px - X0) / SC,
  (Y0 - py) / (SC * yScale),
];
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

interface BezierShape {
  camber: Coord2D[];
  thick: Coord2D[];
}

interface HandlePoint {
  kind: "c" | "t";
  i: number;
  side?: number;
  x: number;
  y: number;
  label: string;
}

const cloneShape = (s: BezierShape): BezierShape => ({
  camber: s.camber.map((p) => p.slice()),
  thick: s.thick.map((p) => p.slice()),
});

function getHandles(shape: BezierShape): HandlePoint[] {
  const out: HandlePoint[] = [];
  shape.camber.forEach((p, i) => {
    if (i === 1 || i === 2) {
      out.push({ kind: "c", i, x: p[0], y: p[1], label: `C${i}` });
    }
  });
  shape.thick.forEach((p, i) => {
    if (i < 1 || i > 3) return;
    const yc = BZ.yAt(shape.camber, Math.max(p[0], 1e-6));
    out.push({ kind: "t", i, side: 1, x: p[0], y: yc + p[1] / 2, label: `T${i}+` });
    out.push({ kind: "t", i, side: -1, x: p[0], y: yc - p[1] / 2, label: `T${i}-` });
  });
  return out;
}

interface ShapeEditor2DProps {
  sourceCoords: Coord2D[];
  currentCoords?: Coord2D[];
  foilName: string;
  onCoordsChange: (coords: Coord2D[]) => void;
  onResetSource: () => void;
}

export default function ShapeEditor2D({
  sourceCoords,
  currentCoords,
  foilName,
  onCoordsChange,
  onResetSource,
}: ShapeEditor2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fittedRef = useRef<BezierShape | null>(null);
  const shapeRef = useRef<BezierShape | null>(null);
  const dragRef = useRef<HandlePoint | null>(null);
  const hoverRef = useRef<HandlePoint | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sliderSnapRef = useRef<boolean>(false);

  const pastRef = useRef<BezierShape[]>([]);
  const futureRef = useRef<BezierShape[]>([]);

  const [fitErr, setFitErr] = useState(0);
  const [edited, setEdited] = useState(false);
  const [metrics, setMetrics] = useState({ camber: 0, camberX: 0.4, thick: 0.12, thickX: 0.3 });
  const [yScale, setYScale] = useState<1 | 2>(2);
  const [showGhost, setShowGhost] = useState(true);
  const [showHandles, setShowHandles] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nacaCode, setNacaCode] = useState("2412");
  const [nacaErr, setNacaErr] = useState<string | null>(null);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushSnapshot = useCallback(
    (snap: BezierShape) => {
      pastRef.current = [...pastRef.current.slice(-29), cloneShape(snap)];
      futureRef.current = [];
      syncHistoryFlags();
    },
    [syncHistoryFlags]
  );

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const shape = shapeRef.current;
    if (!cv || !shape) return;
    const cx = cv.getContext("2d");
    if (!cx) return;

    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.fillStyle = "#F7F9FA";
    cx.fillRect(0, 0, W, H);

    // Calibrated chord-station grid (0.1c minor, 0.25c major)
    cx.lineWidth = 1;
    for (let k = 0; k <= 10; k++) {
      const gx = toPx(k / 10, 0, yScale)[0];
      cx.strokeStyle = "rgba(217, 222, 226, 0.55)";
      cx.beginPath();
      cx.moveTo(gx, 12);
      cx.lineTo(gx, H - 18);
      cx.stroke();
    }
    for (const gyVal of [-0.1, -0.05, 0.05, 0.1]) {
      const gy = toPx(0, gyVal, yScale)[1];
      if (gy > 12 && gy < H - 18) {
        cx.strokeStyle = "rgba(217, 222, 226, 0.45)";
        cx.beginPath();
        cx.moveTo(X0, gy);
        cx.lineTo(X0 + SC, gy);
        cx.stroke();
      }
    }

    // Chord datum line (y = 0)
    cx.strokeStyle = "#CBD3DA";
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(...toPx(0, 0, yScale));
    cx.lineTo(...toPx(1, 0, yScale));
    cx.stroke();

    // Chord station labels
    cx.fillStyle = "#5C6670";
    cx.font = "9.5px 'JetBrains Mono', ui-monospace, monospace";
    cx.textAlign = "center";
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      cx.fillText(t.toFixed(2), toPx(t, 0, yScale)[0], H - 5);
    }

    // Ghost baseline outline when modified
    if (showGhost && fittedRef.current) {
      const ghostPts = BZ.coords(fittedRef.current, 101);
      cx.save();
      cx.setLineDash([3, 3]);
      cx.strokeStyle = "rgba(92, 102, 112, 0.5)";
      cx.lineWidth = 1.1;
      cx.beginPath();
      ghostPts.forEach((p, i) => {
        const [a, b] = toPx(p[0], p[1], yScale);
        if (i) cx.lineTo(a, b);
        else cx.moveTo(a, b);
      });
      cx.closePath();
      cx.stroke();
      cx.restore();
    }

    // Active airfoil silhouette
    const pts = BZ.coords(shape, 121);
    cx.beginPath();
    pts.forEach((p, i) => {
      const [a, b] = toPx(p[0], p[1], yScale);
      if (i) cx.lineTo(a, b);
      else cx.moveTo(a, b);
    });
    cx.closePath();
    cx.fillStyle = "rgba(23, 105, 170, 0.13)";
    cx.fill();
    cx.strokeStyle = "#161A1D";
    cx.lineWidth = 1.6;
    cx.stroke();

    // Max thickness chord marker tick on datum
    const curStats = BZ.stats(shape);
    const [txPx] = toPx(curStats.thickX, 0, yScale);
    cx.strokeStyle = "rgba(23, 105, 170, 0.45)";
    cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(txPx, Y0 - 5);
    cx.lineTo(txPx, Y0 + 5);
    cx.stroke();

    // Mean camber curve
    cx.setLineDash([4, 3]);
    cx.strokeStyle = "#D97706";
    cx.lineWidth = 1.25;
    cx.beginPath();
    for (let k = 0; k <= 80; k++) {
      const [x, y] = BZ.point(shape.camber, k / 80);
      const [a, b] = toPx(x, y, yScale);
      if (k) cx.lineTo(a, b);
      else cx.moveTo(a, b);
    }
    cx.stroke();
    cx.setLineDash([]);

    const active = dragRef.current || hoverRef.current;

    if (showHandles) {
      // Camber control polygon
      cx.setLineDash([2, 3]);
      cx.strokeStyle = "rgba(217, 119, 6, 0.42)";
      cx.lineWidth = 1;
      cx.beginPath();
      shape.camber.forEach((p, i) => {
        const [a, b] = toPx(p[0], p[1], yScale);
        if (i) cx.lineTo(a, b);
        else cx.moveTo(a, b);
      });
      cx.stroke();
      cx.setLineDash([]);

      const handles = getHandles(shape);
      for (const h of handles) {
        const [a, b] = toPx(h.x, h.y, yScale);
        if (h.kind === "t") {
          const yc = BZ.yAt(shape.camber, Math.max(h.x, 1e-6));
          cx.strokeStyle = "rgba(23, 105, 170, 0.35)";
          cx.lineWidth = 1;
          cx.beginPath();
          cx.moveTo(...toPx(h.x, yc, yScale));
          cx.lineTo(a, b);
          cx.stroke();
        }
        const col = h.kind === "c" ? "#D97706" : "#1769AA";
        const isActive =
          active &&
          active.kind === h.kind &&
          active.i === h.i &&
          (h.kind === "c" || active.side === h.side);

        if (isActive) {
          cx.strokeStyle = col;
          cx.lineWidth = 1;
          cx.setLineDash([2, 2]);
          cx.beginPath();
          cx.moveTo(a, 14);
          cx.lineTo(a, H - 18);
          cx.stroke();
          cx.setLineDash([]);
        }

        cx.beginPath();
        cx.arc(a, b, isActive ? 6.4 : 4.8, 0, 2 * Math.PI);
        if (h.kind === "t" && (h.side ?? 1) < 0) {
          cx.fillStyle = "#FFFFFF";
          cx.fill();
          cx.strokeStyle = col;
          cx.lineWidth = 1.8;
          cx.stroke();
        } else {
          cx.fillStyle = col;
          cx.fill();
          cx.strokeStyle = "#FFFFFF";
          cx.lineWidth = 1.4;
          cx.stroke();
        }
      }
    }

    // Live coordinate HUD for hovered/dragged handle or zoom badge
    cx.font = "600 9.5px 'JetBrains Mono', ui-monospace, monospace";
    if (active && showHandles) {
      const valText =
        active.kind === "c"
          ? `${active.label}  x ${active.x.toFixed(2)}  yc ${(active.y * 100).toFixed(1)}%`
          : `${active.label}  x ${active.x.toFixed(2)}  y ${(active.y * 100).toFixed(1)}%`;
      cx.textAlign = "left";
      cx.fillStyle = active.kind === "c" ? "#B45309" : "#1769AA";
      cx.fillText(valText, 10, 14);
    } else {
      cx.textAlign = "left";
      cx.fillStyle = "#5C6670";
      cx.fillText(yScale === 2 ? "2x Y-Scale" : "1:1 Scale", 10, 14);
    }

    if (showGhost && edited) {
      cx.textAlign = "right";
      cx.fillStyle = "#5C6670";
      cx.fillText("Dashed: baseline", W - 10, 14);
    }
  }, [edited, showGhost, showHandles, yScale]);

  useEffect(() => {
    if (!sourceCoords || sourceCoords.length < 3) return;
    const { shape, err } = BZ.fit(sourceCoords);
    fittedRef.current = cloneShape(shape);

    const hasEditedActive =
      currentCoords && currentCoords.length >= 3 && currentCoords !== sourceCoords;
    const activeFit = hasEditedActive ? BZ.fit(currentCoords).shape : cloneShape(shape);

    shapeRef.current = cloneShape(activeFit);
    pastRef.current = [];
    futureRef.current = [];
    syncHistoryFlags();
    setFitErr(err);
    setEdited(Boolean(hasEditedActive));
    setMetrics(BZ.stats(shapeRef.current));
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCoords]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const pushCoords = useCallback(
    (immediate: boolean) => {
      clearTimeout(timerRef.current);
      const commit = () => {
        if (!shapeRef.current) return;
        onCoordsChange(BZ.coords(shapeRef.current, 81));
      };
      if (immediate) commit();
      else timerRef.current = setTimeout(commit, 55);
    },
    [onCoordsChange]
  );

  const applyNewShape = useCallback(
    (nextShape: BezierShape, recordUndo = true, immediatePush = true) => {
      if (recordUndo && shapeRef.current) {
        pushSnapshot(shapeRef.current);
      }
      shapeRef.current = nextShape;
      setEdited(true);
      setMetrics(BZ.stats(nextShape));
      draw();
      pushCoords(immediatePush);
    },
    [draw, pushCoords, pushSnapshot]
  );

  const pointerPos = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const shape = shapeRef.current;
    const cv = canvasRef.current;
    if (!shape || !cv || !showHandles) return;
    const [px, py] = pointerPos(e);
    let best: HandlePoint | null = null;
    let bd = 16;
    for (const h of getHandles(shape)) {
      const [a, b] = toPx(h.x, h.y, yScale);
      const d = Math.hypot(a - px, b - py);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    if (!best) return;
    pushSnapshot(shape);
    dragRef.current = best;
    hoverRef.current = best;
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = "grabbing";
    e.preventDefault();
    draw();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const shape = shapeRef.current;
    const cv = canvasRef.current;
    if (!shape || !cv) return;
    const [px, py] = pointerPos(e);
    const [x, y] = toW(px, py, yScale);
    const drag = dragRef.current;

    if (!drag) {
      if (!showHandles) {
        cv.style.cursor = "default";
        if (hoverRef.current) {
          hoverRef.current = null;
          draw();
        }
        return;
      }
      let best: HandlePoint | null = null;
      let bd = 16;
      for (const h of getHandles(shape)) {
        const [a, b] = toPx(h.x, h.y, yScale);
        const d = Math.hypot(a - px, b - py);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      cv.style.cursor = best ? "grab" : "default";
      const prev = hoverRef.current;
      const changed =
        (prev === null) !== (best === null) ||
        (prev &&
          best &&
          (prev.kind !== best.kind || prev.i !== best.i || prev.side !== best.side));
      if (changed) {
        hoverRef.current = best;
        draw();
      }
      return;
    }

    if (drag.kind === "c") {
      const P = shape.camber;
      const i = drag.i;
      const xmin = i === 1 ? 0.02 : P[1][0] + 0.05;
      const xmax = i === 1 ? P[2][0] - 0.05 : 0.98;
      P[i][0] = clamp(x, xmin, xmax);
      P[i][1] = clamp(y, -0.15, 0.15);
      drag.x = P[i][0];
      drag.y = P[i][1];
    } else {
      const T = shape.thick;
      const i = drag.i;
      const side = drag.side ?? 1;
      if (i === 1) {
        T[1][1] = clamp(side * 2 * y, 0.005, 0.36);
        drag.x = T[1][0];
        drag.y = side * (T[1][1] / 2);
      } else {
        const xmin = i === 2 ? 0.02 : T[2][0] + 0.05;
        const xmax = i === 2 ? T[3][0] - 0.05 : 0.98;
        T[i][0] = clamp(x, xmin, xmax);
        const yc = BZ.yAt(shape.camber, T[i][0]);
        T[i][1] = clamp(side * 2 * (y - yc), 0.002, 0.36);
        drag.x = T[i][0];
        drag.y = yc + side * (T[i][1] / 2);
      }
    }
    hoverRef.current = drag;
    setEdited(true);
    setMetrics(BZ.stats(shape));
    draw();
    pushCoords(false);
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
    draw();
    pushCoords(true);
  };

  const onPointerLeave = () => {
    if (!dragRef.current && hoverRef.current) {
      hoverRef.current = null;
      draw();
    }
  };

  const handleUndo = () => {
    if (!pastRef.current.length || !shapeRef.current) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, cloneShape(shapeRef.current)];
    syncHistoryFlags();
    shapeRef.current = cloneShape(prev);
    setEdited(true);
    setMetrics(BZ.stats(shapeRef.current));
    draw();
    pushCoords(true);
  };

  const handleRedo = () => {
    if (!futureRef.current.length || !shapeRef.current) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, cloneShape(shapeRef.current)];
    syncHistoryFlags();
    shapeRef.current = cloneShape(next);
    setEdited(true);
    setMetrics(BZ.stats(shapeRef.current));
    draw();
    pushCoords(true);
  };

  const handleThicknessSlider = (pct: number) => {
    const cur = shapeRef.current;
    if (!cur) return;
    if (!sliderSnapRef.current) {
      pushSnapshot(cur);
      sliderSnapRef.current = true;
    }
    const next = cloneShape(cur);
    const curStats = BZ.stats(next);
    const curThick = Math.max(curStats.thick, 0.005);
    const ratio = (pct / 100) / curThick;
    for (let i = 1; i <= 3; i++) {
      next.thick[i][1] = clamp(next.thick[i][1] * ratio, 0.004, 0.42);
    }
    shapeRef.current = next;
    setEdited(true);
    setMetrics(BZ.stats(next));
    draw();
    pushCoords(false);
  };

  const handleCamberSlider = (pct: number) => {
    const cur = shapeRef.current;
    if (!cur) return;
    if (!sliderSnapRef.current) {
      pushSnapshot(cur);
      sliderSnapRef.current = true;
    }
    const next = cloneShape(cur);
    const target = pct / 100;
    const curStats = BZ.stats(next);
    if (Math.abs(curStats.camber) > 0.0015) {
      const ratio = target / curStats.camber;
      next.camber[1][1] = clamp(next.camber[1][1] * ratio, -0.15, 0.15);
      next.camber[2][1] = clamp(next.camber[2][1] * ratio, -0.15, 0.15);
    } else {
      const ctrlH = clamp(target * 1.333, -0.15, 0.15);
      next.camber[1] = [0.3, ctrlH];
      next.camber[2] = [0.7, ctrlH];
    }
    shapeRef.current = next;
    setEdited(true);
    setMetrics(BZ.stats(next));
    draw();
    pushCoords(false);
  };

  const commitSliderSnap = () => {
    if (sliderSnapRef.current) {
      sliderSnapRef.current = false;
      pushCoords(true);
    }
  };

  const handleSymmetrize = () => {
    const cur = shapeRef.current;
    if (!cur) return;
    const next = cloneShape(cur);
    next.camber[1][1] = 0;
    next.camber[2][1] = 0;
    applyNewShape(next);
  };

  const handleInvertCamber = () => {
    const cur = shapeRef.current;
    if (!cur) return;
    const next = cloneShape(cur);
    next.camber[1][1] = clamp(-next.camber[1][1], -0.15, 0.15);
    next.camber[2][1] = clamp(-next.camber[2][1], -0.15, 0.15);
    applyNewShape(next);
  };

  const applyNaca4 = () => {
    const digits = nacaCode.replace(/\D/g, "");
    if (digits.length !== 4) {
      setNacaErr("Enter 4 digits (e.g. 2412).");
      return;
    }
    const m = Number(digits[0]);
    const pRaw = Number(digits[1]);
    const t = clamp(Number(digits.slice(2)), 2, 35);
    const p = m > 0 && pRaw === 0 ? 4 : pRaw;
    setNacaErr(null);
    const rawCoords = lbmNaca4(m, p, t, 60);
    const { shape, err } = BZ.fit(rawCoords);
    setFitErr(err);
    applyNewShape(cloneShape(shape));
  };

  const handleNacaKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyNaca4();
    }
  };

  const handleReset = () => {
    if (!fittedRef.current) return;
    if (shapeRef.current && edited) {
      pushSnapshot(shapeRef.current);
    }
    shapeRef.current = cloneShape(fittedRef.current);
    setEdited(false);
    clearTimeout(timerRef.current);
    setMetrics(BZ.stats(shapeRef.current));
    draw();
    onResetSource();
  };

  const buildDatText = () => {
    const pts = edited && shapeRef.current ? BZ.coords(shapeRef.current, 81) : sourceCoords;
    const base = (foilName || "airfoil").replace(/\.(dat|txt)$/i, "");
    const title = edited ? `${base} (edited)` : base;
    const text =
      title +
      "\n" +
      pts.map(([x, y]) => `${x.toFixed(6).padStart(10)} ${y.toFixed(6).padStart(10)}`).join("\n") +
      "\n";
    const fname = (title.replace(/[^\w.-]+/g, "_").replace(/_+$/, "") || "airfoil") + ".dat";
    return { text, fname };
  };

  const handleDownload = () => {
    const { text, fname } = buildDatText();
    downloadText(fname, text);
  };

  const handleCopyDat = async () => {
    const { text } = buildDatText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard permission errors
    }
  };

  const camberPct = Number((metrics.camber * 100).toFixed(1));
  const thickPct = Number((metrics.thick * 100).toFixed(1));

  return (
    <div id="shape-editor" className="flex flex-col gap-3">
      {/* Calibrated Geometry Readout */}
      <div className="grid grid-cols-3 divide-x divide-[var(--border)] border border-[var(--border)] rounded-lg bg-[var(--bg)] text-center py-2">
        <div className="px-2">
          <div className="text-[10px] font-semibold text-[#5C6670]">Camber</div>
          <div className="text-xs font-bold font-mono tabular-nums text-[#D97706] mt-0.5">
            {camberPct >= 0 ? "+" : ""}
            {camberPct.toFixed(1)}%
          </div>
          <div className="text-[9.5px] font-mono tabular-nums text-[#5C6670]">
            @ {(metrics.camberX * 100).toFixed(0)}%c
          </div>
        </div>
        <div className="px-2">
          <div className="text-[10px] font-semibold text-[#5C6670]">Thickness</div>
          <div className="text-xs font-bold font-mono tabular-nums text-[#1769AA] mt-0.5">
            {thickPct.toFixed(1)}%
          </div>
          <div className="text-[9.5px] font-mono tabular-nums text-[#5C6670]">
            @ {(metrics.thickX * 100).toFixed(0)}%c
          </div>
        </div>
        <div className="px-2">
          <div className="text-[10px] font-semibold text-[#5C6670]">Fit Error</div>
          <div className="text-xs font-bold font-mono tabular-nums text-[#161A1D] mt-0.5">
            ±{(fitErr * 100).toFixed(2)}%
          </div>
          <div className="text-[9.5px] font-mono tabular-nums text-[#5C6670]">81 pts</div>
        </div>
      </div>

      {/* Viewport & History Toolbar */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYScale((s) => (s === 2 ? 1 : 2))}
            title="Toggle 2× vertical magnification"
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              yScale === 2
                ? "bg-[var(--accent-light)] border-[#1769AA]/40 text-[#1769AA]"
                : "bg-[var(--bg)] border-[var(--border)] text-[#5C6670] hover:text-[#161A1D]"
            }`}
          >
            <ArrowUpDown size={11} aria-hidden="true" />
            <span>{yScale === 2 ? "2× Y" : "1:1"}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowGhost((g) => !g)}
            title="Show baseline airfoil outline"
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              showGhost
                ? "bg-[var(--accent-light)] border-[#1769AA]/40 text-[#1769AA]"
                : "bg-[var(--bg)] border-[var(--border)] text-[#5C6670] hover:text-[#161A1D]"
            }`}
          >
            <Eye size={11} aria-hidden="true" />
            <span>Ghost</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHandles((h) => !h)}
            title="Toggle Bézier control handles"
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
              showHandles
                ? "bg-[var(--accent-light)] border-[#1769AA]/40 text-[#1769AA]"
                : "bg-[var(--bg)] border-[var(--border)] text-[#5C6670] hover:text-[#161A1D]"
            }`}
          >
            Handles
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo geometry edit"
            aria-label="Undo geometry edit"
            className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[#161A1D] hover:border-[#1769AA] hover:text-[#1769AA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Undo2 size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo geometry edit"
            aria-label="Redo geometry edit"
            className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[#161A1D] hover:border-[#1769AA] hover:text-[#1769AA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Redo2 size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Interactive 2D Bézier Canvas */}
      <canvas
        ref={canvasRef}
        width={W * DPR}
        height={H * DPR}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        className="w-full h-auto block rounded-lg border border-[var(--border)] bg-[#F7F9FA]"
        style={{ aspectRatio: `${W} / ${H}`, touchAction: "none" }}
      />

      {/* Parametric Fine-Tuning Sliders */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="shape-thick-slider" className="font-semibold text-[#161A1D]">
              Max Thickness
            </label>
            <span className="font-mono tabular-nums font-bold text-[#1769AA]">
              {thickPct.toFixed(1)}%
            </span>
          </div>
          <input
            id="shape-thick-slider"
            type="range"
            min={4}
            max={26}
            step={0.5}
            value={clamp(thickPct, 4, 26)}
            onChange={(e) => handleThicknessSlider(Number(e.target.value))}
            onPointerUp={commitSliderSnap}
            onBlur={commitSliderSnap}
          />
        </div>

        <div className="flex flex-col gap-1 pt-1 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="shape-camber-slider" className="font-semibold text-[#161A1D]">
              Max Camber
            </label>
            <span className="font-mono tabular-nums font-bold text-[#D97706]">
              {camberPct >= 0 ? "+" : ""}
              {camberPct.toFixed(1)}%
            </span>
          </div>
          <input
            id="shape-camber-slider"
            type="range"
            min={-6}
            max={10}
            step={0.2}
            value={clamp(camberPct, -6, 10)}
            onChange={(e) => handleCamberSlider(Number(e.target.value))}
            onPointerUp={commitSliderSnap}
            onBlur={commitSliderSnap}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleSymmetrize}
            disabled={Math.abs(camberPct) < 0.05}
            className="px-2 py-1.5 rounded-md text-[11px] font-semibold bg-white border border-[var(--border)] text-[#161A1D] hover:border-[#1769AA] hover:text-[#1769AA] disabled:opacity-45 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <Minus size={12} aria-hidden="true" />
            <span>Zero Camber</span>
          </button>
          <button
            type="button"
            onClick={handleInvertCamber}
            disabled={Math.abs(camberPct) < 0.05}
            className="px-2 py-1.5 rounded-md text-[11px] font-semibold bg-white border border-[var(--border)] text-[#161A1D] hover:border-[#1769AA] hover:text-[#1769AA] disabled:opacity-45 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <FlipVertical2 size={12} aria-hidden="true" />
            <span>Invert Camber</span>
          </button>
        </div>
      </div>

      {/* Quick NACA 4-Digit Generator */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5">
        <div className="flex items-center gap-2">
          <label
            htmlFor="naca4-code"
            className="text-[11px] font-semibold text-[#161A1D] whitespace-nowrap"
          >
            NACA 4-Digit
          </label>
          <input
            id="naca4-code"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={nacaCode}
            onChange={(e) => {
              setNacaCode(e.target.value.replace(/\D/g, "").slice(0, 4));
              setNacaErr(null);
            }}
            onKeyDown={handleNacaKeyDown}
            placeholder="2412"
            className="flex-1 min-w-0 px-2.5 py-1 rounded-md text-xs font-mono tabular-nums bg-white border border-[var(--border)] text-[#161A1D] focus:outline-none focus:border-[#1769AA]"
          />
          <button
            type="button"
            onClick={applyNaca4}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#1769AA] text-white hover:bg-[#12568C] transition-colors whitespace-nowrap cursor-pointer"
          >
            Morph
          </button>
        </div>
        {nacaErr && <span className="text-[10.5px] text-red-600">{nacaErr}</span>}
      </div>

      {/* Reset & Export Actions */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          className="btn btn-secondary btn-sm whitespace-nowrap"
          onClick={handleReset}
          disabled={!edited}
        >
          <RotateCcw size={12} aria-hidden="true" />
          <span>Reset</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm whitespace-nowrap"
          onClick={handleCopyDat}
        >
          {copied ? (
            <Check size={12} className="text-[#047857]" aria-hidden="true" />
          ) : (
            <Copy size={12} aria-hidden="true" />
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm whitespace-nowrap"
          onClick={handleDownload}
        >
          <Download size={12} aria-hidden="true" />
          <span>Save .dat</span>
        </button>
      </div>
    </div>
  );
}
