import { useEffect, useRef, useState } from "react";
import "./HyperbolicDateTimePicker.css";

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface HyperbolicDateTimePickerProps {
  /** Currently selected datetime (controlled). */
  value: Date | null;
  /** Fired with the chosen datetime as you dive to a finer level. */
  onChange: (date: Date) => void;
  /** Inclusive year range. Defaults to the whole Common Era we bothered with. */
  fromYear?: number;
  toYear?: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Hyperbolic geometry — the Poincaré disk model of the Lobachevsky    */
/* plane. Points are complex z with |z| < 1; orientation-preserving    */
/* isometries form SU(1,1): z ↦ (a·z + b)/(b̄·z + ā), |a|²−|b|² = 1.    */
/* ------------------------------------------------------------------ */

type C = { re: number; im: number };
const c = (re: number, im = 0): C => ({ re, im });
const add = (x: C, y: C): C => c(x.re + y.re, x.im + y.im);
const sub = (x: C, y: C): C => c(x.re - y.re, x.im - y.im);
const mul = (x: C, y: C): C => c(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);
const cj = (x: C): C => c(x.re, -x.im);
const neg = (x: C): C => c(-x.re, -x.im);
const abs2 = (x: C): number => x.re * x.re + x.im * x.im;
const cabs = (x: C): number => Math.hypot(x.re, x.im);
const cdiv = (x: C, y: C): C => {
  const d = abs2(y);
  return c((x.re * y.re + x.im * y.im) / d, (x.im * y.re - x.re * y.im) / d);
};
const cscale = (x: C, s: number): C => c(x.re * s, x.im * s);

type Iso = { a: C; b: C };
const ident = (): Iso => ({ a: c(1), b: c(0) });
/** The unique isometry sending the point p to the origin (a hyperbolic translation). */
const recenter = (p: C): Iso => {
  const s = Math.sqrt(Math.max(1e-12, 1 - abs2(p)));
  return { a: c(1 / s), b: cscale(neg(p), 1 / s) };
};
const inv = (m: Iso): Iso => ({ a: cj(m.a), b: neg(m.b) });
const compose = (m2: Iso, m1: Iso): Iso => ({
  a: add(mul(m2.a, m1.a), mul(m2.b, cj(m1.b))),
  b: add(mul(m2.a, m1.b), mul(m2.b, cj(m1.a))),
});
const applyIso = (m: Iso, z: C): C =>
  cdiv(add(mul(m.a, z), m.b), add(mul(cj(m.b), z), cj(m.a)));
/** Re-project a drifted matrix back onto SU(1,1) (kills float drift on compose). */
const renorm = (m: Iso): Iso => {
  const s = Math.sqrt(Math.max(1e-12, abs2(m.a) - abs2(m.b)));
  return { a: cscale(m.a, 1 / s), b: cscale(m.b, 1 / s) };
};
const place = (p: C): Iso => inv(recenter(p)); // 0 ↦ p
const placeOut = (step: number): Iso => place(c(Math.tanh(step / 2), 0)); // 0 ↦ distance `step` along +x
const rotate = (phi: number): Iso => ({ a: c(Math.cos(phi / 2), Math.sin(phi / 2)), b: c(0) });
const hdist = (z: C, w: C): number =>
  2 * Math.atanh(Math.min(1 - 1e-15, cabs(cdiv(sub(z, w), sub(c(1), mul(cj(w), z))))));

/* ------------------------------------------------------------------ */
/* Calendar — proleptic Gregorian (JS Date is wrong for years < 100).  */
/* ------------------------------------------------------------------ */

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y: number, m: number) =>
  [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const monNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const wdNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const jdn = (y: number, m: number, d: number) => {
  const a = Math.floor((14 - m) / 12), Y = y + 4800 - a, M = m + 12 * a - 3;
  return d + Math.floor((153 * M + 2) / 5) + 365 * Y + Math.floor(Y / 4) - Math.floor(Y / 100) + Math.floor(Y / 400) - 32045;
};
const jdnToY = (J: number) => {
  const a = J + 32044, b = Math.floor((4 * a + 3) / 146097), cc = a - Math.floor((146097 * b) / 4);
  const d2 = Math.floor((4 * cc + 3) / 1461), e = cc - Math.floor((1461 * d2) / 4), m2 = Math.floor((5 * e + 2) / 153);
  return 100 * b + d2 - 4800 + Math.floor(m2 / 10);
};
const weekdayOf = (y: number, m: number, d: number) => ((jdn(y, m, d) % 7) + 7) % 7; // 0=Mon … 6=Sun
const isoWeek = (y: number, m: number, d: number) => {
  const j = jdn(y, m, d), monJ = j - (((j % 7) + 7) % 7), thuJ = monJ + 3, iy = jdnToY(thuJ);
  const jan4 = jdn(iy, 1, 4), w1 = jan4 - (((jan4 % 7) + 7) % 7);
  return Math.floor((monJ - w1) / 7) + 1;
};

/* ------------------------------------------------------------------ */
/* The tree: millennium→century→decade→year→month→week→weekday→        */
/* AM/PM→hour→minute→second. Grouping levels with one child collapse,   */
/* so small ranges stay shallow; everything below year is lazy.        */
/* ------------------------------------------------------------------ */

type Kind = "root" | "mill" | "cent" | "dec" | "year" | "month" | "week" | "weekday" | "ampm" | "hour" | "minute" | "second";
interface TNode {
  kind: Kind;
  parent: TNode | null;
  children: TNode[];
  level: number;
  val?: number; y?: number; m?: number; d?: number; wd?: number; week?: number;
  pm?: boolean; h?: number; h12?: number; mi?: number; s?: number;
  days?: { d: number; w: number }[];
  T?: Iso; z?: C; aperture?: number; expanded?: boolean;
}
interface Sel { y: number; m: number; d: number; h: number; mi: number; s: number }

const STEP = 1.4, EXPAND = 5, MAXAP = 2.5, MINAP = 0.4;

function buildSkeleton(from: number, to: number): TNode {
  const root: TNode = { kind: "root", parent: null, children: [], level: 0 };
  const find = (parent: TNode, kind: Kind, val: number): TNode => {
    let n = parent.children.find((x) => x.kind === kind && x.val === val);
    if (!n) { n = { kind, val, parent, children: [], level: 0 }; parent.children.push(n); }
    return n;
  };
  for (let y = from; y <= to; y++) {
    const mill = find(root, "mill", Math.floor(y / 1000) * 1000);
    const cent = find(mill, "cent", Math.floor(y / 100) * 100);
    const dec = find(cent, "dec", Math.floor(y / 10) * 10);
    find(dec, "year", y);
  }
  (function collapse(n: TNode) {
    for (const ch of n.children.slice()) collapse(ch);
    if ((n.kind === "mill" || n.kind === "cent" || n.kind === "dec") && n.children.length === 1) {
      const ch = n.children[0], p = n.parent!, i = p.children.indexOf(n);
      p.children[i] = ch; ch.parent = p;
    }
  })(root);
  (function setLevel(n: TNode, L: number) { n.level = L; for (const ch of n.children) setLevel(ch, L + 1); })(root, 0);
  return root;
}

function layoutChildren(node: TNode) {
  const n = node.children.length;
  if (!n) return;
  const ap = node.aperture ?? Math.PI;
  for (let i = 0; i < n; i++) {
    const phi = node.level === 0 ? -Math.PI + ((i + 0.5) * (2 * Math.PI)) / n : n === 1 ? 0 : -ap + ((i + 0.5) * (2 * ap)) / n;
    const ch = node.children[i];
    ch.T = renorm(compose(node.T!, compose(rotate(phi), placeOut(STEP))));
    ch.z = applyIso(ch.T, c(0));
    ch.level = node.level + 1;
    const slotHalf = node.level === 0 ? Math.PI / n : ap / n;
    ch.aperture = Math.max(MINAP, Math.min(MAXAP, slotHalf * EXPAND));
  }
}

const mk = (parent: TNode, o: Partial<TNode> & { kind: Kind }): TNode => {
  const ch: TNode = { parent, children: [], level: parent.level + 1, ...o };
  parent.children.push(ch);
  return ch;
};
function expand(node: TNode) {
  if (node.expanded) return;
  node.expanded = true;
  if (node.kind === "year") {
    for (let m = 1; m <= 12; m++) mk(node, { kind: "month", y: node.val!, m });
  } else if (node.kind === "month") {
    const groups: Record<number, { d: number; w: number }[]> = {};
    for (let d = 1; d <= dim(node.y!, node.m!); d++) {
      const j = jdn(node.y!, node.m!, d), monJ = j - (((j % 7) + 7) % 7);
      (groups[monJ] ??= []).push({ d, w: weekdayOf(node.y!, node.m!, d) });
    }
    for (const monJ of Object.keys(groups).map(Number).sort((a, b) => a - b)) {
      const days = groups[monJ];
      mk(node, { kind: "week", y: node.y, m: node.m, week: isoWeek(node.y!, node.m!, days[0].d), days });
    }
  } else if (node.kind === "week") {
    for (const { d, w } of node.days!.slice().sort((a, b) => a.w - b.w)) // only valid (in-month) weekdays
      mk(node, { kind: "weekday", y: node.y, m: node.m, d, wd: w });
  } else if (node.kind === "weekday") {
    mk(node, { kind: "ampm", y: node.y, m: node.m, d: node.d, pm: false });
    mk(node, { kind: "ampm", y: node.y, m: node.m, d: node.d, pm: true });
  } else if (node.kind === "ampm") {
    for (let k = 0; k < 12; k++) {
      const h12 = k === 0 ? 12 : k;
      const h = node.pm ? (h12 % 12) + 12 : h12 % 12;
      mk(node, { kind: "hour", y: node.y, m: node.m, d: node.d, h, h12, pm: node.pm });
    }
  } else if (node.kind === "hour") {
    for (let mi = 0; mi < 60; mi++) mk(node, { kind: "minute", y: node.y, m: node.m, d: node.d, h: node.h, mi });
  } else if (node.kind === "minute") {
    for (let s = 0; s < 60; s++) mk(node, { kind: "second", y: node.y, m: node.m, d: node.d, h: node.h, mi: node.mi, s });
  }
  if (node.children.length) layoutChildren(node);
}

const labelOf = (n: TNode): string => {
  switch (n.kind) {
    case "mill": case "cent": case "dec": return n.val + "s";
    case "year": return String(n.val);
    case "month": return monNames[n.m! - 1];
    case "week": return "W" + n.week;
    case "weekday": return wdNames[n.wd!];
    case "ampm": return n.pm ? "PM" : "AM";
    case "hour": return n.h12 + (n.pm ? "pm" : "am");
    case "minute": return ":" + String(n.mi).padStart(2, "0");
    case "second": return "." + String(n.s).padStart(2, "0");
    default: return "";
  }
};
const HUE: Record<Kind, number> = { root: 0, mill: 280, cent: 250, dec: 220, year: 200, month: 160, week: 120, weekday: 90, ampm: 60, hour: 40, minute: 20, second: 0 };

const asSel = (n: TNode): Sel => ({ y: n.y!, m: n.m!, d: n.d!, h: n.h ?? 0, mi: n.mi ?? 0, s: n.s ?? 0 });
function makeDate(s: Sel): Date {
  const dt = new Date(s.y, s.m - 1, s.d, s.h, s.mi, s.s);
  if (s.y >= 0 && s.y < 100) dt.setFullYear(s.y); // undo JS Date's 1900-offset for early years
  return dt;
}

/** Descend toward a target, materialising lazily; returns the path. */
function drillPath(root: TNode, t: Partial<Sel>): TNode[] {
  let node: TNode | undefined = root;
  const out: TNode[] = [root];
  while (node) {
    let nx: TNode | undefined;
    if (node.kind === "root" || node.kind === "mill" || node.kind === "cent" || node.kind === "dec") {
      const k0: Kind | undefined = node.children[0]?.kind;
      const want: number = k0 === "mill" ? Math.floor(t.y! / 1000) * 1000 : k0 === "cent" ? Math.floor(t.y! / 100) * 100 : k0 === "dec" ? Math.floor(t.y! / 10) * 10 : t.y!;
      nx = node.children.find((ch) => (ch.kind === "year" ? ch.val === t.y : ch.val === want));
    } else {
      expand(node);
      if (node.kind === "year") nx = node.children.find((ch) => ch.m === t.m);
      else if (node.kind === "month") { if (t.d == null) break; nx = node.children.find((ch) => ch.days!.some((x) => x.d === t.d)); }
      else if (node.kind === "week") nx = node.children.find((ch) => ch.d === t.d);
      else if (node.kind === "weekday") { if (t.h == null) break; nx = node.children.find((ch) => ch.pm === t.h! >= 12); }
      else if (node.kind === "ampm") nx = node.children.find((ch) => ch.h === t.h);
      else if (node.kind === "hour") { if (t.mi == null) break; nx = node.children.find((ch) => ch.mi === t.mi); }
      else if (node.kind === "minute") { if (t.s == null) break; nx = node.children.find((ch) => ch.s === t.s); }
    }
    if (!nx) break;
    out.push(nx);
    node = nx;
  }
  return out;
}

const fmt = (s: Sel | null) =>
  s
    ? `${String(s.y).padStart(4, "0")}-${String(s.m).padStart(2, "0")}-${String(s.d).padStart(2, "0")} ` +
      `${String(s.h).padStart(2, "0")}:${String(s.mi).padStart(2, "0")}:${String(s.s).padStart(2, "0")}`
    : "—";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function HyperbolicDateTimePicker({
  value,
  onChange,
  fromYear = 0,
  toYear = 2400,
  className,
}: HyperbolicDateTimePickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [sel, setSel] = useState<Sel | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const SIZE = 460, DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * DPR; canvas.height = SIZE * DPR;
    canvas.style.width = SIZE + "px"; canvas.style.height = SIZE + "px";
    ctx.scale(DPR, DPR);
    const CC = SIZE / 2, RAD = SIZE / 2 - 6;
    const toScreen = (z: C) => ({ x: CC + z.re * RAD, y: CC - z.im * RAD });

    const root = buildSkeleton(fromYear, toYear);
    root.T = ident(); root.z = c(0); root.aperture = Math.PI;
    (function placeSkeleton(n: TNode) {
      if (n.children.length) { layoutChildren(n); for (const ch of n.children) if (ch.kind !== "year") placeSkeleton(ch); }
    })(root);

    let V = ident();
    let selected: Sel | null = null;
    const walk = (fn: (n: TNode) => void) => (function go(n: TNode) { fn(n); for (const ch of n.children) go(ch); })(root);

    function render() {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath(); ctx.arc(CC, CC, RAD, 0, 2 * Math.PI); ctx.clip();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(150,170,230,.18)"; ctx.beginPath();
      walk((n) => {
        if (!n.parent) return;
        const a = applyIso(V, n.z!), b = applyIso(V, n.parent.z!);
        if (cabs(a) > 1.05 && cabs(b) > 1.05) return;
        const A = toScreen(a), B = toScreen(b); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      });
      ctx.stroke();
      walk((n) => {
        if (n.kind === "root") return;
        const tz = applyIso(V, n.z!), a2 = abs2(tz);
        if (a2 > 0.9995) return;
        const f = 1 - a2, s = toScreen(tz);
        const isSel = selected && n.kind === "second" && n.y === selected.y && n.m === selected.m && n.d === selected.d && n.h === selected.h && n.mi === selected.mi && n.s === selected.s;
        const r = Math.max(0.7, (n.level <= 4 ? 4.3 : 3.0 - (n.level - 4) * 0.2) * f);
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.7, r), 0, 2 * Math.PI);
        ctx.fillStyle = isSel ? "#7af29a" : `hsla(${HUE[n.kind]},70%,68%,${0.3 + 0.65 * f})`;
        ctx.fill();
        const thr = n.level <= 4 ? 0.05 : n.kind === "month" || n.kind === "week" || n.kind === "weekday" ? 0.16 : 0.3;
        if (f > thr) {
          ctx.fillStyle = "rgba(232,240,255," + Math.min(1, f * 2.2) + ")";
          ctx.font = `${Math.max(8, Math.min(15, 12 * f * 1.5))}px system-ui`;
          ctx.textAlign = "center";
          ctx.fillText(labelOf(n), s.x, s.y - r - 2);
        }
      });
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CC, CC, RAD, 0, 2 * Math.PI); ctx.stroke();
    }

    function nearest(world: C): TNode | null {
      let best: TNode | null = null, bd = Infinity;
      walk((n) => { if (n.kind === "root") return; const d = hdist(world, n.z!); if (d < bd) { bd = d; best = n; } });
      return best;
    }
    const choose = (n: TNode) => {
      expand(n);
      if (n.d != null) { selected = asSel(n); setSel(selected); onChangeRef.current(makeDate(selected)); }
      V = renorm(recenter(n.z!)); render();
    };

    // initial view: dive to `value` if provided
    if (value) {
      const t: Sel = { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate(), h: value.getHours(), mi: value.getMinutes(), s: value.getSeconds() };
      const p = drillPath(root, t); const leaf = p[p.length - 1];
      if (leaf && leaf.d != null) { selected = asSel(leaf); setSel(selected); }
      if (leaf?.z) V = renorm(recenter(leaf.z));
    }
    render();

    // interaction: click nearest node → dive (expand + Möbius recenter); drag → pan
    const evDisk = (e: PointerEvent): C => {
      const r = canvas.getBoundingClientRect();
      return c((e.clientX - r.left - CC) / RAD, -(e.clientY - r.top - CC) / RAD);
    };
    const solveDrag = (worldPt: C, target: C) => renorm(compose(inv(recenter(target)), recenter(worldPt)));
    let down: C | null = null, moved = 0, grab: C | null = null;
    const onDown = (e: PointerEvent) => { down = evDisk(e); moved = 0; grab = applyIso(inv(V), down); canvas.setPointerCapture?.(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!down) return; const cur = evDisk(e); moved += cabs(sub(cur, down));
      if (moved > 0.012 && cabs(cur) < 0.999) { V = solveDrag(grab!, cur); render(); }
    };
    const onUp = (e: PointerEvent) => {
      const up = evDisk(e);
      if (down && moved < 0.02 && cabs(up) < 1) { const w = applyIso(inv(V), up); const n = nearest(w); if (n) choose(n); }
      down = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    // DEV-only test affordance (tree-shaken out of production builds)
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      (canvas as unknown as { __test?: unknown }).__test = {
        drill: (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => {
          const p = drillPath(root, { y, m, d, h, mi, s });
          const leaf = p[p.length - 1]; if (leaf) choose(leaf);
        },
        pos: (y: number, m: number, d: number, depth?: number) => {
          const p = drillPath(root, { y, m, d });
          const n = depth == null ? p[p.length - 1] : p[Math.min(depth, p.length - 1)];
          const sc = toScreen(applyIso(V, n.z!));
          const r = canvas.getBoundingClientRect();
          return { x: r.left + sc.x, y: r.top + sc.y, len: p.length, kind: n.kind };
        },
      };
    }
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYear, toYear]);

  return (
    <div className={"hdt" + (className ? ` ${className}` : "")}>
      <canvas ref={canvasRef} className="hdt-disk" />
      <div className="hdt-readout">
        {sel ? (
          <>
            <span className="hdt-ts">{fmt(sel)}</span>
            <span className="hdt-wd">{wdNames[weekdayOf(sel.y, sel.m, sel.d)]}</span>
          </>
        ) : (
          <span className="hdt-hint">drag to translate · click to descend a level</span>
        )}
      </div>
    </div>
  );
}
