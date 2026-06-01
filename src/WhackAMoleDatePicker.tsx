import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./WhackAMoleDatePicker.css";

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface WhackAMoleDatePickerProps {
  /** Currently selected date (controlled). */
  value: Date | null;
  /** Called once a month, weekday and matching date have all been whacked. */
  onChange: (date: Date) => void;
  /** Year used for the produced Date. Defaults to the current year. */
  year?: number;
  /** If provided, the "Pick again" button calls this instead of just resetting
   *  to the month step (e.g. to go back to the year selector). */
  onRestart?: () => void;
}

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Where the holes sit on the tilted field, in % of the field box. */
const HOLES: { x: number; y: number }[] = [
  { x: 18, y: 20 }, { x: 40, y: 20 }, { x: 60, y: 20 }, { x: 82, y: 20 },
  { x: 14, y: 50 }, { x: 38, y: 50 }, { x: 62, y: 50 }, { x: 86, y: 50 },
  { x: 10, y: 82 }, { x: 37, y: 82 }, { x: 63, y: 82 }, { x: 90, y: 82 },
];

const TICK_MS = 90;     // game-loop resolution
const SPAWN_MS = 700;   // time between waves of moles
const TTL_MIN = 2200;   // how long a mole stays up
const TTL_RANGE = 900;

type Phase = "month" | "weekday" | "day" | "done";

interface Mole {
  id: number;
  hole: number;
  value: number;
  label: string;
  bornAt: number;
  ttl: number;
  status: "up" | "hit";
}

const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

/** Day numbers in the month that fall on the given weekday (0=Sun..6=Sat). */
function matchingDays(year: number, month: number, weekday: number): number[] {
  const out: number[] = [];
  const n = daysInMonth(year, month);
  for (let d = 1; d <= n; d++) {
    if (new Date(year, month, d).getDay() === weekday) out.push(d);
  }
  return out;
}

