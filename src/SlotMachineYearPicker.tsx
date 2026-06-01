import { useCallback, useEffect, useRef, useState } from "react";
import "./SlotMachineYearPicker.css";

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface SlotMachineYearPickerProps {
  /** Currently selected year (controlled). */
  value: number | null;
  /** Clicking "Select" commits the year shown on the reels (and moves on). */
  onSelect: (year: number) => void;
  /** Centre of the distribution. Defaults to the current year. */
  meanYear?: number;
  /** Standard deviation, in years. Defaults to 12. */
  sigma?: number;
}

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

const REELS = 4; // a 4-digit year
const CELL = 76; // px height of one digit
const STRIP_LEN = 200; // digits rendered per reel (0-9 repeated)
const STRIP = Array.from({ length: STRIP_LEN }, (_, i) => i % 10);

const MAX_ANGLE = 74; // lever fully pulled
const TRIGGER_ANGLE = 54; // pull past this to fire the spin
const SENSITIVITY = 0.55; // degrees of lever travel per px dragged
const CONFIRM_MS = 850; // how long the ✓ shows before handing off to the moles

/** Standard normal via Box-Muller. */
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Draw a year from a Gaussian centred on `meanYear`. A symmetric normal is the
 * natural fit for "clustered around now" — a log/skewed distribution would bias
 * one direction in time, which we don't want. Clamped to ±3.5σ.
 */
function sampleYear(meanYear: number, sigma: number): number {
  const y = Math.round(meanYear + sigma * gaussian());
  const lo = Math.round(meanYear - 3.5 * sigma);
  const hi = Math.round(meanYear + 3.5 * sigma);
  return Math.min(hi, Math.max(lo, y));
}

const digitsOf = (year: number): number[] =>
  String(Math.max(0, year)).padStart(REELS, "0").slice(-REELS).split("").map(Number);

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function SlotMachineYearPicker({
  value,
  onSelect,
  meanYear = new Date().getFullYear(),
  sigma = 12,
}: SlotMachineYearPickerProps) {
  const [spinning, setSpinning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [displayYear, setDisplayYear] = useState<number>(value ?? meanYear);
  const busy = spinning || confirmed;

  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const idxRef = useRef<number[]>([]); // payline index currently shown per reel
  const leverRef = useRef<HTMLDivElement>(null);
  const finishTimer = useRef<number>();
  const confirmTimer = useRef<number>();

  /** Place a reel so `payline` index sits on the centre row, no animation. */
  const place = (el: HTMLDivElement, payline: number) => {
    el.style.transition = "none";
    el.style.transform = `translateY(${-(payline - 1) * CELL}px)`;
  };

  /* Initial positions show the seed year (value or the distribution centre). */
  useEffect(() => {
    const d = digitsOf(value ?? meanYear);
    stripRefs.current.forEach((el, i) => {
      if (!el) return;
      const payline = 10 + d[i];
      idxRef.current[i] = payline;
      place(el, payline);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = useCallback(() => {
    if (busy) return;
    setSpinning(true);

    const sampled = sampleYear(meanYear, sigma);
    const digits = digitsOf(sampled);
    let lastDur = 0;

    stripRefs.current.forEach((el, i) => {
      if (!el) return;
      const base = idxRef.current[i] ?? 10;
      const loops = 6 + i * 2; // later reels travel further → staggered stop
      let target = base + loops * 10;
      target += ((digits[i] - (target % 10)) + 10) % 10; // land on the digit
      idxRef.current[i] = target;

      const dur = 1.5 + i * 0.45;
      lastDur = dur;
      el.style.transition = `transform ${dur}s cubic-bezier(0.16, 0.74, 0.16, 1)`;
      el.style.transform = `translateY(${-(target - 1) * CELL}px)`;

      // when the reel stops, snap to an equivalent low index (same digit) so
      // the next spin always has room to travel downward
      const onEnd = () => {
        const small = 10 + (target % 10);
        place(el, small);
        idxRef.current[i] = small;
        void el.offsetHeight;
      };
      el.addEventListener("transitionend", onEnd, { once: true });
    });

    window.clearTimeout(finishTimer.current);
    finishTimer.current = window.setTimeout(() => {
      setSpinning(false);
      setDisplayYear(sampled);
    }, lastDur * 1000 + 130);
  }, [busy, meanYear, sigma]);

  /** Clicking the year commits it: flash a ✓, then hand off to the moles. */
  const selectYear = () => {
    if (busy) return;
    setConfirmed(true);
    confirmTimer.current = window.setTimeout(
      () => onSelect(displayYear),
      CONFIRM_MS,
    );
  };

  useEffect(
    () => () => {
      window.clearTimeout(finishTimer.current);
      window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  /* ---- the lever must be dragged down by hand to spin ------------ */
  const setLever = (deg: number, animated: boolean) => {
    const el = leverRef.current;
    if (!el) return;
    el.style.transition = animated
      ? "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
      : "none";
    el.style.transform = `rotate(${deg}deg)`;
  };

  // Drag uses window-level listeners (not pointer capture / element move
  // handlers): once the cursor leaves the small lever, element-level moves
  // stop arriving, so the spin would never fire. window listeners always do.
  const onLeverDown = useCallback(
    (e: React.PointerEvent) => {
      if (busy) return;
      e.preventDefault();
      const startY = e.clientY;
      let fired = false;

      const move = (ev: PointerEvent) => {
        const angle = Math.max(
          0,
          Math.min(MAX_ANGLE, (ev.clientY - startY) * SENSITIVITY),
        );
        setLever(angle, false);
        if (!fired && angle >= TRIGGER_ANGLE) {
          fired = true;
          cleanup();
          setLever(MAX_ANGLE, false); // bottom out
          requestAnimationFrame(() => setLever(0, true)); // spring back
          spin();
        }
      };
      const up = () => {
        if (!fired) setLever(0, true); // released early → nothing happens
        cleanup();
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [busy, spin],
  );

  const onLeverKey = (e: React.KeyboardEvent) => {
    if (busy || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    setLever(MAX_ANGLE, false);
    requestAnimationFrame(() => setLever(0, true));
    spin();
  };

  return (
    <div className="slot">
      <div className="slot-cabinet">
        <div className="slot-window" data-spinning={spinning}>
          <div className="slot-payline" />
          <div
            className={"slot-reels" + (busy ? " busy" : "")}
            role="button"
            tabIndex={0}
            aria-label={`Select ${displayYear}`}
            onClick={selectYear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectYear();
              }
            }}
          >
            {Array.from({ length: REELS }, (_, i) => (
              <div className="slot-reel" key={i}>
                <div
                  className="slot-strip"
                  ref={(el) => {
                    stripRefs.current[i] = el;
                  }}
                >
                  {STRIP.map((digit, j) => (
                    <div className="slot-cell" key={j}>
                      {digit}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            ref={leverRef}
            className={"slot-lever" + (busy ? " disabled" : "")}
            role="button"
            tabIndex={0}
            aria-label="Pull the lever down to spin"
            onPointerDown={onLeverDown}
            onKeyDown={onLeverKey}
          >
            <div className="slot-lever-rod" />
            <div className="slot-lever-knob" />
          </div>
        </div>

        <div className="slot-confirm" aria-hidden={!confirmed}>
          {confirmed && <div className="slot-check">✓</div>}
        </div>
      </div>
    </div>
  );
}
