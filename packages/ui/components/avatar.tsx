"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "../lib/cn";

const sizeClass = { sm: "size-6 text-[10px]", md: "size-8 text-caption", lg: "size-10 text-body-sm" } as const;

export function Avatar({
  className,
  size = "md",
  src,
  alt,
  initials,
}: {
  className?: string;
  size?: keyof typeof sizeClass;
  src?: string;
  alt?: string;
  initials: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-(--radius-full) bg-(--color-primary-100) font-semibold text-(--color-primary-700)",
        sizeClass[size],
        className
      )}
    >
      <AvatarPrimitive.Image src={src} alt={alt} className="size-full object-cover" />
      <AvatarPrimitive.Fallback delayMs={src ? 300 : 0}>{initials}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
