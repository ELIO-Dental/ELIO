"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { listStaggerContainer, listStaggerItem } from "../tokens/motion";
import { cn } from "../lib/cn";

/**
 * THEME_GUIDELINE.md §6.3 — reusable stagger wrapper for tables/lists/cards
 * (payslip rows, pipeline cards, launcher tiles, search results). Server
 * Components can render their data inside this and still get the entrance
 * animation, since only this leaf wrapper needs to be a Client Component.
 */
export function StaggerList({ children, className, as: Tag = "ul" }: { children: React.ReactNode; className?: string; as?: "ul" | "div" }) {
  const MotionTag = motion[Tag];
  return (
    <MotionTag className={cn(className)} variants={listStaggerContainer} initial="initial" animate="animate">
      {children}
    </MotionTag>
  );
}

export function StaggerItem({ children, className, as: Tag = "li" }: { children: React.ReactNode; className?: string; as?: "li" | "div" }) {
  const MotionTag = motion[Tag];
  return (
    <MotionTag className={cn(className)} variants={listStaggerItem}>
      {children}
    </MotionTag>
  );
}
