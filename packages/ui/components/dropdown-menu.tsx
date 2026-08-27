"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "../lib/cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-(--z-index-dropdown) min-w-[10rem] overflow-hidden rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-raised) p-1 text-body-sm shadow-(--shadow-md) data-[state=open]:animate-[fadeInScale_150ms_ease-out]",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean; separatorBefore?: boolean }
>(({ className, destructive, separatorBefore, ...props }, ref) => (
  <>
    {separatorBefore && <DropdownMenuPrimitive.Separator className="my-1 h-px bg-(--color-border-subtle)" />}
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "flex h-9 cursor-pointer select-none items-center gap-2 rounded-(--radius-sm) px-2 outline-none transition-colors duration-100",
        "data-[highlighted]:bg-(--color-bg-subtle) data-[disabled]:pointer-events-none data-[disabled]:text-(--color-text-disabled)",
        destructive && "text-(--color-danger) data-[highlighted]:bg-(--color-danger-bg)",
        className
      )}
      {...props}
    />
  </>
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex h-9 cursor-pointer select-none items-center rounded-(--radius-sm) py-1.5 pl-8 pr-2 outline-none data-[highlighted]:bg-(--color-bg-subtle)",
      className
    )}
    {...props}
  >
    <DropdownMenuPrimitive.ItemIndicator className="absolute left-2 flex items-center">
      <Check className="size-4" />
    </DropdownMenuPrimitive.ItemIndicator>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex h-9 cursor-pointer select-none items-center rounded-(--radius-sm) py-1.5 pl-8 pr-2 outline-none data-[highlighted]:bg-(--color-bg-subtle)",
      className
    )}
    {...props}
  >
    <DropdownMenuPrimitive.ItemIndicator className="absolute left-2 flex items-center">
      <Circle className="size-2 fill-current" />
    </DropdownMenuPrimitive.ItemIndicator>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 py-1.5 text-caption font-semibold text-(--color-text-tertiary)", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-(--color-border-subtle)", className)} {...props} />;
}

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex h-9 cursor-pointer select-none items-center rounded-(--radius-sm) px-2 outline-none data-[highlighted]:bg-(--color-bg-subtle)",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto size-4" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-(--z-index-dropdown) min-w-[8rem] overflow-hidden rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-raised) p-1 shadow-(--shadow-md)",
      className
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";
