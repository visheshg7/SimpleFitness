"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  { ssr: false }
);

export function RouteLoading() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div
      className="route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading your training data"
    >
      <div className="route-loading-mark" aria-hidden="true">
        {!reduced && <DotLottieReact src="/animations/dumbbell.lottie" loop autoplay />}
      </div>
      <div className="skeleton-title" aria-hidden="true" />
      <div className="skeleton-cards" aria-hidden="true">
        <div className="skeleton-card">
          <div className="skeleton-bar w-60" />
          <div className="skeleton-bar tall" />
        </div>
        <div className="skeleton-card">
          <div className="skeleton-bar w-60" />
          <div className="skeleton-bar tall" />
        </div>
        <div className="skeleton-card">
          <div className="skeleton-bar w-60" />
          <div className="skeleton-bar tall" />
        </div>
      </div>
      <div className="skeleton-panel" aria-hidden="true">
        <div className="skeleton-row">
          <div className="skeleton-avatar" />
          <div className="skeleton-row-bars">
            <div className="skeleton-bar w-40" />
            <div className="skeleton-bar w-60" />
          </div>
        </div>
        <div className="skeleton-row">
          <div className="skeleton-avatar" />
          <div className="skeleton-row-bars">
            <div className="skeleton-bar w-40" />
            <div className="skeleton-bar w-60" />
          </div>
        </div>
        <div className="skeleton-progress">
          <div className="skeleton-bar wide" />
        </div>
      </div>
    </div>
  );
}
