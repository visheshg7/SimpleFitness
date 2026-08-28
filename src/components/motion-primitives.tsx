"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export function CountUp({ value, duration = 0.9, format }: { value: number; duration?: number; format?: (value: number) => string }) {
  const reduced = useReducedMotion();
  const formatValue = format ?? ((latest: number) => Math.round(latest).toLocaleString());
  const [display, setDisplay] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    if (reduced) {
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, duration, reduced]);

  return <>{formatValue(reduced ? value : display)}</>;
}

export function SetProgressRing({ completed, total }: { completed: number; total: number }) {
  const reduced = useReducedMotion();
  const size = 34;
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, completed / total) : 0;
  const isComplete = total > 0 && completed >= total;
  return (
    <div className={`set-progress-ring${isComplete ? " complete" : ""}`} role="status" aria-label={`${completed} of ${total || 0} sets completed`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="set-progress-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <motion.circle
          className="set-progress-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - fraction) }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 22 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="set-progress-copy">
        <strong><CountUp value={completed} format={(latest) => String(Math.round(latest))} /></strong>
        <span className="set-progress-rest">/ {total || "–"}</span>
        <small>sets</small>
      </span>
    </div>
  );
}
