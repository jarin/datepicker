import { useEffect, useRef, useState } from "react";
import "./TesseractDateTimePicker.css";

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface TesseractDateTimePickerProps {
  /** Currently selected datetime (controlled). */
  value: Date | null;
  /** Fired with the chosen datetime whenever a value changes. */
  onChange: (d: Date) => void;
  /** Inclusive year range. */
  fromYear?: number;
  toYear?: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* 4D Math — vectors, matrices, rotations, double-perspective          */
/* projection (4D → 3D → 2D).                                         */
/* ------------------------------------------------------------------ */

type V4 = [number, number, number, number];
type M4 = number[]; // 16 elements, row-major 4×4

const identity4 = (): M4 => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/** Build a 4D rotation in the plane spanned by axes a and b. */
function rot4(a: number, b: number, angle: number): M4 {
  const m = identity4();
  const c = Math.cos(angle), s = Math.sin(angle);
  m[a * 4 + a] = c;  m[a * 4 + b] = -s;
  m[b * 4 + a] = s;  m[b * 4 + b] = c;
  return m;
}

const rotXY = (a: number) => rot4(0, 1, a);
const rotXZ = (a: number) => rot4(0, 2, a);
const rotXW = (a: number) => rot4(0, 3, a);
const rotYZ = (a: number) => rot4(1, 2, a);
const rotYW = (a: number) => rot4(1, 3, a);
const rotZW = (a: number) => rot4(2, 3, a);

function mulMV(m: M4, v: V4): V4 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3] * v[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7] * v[3],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11] * v[3],
    m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15] * v[3],
  ];
}

function mulMM(a: M4, b: M4): M4 {
  const r: number[] = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
}

/** Perspective project from 4D to 3D (viewpoint at distance d4 on W axis). */
function project4to3(v: V4, d4: number): [number, number, number] {
  const s = d4 / (d4 - v[3]);
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Perspective project from 3D to 2D (camera at distance d3 on Z axis). */
function project3to2(v3: [number, number, number], d3: number): [number, number] {
  const s = d3 / (d3 - v3[2]);
  return [v3[0] * s, v3[1] * s];
}

/** Combined depth scalar — larger means closer to viewer. */
function depthFactor(v: V4, d4: number, d3: number): number {
  const s4 = d4 / (d4 - v[3]);
  const z3 = v[2] * s4;
  return s4 * (d3 / (d3 - z3));
}

/* ------------------------------------------------------------------ */
/* Tesseract Geometry — 16 vertices (±1⁴), 32 edges (Hamming-1)       */
/* ------------------------------------------------------------------ */

const VERTS: V4[] = [];
for (let i = 0; i < 16; i++)
  VERTS.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);

const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++)
  for (let j = i + 1; j < 16; j++) {
    const xor = i ^ j;
    if (xor && (xor & (xor - 1)) === 0) EDGES.push([i, j]);
  }

/** Which axis (0–3) an edge runs along. */
function edgeAxis(i: number, j: number): number {
  const xor = i ^ j;
  if (xor === 1) return 0;
  if (xor === 2) return 1;
  if (xor === 4) return 2;
  return 3;
}

const AXIS_COLORS: { hue: number; label: string }[] = [
  { hue: 220, label: "Year" },
  { hue: 160, label: "Month" },
  { hue: 40,  label: "Day" },
  { hue: 300, label: "Time" },
];