const randInt = (n: number) => Math.floor(Math.random() * n);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function WhackAMoleDatePicker({
  value,
  onChange,
  year = new Date().getFullYear(),
  onRestart,
}: WhackAMoleDatePickerProps) {
  const [phase, setPhase] = useState<Phase>(value ? "done" : "month");
  const [month, setMonth] = useState<number | null>(
    value ? value.getMonth() : null,
  );
  const [weekday, setWeekday] = useState<number | null>(
    value ? value.getDay() : null,
  );
  const [day, setDay] = useState<number | null>(value ? value.getDate() : null);
  const [moles, setMoles] = useState<Mole[]>([]);

  const idRef = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const hammerRef = useRef<HTMLDivElement>(null);
  const swingTimer = useRef<number>();

  const playing = phase !== "done";

  /* The pool of values whackable in the current phase. */
  const pool = useMemo<number[]>(() => {
    if (phase === "month") return Array.from({ length: 12 }, (_, i) => i);
    if (phase === "weekday") return Array.from({ length: 7 }, (_, i) => i);
    if (phase === "day" && month != null && weekday != null) {
      return matchingDays(year, month, weekday);
    }
    return [];
  }, [phase, month, weekday, year]);

  const labelFor = useCallback(
    (v: number) =>
      phase === "month"
        ? MONTHS_SHORT[v]
        : phase === "weekday"
          ? WEEKDAYS_SHORT[v]
          : String(v),
    [phase],
  );

  /* ---- the spawning loop (runs only while picking) --------------- */
  useEffect(() => {
    if (!playing || pool.length === 0) return;

    setMoles([]);
    let last = 0;
    let timer = 0;

    const spawnWave = (prev: Mole[], now: number): Mole[] => {
      const occupied = new Set(prev.map((m) => m.hole));
      const free = HOLES.map((_, i) => i).filter((h) => !occupied.has(h));
      for (let i = free.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [free[i], free[j]] = [free[j], free[i]];
      }
      const used = new Set(prev.map((m) => m.value));
      const want = Math.min(free.length, 3 + randInt(2)); // 3-4 moles
      const slots = Math.min(want, Math.max(1, pool.length - used.size));
      const fresh: Mole[] = [];

      for (let i = 0; i < slots; i++) {
        let v: number;
        let guard = 0;
        do {
          v = pool[randInt(pool.length)];
          guard++;
        } while (used.has(v) && guard < 60);
        used.add(v);
        fresh.push({
          id: idRef.current++,
          hole: free[i],
          value: v,
          label: labelFor(v),
          bornAt: now,
          ttl: TTL_MIN + Math.random() * TTL_RANGE,
          status: "up",
        });
      }
      return [...prev, ...fresh];
    };

    const loop = () => {
      const now = performance.now();
      setMoles((prev) =>
        prev.filter((m) => m.status === "up" && now - m.bornAt < m.ttl),
      );
      if (now - last >= SPAWN_MS) {
        last = now;
        setMoles((prev) => spawnWave(prev, now));
      }
      timer = window.setTimeout(loop, TICK_MS);
    };

    timer = window.setTimeout(loop, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [playing, pool, labelFor]);

  /* ---- hammer feedback ------------------------------------------- */
  const swing = useCallback(() => {
    const el = hammerRef.current;
    if (!el) return;
    el.classList.remove("swing");
    void el.offsetWidth; // restart the animation
    el.classList.add("swing");
    window.clearTimeout(swingTimer.current);
    swingTimer.current = window.setTimeout(
      () => el.classList.remove("swing"),
      240,
    );
  }, []);

  const moveHammer = useCallback((e: React.PointerEvent) => {
    const el = hammerRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return;
    const r = stage.getBoundingClientRect();
    // getBoundingClientRect is in visual px, but the hammer's transform px live
    // in the (possibly zoomed) local space, so divide by the effective scale.
    const scale = r.width / stage.clientWidth || 1;
    el.style.transform = `translate(${(e.clientX - r.left) / scale}px, ${
      (e.clientY - r.top) / scale
    }px)`;
  }, []);

  /* ---- whacking advances through the phases ---------------------- */
  const whack = useCallback(
    (mole: Mole, e: React.PointerEvent) => {
      e.stopPropagation();
      if (mole.status !== "up") return;
      swing();
      setMoles((prev) =>
        prev.map((m) => (m.id === mole.id ? { ...m, status: "hit" } : m)),
      );
      const picked = mole.value;

      if (phase === "month") {
        setMonth(picked);
        window.setTimeout(() => setPhase("weekday"), 300);
      } else if (phase === "weekday") {
        setWeekday(picked);
        window.setTimeout(() => setPhase("day"), 300);
      } else if (phase === "day") {
        setDay(picked);
        window.setTimeout(() => {
          setPhase("done");
          onChange(new Date(year, month ?? 0, picked));
        }, 220);
      }
    },
    [month, onChange, phase, swing, year],
  );

  /* ---- navigation ------------------------------------------------ */
  const goto = useCallback((p: Phase) => {
    setMoles([]);
    if (p === "month") {
      setMonth(null);
      setWeekday(null);
      setDay(null);
    } else if (p === "weekday") {
      setWeekday(null);
      setDay(null);
    } else if (p === "day") {
      setDay(null);
    }
    setPhase(p);
  }, []);

  /* ---- derived display ------------------------------------------- */
  const builtDate = useMemo(
    () =>
      phase === "done" && month != null && day != null
        ? new Date(year, month, day)
        : value,
    [phase, month, day, value, year],
  );

  return (
    <div className="wmdp">
      {/* The 3D arena ---------------------------------------------- */}
      <div
        ref={stageRef}
        className="wmdp-stage"
        onPointerMove={moveHammer}
        onPointerDown={playing ? swing : undefined}
      >
        <div className="wmdp-sky" />
        <div className="wmdp-field">
          {HOLES.map((pos, i) => {
              const mole = moles.find((m) => m.hole === i);
              return (
                <div
                  key={i}
                  className="wmdp-hole"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className="wmdp-mouth" />
                  {mole && (
                    <button
                      type="button"
                      className={`wmdp-mole ${mole.status}`}
                      onPointerDown={(e) => whack(mole, e)}
                      aria-label={`Pick ${mole.label}`}
                    >
                      <span className="wmdp-mole-ears" />
                      <span className="wmdp-mole-face">
                        <span className="wmdp-mole-eyes" />
                        <span className="wmdp-mole-snout" />
                      </span>
                      <span className="wmdp-mole-sign">{mole.label}</span>
                    </button>
                  )}
                  <div className="wmdp-mouth-front" />
                </div>
              );
            })}
        </div>

        {/* Hammer cursor */}
        {playing && (
          <div ref={hammerRef} className="wmdp-hammer">
            🔨
          </div>
        )}

        {/* Result overlay */}
        {phase === "done" && builtDate && (
          <div className="wmdp-overlay">
            <h2>Date set</h2>
            <p className="wmdp-result">
              {builtDate.toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <button
              className="wmdp-btn"
              onClick={onRestart ?? (() => goto("month"))}
            >
              Pick again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
