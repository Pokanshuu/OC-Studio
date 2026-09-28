"use client"

import * as React from "react"
import { Menu } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

const PANEL =
  "z-[99999] min-w-[160px] border border-line bg-paper/85 dark:bg-paper/85 backdrop-blur-lg p-1 shadow-none pointer-events-none"
const ITEM =
  "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] text-ink outline-none transition-colors data-highlighted:bg-[var(--oc-hover)] data-highlighted:text-ink pointer-events-auto"

function DropdownMenu(props: Menu.Root.Props) {
  return <Menu.Root {...props} />
}

function DropdownMenuTrigger({
  className,
  ...props
}: Menu.Trigger.Props) {
  return (
    <Menu.Trigger
      {...props}
      className={cn(
        "inline-flex items-center justify-center px-2 py-1 text-[13px] text-ink-muted transition-colors hover:text-ink data-open:text-ink transparent-text",
        className
      )}
    />
  )
}

function DropdownMenuContent({
  className,
  children,
  ...props
}: Menu.Popup.Props) {
  return (
    <Menu.Portal container={typeof document !== 'undefined' ? document.getElementById('overlay-root') || document.body : undefined}>
      <Menu.Positioner sideOffset={4} align="start" positionMethod="fixed">
        <Menu.Popup className={cn(PANEL, className)} {...props}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

function DropdownMenuItem({
  className,
  ...props
}: Menu.Item.Props) {
  return <Menu.Item className={cn(ITEM, className)} {...props} />
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <Menu.Separator
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("px-3 py-1.5 text-[11px] tracking-[0.14em] text-ink-faint", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-ink-faint", className)}
      {...props}
    />
  )
}

function DropdownMenuRadioGroup(props: Menu.RadioGroup.Props) {
  return <Menu.RadioGroup {...props} />
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: Menu.RadioItem.Props) {
  return (
    <Menu.RadioItem className={cn(ITEM, className)} {...props}>
      {children}
      <Menu.RadioItemIndicator className="absolute left-1 flex h-3.5 w-3.5 items-center justify-center">
        <div className="h-1.5 w-1.5 bg-ink" />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: Menu.CheckboxItem.Props) {
  return (
    <Menu.CheckboxItem className={cn(ITEM, className)} {...props}>
      {children}
      <Menu.CheckboxItemIndicator className="absolute left-1 flex h-3.5 w-3.5 items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2 6 5 9 10 3" />
        </svg>
      </Menu.CheckboxItemIndicator>
    </Menu.CheckboxItem>
  )
}

function DropdownMenuSub({
  children,
  ...props
}: Menu.SubmenuRoot.Props) {
  return <Menu.SubmenuRoot {...props}>{children}</Menu.SubmenuRoot>
}

function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: Menu.SubmenuTrigger.Props) {
  return (
    <Menu.SubmenuTrigger className={cn(ITEM, className)} {...props}>
      {children}
      <svg className="ml-auto h-3 w-3 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </Menu.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  children,
  ...props
}: Menu.Popup.Props) {
  return (
    <Menu.Portal container={typeof document !== 'undefined' ? document.getElementById('overlay-root') || document.body : undefined}>
      <Menu.Positioner sideOffset={4} alignOffset={-4} align="start" positionMethod="fixed">
        <Menu.Popup className={cn(PANEL, className)} {...props}>
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