/* ------------------------------------------------------------------ */
/* Calendar helpers (duplicated from HyperbolicDateTimePicker)          */
/* ------------------------------------------------------------------ */

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y: number, m: number) =>
  [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const monNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ------------------------------------------------------------------ */
/* Axis mappings — each maps a temporal range to the [-1, +1] cube     */
/* coordinate, with tick generation.                                   */
/* ------------------------------------------------------------------ */

function yearAxis(from: number, to: number) {
  const range = to - from;
  return {
    toCoord: (y: number) => range === 0 ? 0 : -1 + 2 * (y - from) / range,
    toValue: (c: number) => Math.round(from + (c + 1) / 2 * range),
    ticks() {
      const step = range <= 50 ? 5 : range <= 200 ? 10 : range <= 500 ? 50 : 100;
      const t: { val: number; coord: number; label?: string }[] = [];
      const start = Math.ceil(from / step) * step;
      for (let y = start; y <= to; y += step)
        t.push({ val: y, coord: -1 + 2 * (y - from) / range });
      return t;
    },
  };
}

function monthAxisMap() {
  return {
    toCoord: (m: number) => -1 + 2 * (m - 1) / 11,
    toValue: (c: number) => Math.max(1, Math.min(12, Math.round(1 + (c + 1) / 2 * 11))),
    ticks: () =>
      Array.from({ length: 12 }, (_, i) => ({
        val: i + 1, coord: -1 + 2 * i / 11, label: monNames[i],
      })),
  };
}

function dayAxisMap(maxDay: number) {
  return {
    toCoord: (d: number) => maxDay <= 1 ? 0 : -1 + 2 * (d - 1) / (maxDay - 1),
    toValue: (c: number) => Math.max(1, Math.min(maxDay, Math.round(1 + (c + 1) / 2 * (maxDay - 1)))),
    ticks() {
      const step = maxDay <= 7 ? 1 : maxDay <= 15 ? 2 : 5;
      const t: { val: number; coord: number }[] = [];
      for (let d = 1; d <= maxDay; d += step)
        t.push({ val: d, coord: maxDay <= 1 ? 0 : -1 + 2 * (d - 1) / (maxDay - 1) });
      if (t.length && t[t.length - 1].val !== maxDay)
        t.push({ val: maxDay, coord: 1 });
      return t;
    },
  };
}

function timeAxisMap() {
  return {
    toCoord: (h: number) => -1 + 2 * h / 24,
    toValue: (c: number) => Math.max(0, Math.min(24 - 1 / 3600, (c + 1) / 2 * 24)),
    ticks: () =>
      Array.from({ length: 9 }, (_, i) => ({
        val: i * 3, coord: -1 + 2 * (i * 3) / 24, label: `${i * 3}:00`,
      })),
  };
}

function decToHMS(dec: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.min(86399, Math.round(dec * 3600)));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

function hmsToDecimal(h: number, m: number, s: number): number {
  return h + m / 60 + s / 3600;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function TesseractDateTimePicker({
  value,
  onChange,
  fromYear = 1900,
  toYear = 2100,
  className,
}: TesseractDateTimePickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [readout, setReadout] = useState<string | null>(null);
  const [hintAxis, setHintAxis] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const CW = 520, CH = 420;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = CW * DPR; canvas.height = CH * DPR;
    canvas.style.width = CW + "px"; canvas.style.height = CH + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const CX = CW / 2, CY = CH / 2;
    const SCALE = 110;
    const D4 = 3.0;   // 4D viewpoint distance along W
    const D3 = 4.0;   // 3D camera distance along Z

    /* ---- mutable state ---- */
    const angles = [0, 0, 0, 0, 0, 0]; // XY, XZ, XW, YZ, YW, ZW
    let selYear = 2024, selMonth = 1, selDay = 1;
    let selHour = 0, selMin = 0, selSec = 0;
    let hasSelection = false;
    let activeAxis: number | null = null;
    let lastInteraction = 0;
    let dragState: {
      startX: number; startY: number;
      startAngles: number[];
      shift: boolean;
      moved: number;
    } | null = null;
    let axisDragState: {
      axis: number; startVal: number;
      startX: number; startY: number;
      axisDir: [number, number];
    } | null = null;

    const yAxis = yearAxis(fromYear, toYear);

    // Initialize from value
    if (value) {
      selYear = value.getFullYear();
      selMonth = value.getMonth() + 1;
      selDay = value.getDate();
      selHour = value.getHours();
      selMin = value.getMinutes();
      selSec = value.getSeconds();
      hasSelection = true;
    }

    /* ---- projection helpers ---- */

    function buildRotation(): M4 {
      let m = identity4();
      m = mulMM(rotXY(angles[0]), m);
      m = mulMM(rotXZ(angles[1]), m);
      m = mulMM(rotXW(angles[2]), m);
      m = mulMM(rotYZ(angles[3]), m);
      m = mulMM(rotYW(angles[4]), m);
      m = mulMM(rotZW(angles[5]), m);
      return m;
    }

    function projectVertex(v: V4, rot: M4): { x: number; y: number; depth: number } {
      const rv = mulMV(rot, v);
      const v3 = project4to3(rv, D4);
      const v2 = project3to2(v3, D3);
      const df = depthFactor(rv, D4, D3);
      return { x: CX + v2[0] * SCALE, y: CY - v2[1] * SCALE, depth: df };
    }

    function selPoint4D(): V4 {
      const maxD = dim(selYear, selMonth);
      const t = hmsToDecimal(selHour, selMin, selSec);
      return [
        yAxis.toCoord(selYear),
        monthAxisMap().toCoord(selMonth),
        dayAxisMap(maxD).toCoord(selDay),
        timeAxisMap().toCoord(t),
      ];
    }

    /* ---- emit / readout ---- */

    function emitChange() {
      const maxD = dim(selYear, selMonth);
      if (selDay > maxD) selDay = maxD;
      const d = new Date(selYear, selMonth - 1, selDay, selHour, selMin, selSec);
      if (selYear >= 0 && selYear < 100) d.setFullYear(selYear);
      hasSelection = true;
      onChangeRef.current(d);
      syncReadout();
    }

    function syncReadout() {
      if (!hasSelection) {
        setReadout(null);
        setHintAxis(null);
        return;
      }
      setReadout(
        `${String(selYear).padStart(4, "0")}-${String(selMonth).padStart(2, "0")}-` +
        `${String(selDay).padStart(2, "0")} ` +
        `${String(selHour).padStart(2, "0")}:${String(selMin).padStart(2, "0")}:` +
        `${String(selSec).padStart(2, "0")}`
      );
      setHintAxis(activeAxis);
    }

    /* ---- render ---- */

    function render() {
      ctx.clearRect(0, 0, CW, CH);
      const rot = buildRotation();

      // Project all 16 vertices
      const projected = VERTS.map(v => projectVertex(v, rot));

      // Sort edges back-to-front by average depth
      const sortedEdges = EDGES.map(([i, j]) => ({
        i, j,
        avgDepth: (projected[i].depth + projected[j].depth) / 2,
        axis: edgeAxis(i, j),
      })).sort((a, b) => a.avgDepth - b.avgDepth);

      // Draw edges
      for (const e of sortedEdges) {
        const a = projected[e.i], b = projected[e.j];
        const hue = AXIS_COLORS[e.axis].hue;
        const t = Math.min(1, Math.max(0, (e.avgDepth - 0.3) / 1.4));
        const alpha = 0.12 + 0.58 * t;
        const isActive = e.axis === activeAxis;
        const lw = isActive ? 1.5 + 2.0 * t : 0.5 + 1.5 * t;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `hsla(${hue},75%,${isActive ? 70 : 62}%,${alpha})`;
        ctx.lineWidth = lw;
        ctx.stroke();
      }

      // Draw vertices
      for (const p of projected) {
        const t = Math.min(1, Math.max(0, (p.depth - 0.3) / 1.4));
        const r = 1.2 + 2.8 * t;
        const alpha = 0.15 + 0.6 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,220,255,${alpha})`;
        ctx.fill();
      }

      // Tick marks along active axis
      if (activeAxis !== null) {
        const ax = activeAxis;
        const maxD = dim(selYear, selMonth);
        const ticks = ax === 0 ? yAxis.ticks()
          : ax === 1 ? monthAxisMap().ticks()
          : ax === 2 ? dayAxisMap(maxD).ticks()
          : timeAxisMap().ticks();

        const basePoint: V4 = hasSelection ? selPoint4D() : [0, 0, 0, 0];

        for (const tick of ticks) {
          const pt: V4 = [...basePoint];
          pt[ax] = tick.coord;
          const proj = projectVertex(pt, rot);
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${AXIS_COLORS[ax].hue},70%,65%,0.7)`;
          ctx.fill();

          const label = "label" in tick ? (tick as { label: string }).label : String(tick.val);
          ctx.font = "10px system-ui";
          ctx.fillStyle = `hsla(${AXIS_COLORS[ax].hue},60%,78%,0.85)`;
          ctx.textAlign = "center";
          ctx.fillText(label, proj.x, proj.y - 7);
        }
      }

      // Axis labels at positive endpoints (slightly beyond the cube)
      for (let ax = 0; ax < 4; ax++) {
        const endPt: V4 = [0, 0, 0, 0];
        endPt[ax] = 1.35;
        const proj = projectVertex(endPt, rot);
        const isActive = ax === activeAxis;
        ctx.font = isActive ? "bold 13px system-ui" : "11px system-ui";
        ctx.fillStyle = `hsla(${AXIS_COLORS[ax].hue},70%,${isActive ? 82 : 65}%,${isActive ? 1.0 : 0.7})`;
        ctx.textAlign = "center";
        ctx.fillText(AXIS_COLORS[ax].label, proj.x, proj.y - 5);
      }

      // Selected datetime point — glowing green dot
      if (hasSelection) {
        const sv = selPoint4D();
        const sp = projectVertex(sv, rot);
        const grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 14);
        grad.addColorStop(0, "rgba(100,255,140,0.45)");
        grad.addColorStop(1, "rgba(100,255,140,0)");
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#7af29a";
        ctx.fill();
      }
    }

    /* ---- interaction helpers ---- */

    function axisScreenInfo(rot: M4) {
      return [0, 1, 2, 3].map(ax => {
        const neg: V4 = [0, 0, 0, 0]; neg[ax] = -1;
        const pos: V4 = [0, 0, 0, 0]; pos[ax] = 1;
        const s = projectVertex(neg, rot);
        const e = projectVertex(pos, rot);
        const dx = e.x - s.x, dy = e.y - s.y;
        const len = Math.hypot(dx, dy) || 1;
        return { start: s, end: e, dir: [dx / len, dy / len] as [number, number] };
      });
    }

    function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    function findNearestAxis(mx: number, my: number): number | null {
      const rot = buildRotation();
      const info = axisScreenInfo(rot);
      let bestDist = 25, bestAxis: number | null = null;
      for (let ax = 0; ax < 4; ax++) {
        const { start, end } = info[ax];
        const d = ptSegDist(mx, my, start.x, start.y, end.x, end.y);
        if (d < bestDist) { bestDist = d; bestAxis = ax; }
      }
      return bestAxis;
    }

    function stepAxis(axis: number, delta: number) {
      if (axis === 0) {
        selYear = Math.max(fromYear, Math.min(toYear, selYear + delta));
      } else if (axis === 1) {
        selMonth += delta;
        if (selMonth > 12) selMonth = 1;
        else if (selMonth < 1) selMonth = 12;
      } else if (axis === 2) {
        const maxD = dim(selYear, selMonth);
        selDay += delta;
        if (selDay > maxD) selDay = 1;
        else if (selDay < 1) selDay = maxD;
      } else {
        let total = selHour * 3600 + selMin * 60 + selSec + delta * 900;
        total = ((total % 86400) + 86400) % 86400;
        selHour = Math.floor(total / 3600);
        selMin = Math.floor((total % 3600) / 60);
        selSec = total % 60;
      }
      emitChange();
    }

    /* ---- event handlers ---- */

    const onPointerDown = (e: PointerEvent) => {
      lastInteraction = performance.now();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      // If an axis is active, check for drag along it
      if (activeAxis !== null && hasSelection) {
        const rot = buildRotation();
        const info = axisScreenInfo(rot);
        const { start, end, dir } = info[activeAxis];
        const d = ptSegDist(mx, my, start.x, start.y, end.x, end.y);
        if (d < 30) {
          const currentVal = activeAxis === 0 ? selYear
            : activeAxis === 1 ? selMonth
            : activeAxis === 2 ? selDay
            : hmsToDecimal(selHour, selMin, selSec);
          axisDragState = { axis: activeAxis, startVal: currentVal, startX: mx, startY: my, axisDir: dir };
          canvas.setPointerCapture?.(e.pointerId);
          return;
        }
      }

      dragState = { startX: mx, startY: my, startAngles: [...angles], shift: e.shiftKey, moved: 0 };
      canvas.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      lastInteraction = performance.now();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      if (axisDragState) {
        const { axis, startVal, startX, startY, axisDir } = axisDragState;
        const dx = mx - startX, dy = my - startY;
        const proj = dx * axisDir[0] + dy * axisDir[1];

        if (axis === 0) {
          const range = toYear - fromYear;
          const delta = Math.round(proj / SCALE * range / 2);
          selYear = Math.max(fromYear, Math.min(toYear, Math.round(startVal) + delta));
        } else if (axis === 1) {
          const delta = Math.round(proj / SCALE * 11 / 2);
          selMonth = Math.max(1, Math.min(12, Math.round(startVal) + delta));
        } else if (axis === 2) {
          const maxD = dim(selYear, selMonth);
          const delta = Math.round(proj / SCALE * (maxD - 1) / 2);
          selDay = Math.max(1, Math.min(maxD, Math.round(startVal) + delta));
        } else {
          const delta = proj / SCALE * 12;
          const newVal = Math.max(0, Math.min(24 - 1 / 3600, startVal + delta));
          const hms = decToHMS(newVal);
          selHour = hms.h; selMin = hms.m; selSec = hms.s;
        }
        hasSelection = true;
        emitChange();
        render();
        return;
      }

      if (dragState) {
        const dx = mx - dragState.startX, dy = my - dragState.startY;
        dragState.moved += Math.abs(dx) + Math.abs(dy);
        const sens = 0.008;
        if (dragState.shift) {
          angles[2] = dragState.startAngles[2] + dx * sens; // XW
          angles[4] = dragState.startAngles[4] + dy * sens; // YW
        } else {
          angles[1] = dragState.startAngles[1] + dx * sens; // XZ
          angles[3] = dragState.startAngles[3] + dy * sens; // YZ
        }
        render();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (axisDragState) {
        axisDragState = null;
        return;
      }
      if (dragState) {
        if (dragState.moved < 8) {
          // Click — toggle axis selection
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          const near = findNearestAxis(mx, my);
          if (near !== null) {
            activeAxis = near;
            if (!hasSelection) {
              selYear = Math.round((fromYear + toYear) / 2);
              selMonth = 6; selDay = 15;
              selHour = 12; selMin = 0; selSec = 0;
              emitChange();
            }
          } else {
            activeAxis = null;
          }
          syncReadout();
          render();
        }
        dragState = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastInteraction = performance.now();
      if (activeAxis !== null) {
        if (!hasSelection) {
          selYear = Math.round((fromYear + toYear) / 2);
          selMonth = 6; selDay = 15;
          selHour = 12; selMin = 0; selSec = 0;
          hasSelection = true;
        }
        const delta = e.deltaY > 0 ? 1 : -1;
        stepAxis(activeAxis, delta);
        render();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        activeAxis = null;
        syncReadout();
        render();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);

    /* ---- auto-rotation ---- */

    let animId: number;
    const animate = () => {
      const now = performance.now();
      if (now - lastInteraction > 2000 && !dragState && !axisDragState) {
        angles[2] += 0.003; // XW
        angles[3] += 0.003; // YZ
        render();
      }
      animId = requestAnimationFrame(animate);
    };

    syncReadout();
    render();
    animId = requestAnimationFrame(animate);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(animId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYear, toYear]);

  return (
    <div className={"tess" + (className ? ` ${className}` : "")}>
      <canvas ref={canvasRef} className="tess-canvas" tabIndex={0} />
      <div className="tess-readout">
        {readout ? (
          <>
            <span className="tess-ts">{readout}</span>
            <span className="tess-axis-hint">
              {hintAxis !== null
                ? `scroll to adjust ${AXIS_COLORS[hintAxis].label.toLowerCase()}`
                : "click an axis to adjust"}
            </span>
          </>
        ) : (
          <span className="tess-hint">drag to rotate · shift+drag for 4D · click an axis to select</span>
        )}
      </div>
      <div className="tess-legend">
        {AXIS_COLORS.map((c, i) => (
          <span
            key={i}
            className="tess-legend-item"
            style={{ "--dot-color": `hsl(${c.hue},70%,62%)` } as React.CSSProperties}
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
