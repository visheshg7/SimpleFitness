"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  BodyViewStyle,
  ColorInterpolation,
  HeatmapColorScale,
  MuscleHighlight,
  buildBodySvg,
  toCss,
  type BodyGender,
  type Muscle,
} from "@/lib/musclemap";
import type { MuscleHeatmap as MuscleHeatmapData } from "@/lib/muscle-heatmap";

const NEUTRAL_FILL = "#2A2C31";
const HEAD_FILL = "#37393F";
const HAIR_FILL = "#1B1C20";
const STROKE_COLOR = "#55585F";

const heatScale = new HeatmapColorScale(
  ["#7A3023", "#E8402C", "#F5C24C"],
  ColorInterpolation.easeInOut
);

const darkStyle = new BodyViewStyle({
  defaultFillColor: NEUTRAL_FILL,
  strokeColor: STROKE_COLOR,
  strokeWidth: 0.8,
  headColor: HEAD_FILL,
  hairColor: HAIR_FILL,
});

const EMPTY_SELECTION: ReadonlySet<Muscle> = new Set();

function heatColor(intensity: number): string {
  return toCss(heatScale.colorFor(intensity));
}

export function MuscleHeatmap({ bodyGender, heatmap }: { bodyGender: "male" | "female"; heatmap: MuscleHeatmapData }) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  const highlights = useMemo(
    () =>
      heatmap.regions.reduce<Partial<Record<Muscle, MuscleHighlight>>>((result, { region, intensity }) => {
        if (intensity > 0) result[region] = new MuscleHighlight(region, heatColor(intensity));
        return result;
      }, {}),
    [heatmap]
  );

  useEffect(() => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) return;

    const gender: BodyGender = bodyGender;
    const buildMap = (side: "front" | "back") => {
      const svg = buildBodySvg({ gender, side, highlights, style: darkStyle, selected: EMPTY_SELECTION, hideSubGroups: true });
      svg.style.width = "100%";
      svg.style.height = "auto";
      svg.setAttribute("aria-label", `${side === "front" ? "Front" : "Back"} body heatmap`);
      return svg;
    };

    front.replaceChildren(buildMap("front"));
    back.replaceChildren(buildMap("back"));

    return () => {
      front.replaceChildren();
      back.replaceChildren();
    };
  }, [bodyGender, highlights]);

  return (
    <div className="muscle-heatmap">
      <div className="muscle-heatmap-frames">
        <figure className="muscle-heatmap-frame">
          <figcaption>Front</figcaption>
          <div className="muscle-heatmap-svg" ref={frontRef} />
        </figure>
        <figure className="muscle-heatmap-frame">
          <figcaption>Back</figcaption>
          <div className="muscle-heatmap-svg" ref={backRef} />
        </figure>
      </div>
      {heatmap.legend.length ? (
        <ul className="muscle-heatmap-legend">
          {heatmap.legend.map((row) => (
            <li className="muscle-heatmap-legend-row" key={row.muscle}>
              <span className="muscle-heatmap-swatch" style={{ background: heatColor(row.intensity) }} aria-hidden="true" />
              <strong>{row.muscle}</strong>
              <small>{row.count} {row.count === 1 ? "set" : "sets"}</small>
            </li>
          ))}
        </ul>
      ) : (
        <div className="progress-empty">Complete a set to start seeing where your training attention goes.</div>
      )}
    </div>
  );
}
