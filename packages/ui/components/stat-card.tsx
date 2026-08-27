"use client";

import * as React from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../lib/cn";
import { Card } from "./card";
import { Sparkline } from "./sparkline";

export interface StatCardProps {
  label: string;
  value: number;
  /** Formats the animated numeric value, e.g. currency. Defaults to locale number string. */
  format?: (value: number) => string;
  trend?: { direction: "up" | "down"; percent: number };
  sparklineData?: number[];
  className?: string;
}

/** §5.3 / §5.11 — dashboard KPI stat card: label, count-up value, trend, optional sparkline. */
export function StatCard({ label, value, format, trend, sparklineData, className }: StatCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const motionValue = useMotionValue(0);
  // Duration scales with magnitude — larger totals settle slower, per §6.3.
  const stiffness = value > 10000 ? 60 : value > 1000 ? 90 : 140;
  const spring = useSpring(motionValue, { stiffness, damping: 20 });
  const [display, setDisplay] = React.useState("0");
  const rounded = useTransform(spring, (v) => Math.round(v));

  React.useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue]);

  React.useEffect(() => {
    const unsub = rounded.on("change", (v) => {
      setDisplay(format ? format(v) : v.toLocaleString());
    });
    return unsub;
  }, [rounded, format]);

  return (
    <Card ref={ref} className={cn("flex flex-col gap-3", className)}>
      <span className="text-caption font-medium text-(--color-text-secondary)">{label}</span>
      <div className="flex items-end justify-between gap-4">
        <span className="tabular-nums font-(--font-mono) text-money-hero font-semibold text-(--color-text-primary)">
          {display}
        </span>
        {sparklineData && sparklineData.length > 1 && <Sparkline data={sparklineData} />}
      </div>
      {trend && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.2 }}
          className={cn(
            "inline-flex w-fit items-center gap-1 text-caption font-semibold",
            trend.direction === "up" ? "text-(--color-success)" : "text-(--color-danger)"
          )}
        >
          {trend.direction === "up" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {trend.percent}%
        </motion.div>
      )}
    </Card>
  );
}
