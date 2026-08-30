"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  success?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, success, disabled, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          <input
            ref={ref}
            disabled={disabled}
            className={cn(
              "h-10 w-full rounded-(--radius-md) border bg-(--color-surface) px-3 text-body text-(--color-text-primary) shadow-(--shadow-xs) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--color-text-tertiary)",
              "border-(--color-border) focus:border-(--color-primary-600) focus:shadow-(--shadow-glow-primary)",
              error && "border-(--color-danger) animate-[shakeX_400ms_ease-in-out_1]",
              success && "border-(--color-success) pr-9",
              disabled && "cursor-not-allowed bg-(--color-bg-subtle) text-(--color-text-disabled)",
              className
            )}
            {...props}
          />
          {success && !error && (
            <Check
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-(--color-success) transition-opacity duration-150"
              aria-hidden
            />
          )}
        </div>
        {error && <p className="mt-1 text-caption text-(--color-danger)">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
