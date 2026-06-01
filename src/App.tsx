import { useState } from "react";
import { WackyDatePicker } from "./WackyDatePicker";

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

  return (
    <main className="demo">
      <h1 className="demo-title">Wacky Date Picker</h1>

      <WackyDatePicker value={date} onChange={setDate} />

      <div className="demo-output">
        <span className="demo-output-label">Selected date</span>
        <span className="demo-output-value">{date ? fmt(date) : "—"}</span>
        <code className="demo-output-iso">
          {date ? date.toISOString().slice(0, 10) : "null"}
        </code>
      </div>
    </main>
  );
}
