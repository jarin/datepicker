import { useState } from "react";
import { SlotMachineYearPicker } from "./SlotMachineYearPicker";
import { WhackAMoleDatePicker } from "./WhackAMoleDatePicker";
import "./WackyDatePicker.css";

export interface WackyDatePickerProps {
  /** Currently selected date (controlled). */
  value: Date | null;
  /** Fired with the chosen Date once year, month, weekday and day are picked. */
  onChange: (date: Date) => void;
  /** Centre of the year distribution. Defaults to the current year. */
  meanYear?: number;
  /** Std-dev of the year distribution, in years. Defaults to 12. */
  sigma?: number;
  /** Optional class on the outer wrapper. */
  className?: string;
}

/**
 * A single, self-contained date picker. Spin the slot machine for a year, then
 * whack the moles for the month, weekday and day. Emits a normal `Date` via
 * `onChange` — drop it in wherever you'd use a date input.
 */
export function WackyDatePicker({
  value,
  onChange,
  meanYear,
  sigma,
  className,
}: WackyDatePickerProps) {
  const [stage, setStage] = useState<"year" | "date">("year");
  const [year, setYear] = useState<number | null>(null);

  return (
    <div className={"wacky" + (className ? ` ${className}` : "")}>
      {stage === "year" ? (
        <SlotMachineYearPicker
          value={year ?? value?.getFullYear() ?? null}
          meanYear={meanYear}
          sigma={sigma}
          onSelect={(y) => {
            setYear(y);
            setStage("date");
          }}
        />
      ) : (
        <WhackAMoleDatePicker
          value={null}
          year={year ?? undefined}
          onChange={onChange}
          onRestart={() => {
            setYear(null);
            setStage("year");
          }}
        />
      )}
    </div>
  );
}
