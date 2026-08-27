"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, disabled, ...props }, ref) => (
    <div className="w-full">
      <textarea
        ref={ref}
        disabled={disabled}
        className={cn(
          "min-h-24 w-full rounded-[--radius-md] border bg-[--color-surface] px-3 py-2 text-body text-[--color-text-primary] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[--color-text-tertiary]",
          "border-[--color-border] focus:border-[--color-primary-500] focus:shadow-[--shadow-glow-primary]",
          error && "border-[--color-danger] animate-[shakeX_400ms_ease-in-out_1]",
          disabled && "cursor-not-allowed bg-[--color-bg-subtle] text-[--color-text-disabled]",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-caption text-[--color-danger]">{error}</p>}
    </div>
  )
);
Textarea.displayName = "Textarea";
