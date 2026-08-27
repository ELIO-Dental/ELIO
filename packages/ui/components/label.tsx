"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "../lib/cn";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { focused?: boolean }
>(({ className, focused, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "mb-1 block text-caption font-semibold text-(--color-text-secondary) transition-colors duration-150",
      focused && "text-(--color-primary-600)",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";
