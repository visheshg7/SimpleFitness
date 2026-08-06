"use client";

import { MUSCLES, normalizeMuscle } from "@/lib/muscles";

export function MuscleSelect({ value, onChange, className = "select-field", placeholder }: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const display = value === "" ? "" : (normalizeMuscle(value) ?? value);
  const hasCustom = display !== "" && normalizeMuscle(display) === null;
  return (
    <select className={className} value={display} onChange={(event) => onChange(event.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {hasCustom && <option value={display}>{display} (not in list)</option>}
      {MUSCLES.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>
  );
}
