import { useState } from "react";
import { WackyDatePicker } from "./WackyDatePicker";
import { HyperbolicDateTimePicker } from "./HyperbolicDateTimePicker";
import { TesseractDateTimePicker } from "./TesseractDateTimePicker";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const TABS = ["Stochastic", "Hyperbolic", "Dimensional"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>("Stochastic");
  const [date, setDate] = useState<Date | null>(null);
  const [moment, setMoment] = useState<Date | null>(null);
  const [tessMoment, setTessMoment] = useState<Date | null>(null);

  return (
    <main className="demo">
      <h1 className="demo-title">Date Picker</h1>

      <nav className="demo-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={"demo-tab" + (t === tab ? " demo-tab--active" : "")}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Stochastic" && (
        <section className="demo-panel">
          <p className="hdt-blurb">
            Whack-a-mole meets date selection. Digits appear at random positions
            and you click to lock them in. Chaos is the only calendar you need.
          </p>
          <WackyDatePicker value={date} onChange={setDate} />
          <div className="demo-output">
            <span className="demo-output-label">Selected date</span>
            <span className="demo-output-value">{date ? fmt(date) : "—"}</span>
            <code className="demo-output-iso">
              {date ? date.toISOString().slice(0, 10) : "null"}
            </code>
          </div>
        </section>
      )}

      {tab === "Hyperbolic" && (
        <section className="demo-panel">
          <p className="hdt-blurb">
            Selection lives in the Poincaré disk model of the{" "}
            Lobachevsky plane. Each click is a{" "}
            Möbius transformation — an isometry of{" "}
            <strong>SU(1,1)</strong> — that re-centres the view on the chosen node;
            drag to apply a hyperbolic translation. Because area grows{" "}
            <em>exponentially</em> with radius under constant negative curvature,
            the whole fits inside one finite
            disk, with leaves resting near the conformal boundary at infinity, telling us that time is indeed finite.
            Or not.
          </p>
          <HyperbolicDateTimePicker value={moment} onChange={setMoment} />
          <div className="demo-output">
            <span className="demo-output-label">Selected datetime</span>
            <span className="demo-output-value">
              {moment ? moment.toLocaleString() : "—"}
            </span>
            <code className="demo-output-iso">
              {moment ? moment.toISOString() : "null"}
            </code>
          </div>
        </section>
      )}

      {tab === "Dimensional" && (
        <section className="demo-panel">
          <p className="hdt-blurb">
            A tesseract — the 4D hypercube — has 16 vertices, 32 edges, and 8 cubic
            cells. Each spatial axis maps to a temporal dimension: <strong>X → Year</strong>,{" "}
            <strong>Y → Month</strong>, <strong>Z → Day</strong>, <strong>W → Time</strong>.
            A double perspective projection (4D → 3D → 2D) renders the wireframe; drag to
            tumble in 3D, shift+drag to rotate through the fourth dimension. Click an axis
            to select it, then scroll or drag to adjust the value.
          </p>
          <TesseractDateTimePicker value={tessMoment} onChange={setTessMoment} />
          <div className="demo-output">
            <span className="demo-output-label">Selected datetime</span>
            <span className="demo-output-value">
              {tessMoment ? tessMoment.toLocaleString() : "—"}
            </span>
            <code className="demo-output-iso">
              {tessMoment ? tessMoment.toISOString() : "null"}
            </code>
          </div>
        </section>
      )}
    </main>
  );
}
