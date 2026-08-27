"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  /** Mid-request state — thumb shows a spinner, track stays interactive-looking (§5.13). */
  pending?: boolean;
}

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, pending, disabled, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      disabled={disabled}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-[--radius-full] border border-[--color-border] bg-[--color-bg-subtle] outline-none transition-colors duration-150",
        "data-[state=checked]:border-[--color-primary-500] data-[state=checked]:bg-[--color-primary-500]",
        "focus-visible:ring-2 focus-visible:ring-[--color-primary-500] focus-visible:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "flex size-5 translate-x-0.5 items-center justify-center rounded-full bg-white shadow-[--shadow-sm] transition-transform duration-150 ease-out will-change-transform",
          "data-[state=checked]:translate-x-[22px]"
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {pending && <Loader2 className="size-3 animate-spin text-[--color-text-tertiary]" />}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
);
Switch.displayName = "Switch";
