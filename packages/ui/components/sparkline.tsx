"use client";

import * as React from "react";
import { motion, useInView } from "framer-motion";
import { duration } from "../tokens/motion";

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/** Thin animated trend line — §5.11. No axis/gridlines, draws in via stroke-dashoffset on mount. */
export function Sparkline({ data, width = 96, height = 32, color = "var(--color-primary-500)", className }: SparklineProps) {
  const ref = React.useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });

  const path = React.useMemo(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    return data
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [data, width, height]);

  return (
    <svg ref={ref} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
        transition={{ duration: duration.slower / 1000, ease: "easeOut" }}
      />
    </svg>
  );
}
