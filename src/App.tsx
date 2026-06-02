import { useState } from "react";
import { WackyDatePicker } from "./WackyDatePicker";
import { HyperbolicDateTimePicker } from "./HyperbolicDateTimePicker";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/**
 * Demo page — shows the single <WackyDatePicker /> in use and reflects whatever
 * date it emits. This is all a consumer has to write:
 *
 *   const [date, setDate] = useState<Date | null>(null);
 *   <WackyDatePicker value={date} onChange={setDate} />
 */
export function App() {
  const [date, setDate] = useState<Date | null>(null);
  const [moment, setMoment] = useState<Date | null>(null);

  return (
    <main className="demo">
      <h1 className="demo-title">Date Picker</h1>

      <WackyDatePicker value={date} onChange={setDate} />

      <div className="demo-output">
        <span className="demo-output-label">Selected date</span>
        <span className="demo-output-value">{date ? fmt(date) : "—"}</span>
        <code className="demo-output-iso">
          {date ? date.toISOString().slice(0, 10) : "null"}
        </code>
      </div>

      <section className="hdt-section">
        <h2 className="demo-title">Hyperbolic Datetime Picker</h2>
        <p className="hdt-blurb">
          Selection lives in the <strong>Poincaré disk</strong> model of the{" "}
          <strong>Lobachevsky (hyperbolic) plane</strong>. Each click is a{" "}
          <strong>Möbius transformation</strong> — an isometry of{" "}
          <strong>SU(1,1)</strong> — that re-centres the view on the chosen node;
          drag to apply a hyperbolic translation. Because area grows{" "}
          <em>exponentially</em> with radius under constant negative curvature,
          the whole tree (millennium → century → decade → year → month →
          week → weekday → AM/PM → hour → minute → second) fits inside one finite
          disk, with leaves resting near the conformal boundary at infinity.
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
    </main>
  );
}
