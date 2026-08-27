"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/cn";
import { easing } from "../tokens/motion";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[--radius-md] text-body font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--color-primary-500]",
  {
    variants: {
      variant: {
        primary:
          "bg-[--color-primary-500] text-white hover:bg-[--color-primary-600] hover:shadow-[--shadow-glow-primary] active:bg-[--color-primary-700] active:scale-[0.98] disabled:bg-[--color-primary-200] disabled:text-[--color-text-disabled]",
        secondary:
          "bg-[--color-surface] text-[--color-text-primary] border border-[--color-border] hover:bg-[--color-bg-subtle] active:border-[--color-text-tertiary] disabled:opacity-50",
        outline:
          "bg-transparent text-[--color-primary-600] border border-[--color-primary-300] hover:bg-[--color-primary-50] active:bg-[--color-primary-100] disabled:opacity-50",
        ghost:
          "bg-transparent text-[--color-text-primary] hover:bg-[--color-bg-subtle] active:bg-[--color-border-subtle] disabled:opacity-40",
        destructive:
          "bg-[--color-danger] text-white hover:brightness-[0.92] active:brightness-[0.85] disabled:opacity-50",
        link: "bg-transparent text-[--color-primary-600] underline-offset-4 hover:underline active:text-[--color-primary-700] disabled:opacity-50 p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-body-sm",
        md: "h-10 px-4 text-body",
        lg: "h-12 px-6 text-body-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Opt-in "magnetic" cursor-follow effect — marketing/hero CTAs ONLY, never dense in-app UI. */
  magnetic?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, magnetic = false, children, disabled, ...props },
    ref
  ) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const springX = useSpring(x, easing.springSnappy);
    const springY = useSpring(y, easing.springSnappy);

    const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!magnetic) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      x.set(Math.max(-6, Math.min(6, relX * 0.15)));
      y.set(Math.max(-6, Math.min(6, relY * 0.15)));
    };
    const handlePointerLeave = () => {
      x.set(0);
      y.set(0);
    };

    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <motion.button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01 }}
        transition={easing.spring}
        style={magnetic ? { x: springX, y: springY } : undefined}
        onPointerMove={magnetic ? handlePointerMove : undefined}
        onPointerLeave={magnetic ? handlePointerLeave : undefined}
        {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
      >
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.span
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center justify-center"
            >
              <Loader2 className="size-4 animate-spin" aria-label="Loading" />
            </motion.span>
          ) : (
            <motion.span
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-2"
            >
              {children}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
