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
          Pull lever to win bigly.
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
            disk, with leaves resting near the conformal boundary at infinity, telling us that time is indeed infinite.
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
            Some say time is an extra dimension in space-time. This picker builds on that statement.
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
