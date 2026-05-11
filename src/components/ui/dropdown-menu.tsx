"use client"

import * as React from "react"
import { Menu } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

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
        "inline-flex items-center justify-center rounded px-3 py-1 text-sm text-ink-muted transition-colors hover:text-ink data-open:text-ink transparent-text",
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
    <Menu.Portal>
      <Menu.Positioner sideOffset={4} align="start" positionMethod="fixed">
        <Menu.Popup
          className={cn(
            "z-[99999] min-w-[160px] rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5 pointer-events-none",
            className
          )}
          {...props}
        >
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
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-ink outline-none transition-colors data-highlighted:bg-black/5 dark:data-highlighted:bg-white/5 data-highlighted:text-ink disabled:pointer-events-none disabled:text-ink-faint pointer-events-auto",
        className
      )}
      {...props}
    />
  )
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
      className={cn("px-3 py-1.5 text-xs font-medium text-ink-faint", className)}
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
    <Menu.RadioItem
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-ink outline-none transition-colors data-highlighted:bg-black/5 dark:data-highlighted:bg-white/5 data-highlighted:text-ink pointer-events-auto",
        className
      )}
      {...props}
    >
      {children}
      <Menu.RadioItemIndicator className="absolute left-1 flex h-3.5 w-3.5 items-center justify-center">
        <div className="h-1.5 w-1.5 rounded-full bg-ink" />
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
    <Menu.CheckboxItem
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-ink outline-none transition-colors data-highlighted:bg-black/5 dark:data-highlighted:bg-white/5 data-highlighted:text-ink pointer-events-auto",
        className
      )}
      {...props}
    >
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
    <Menu.SubmenuTrigger
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-ink outline-none transition-colors data-highlighted:bg-black/5 dark:data-highlighted:bg-white/5 data-highlighted:text-ink pointer-events-auto",
        className
      )}
      {...props}
    >
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
    <Menu.Portal>
      <Menu.Positioner sideOffset={4} alignOffset={-4} align="start" positionMethod="fixed">
        <Menu.Popup
          className={cn(
            "z-[99999] min-w-[160px] rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5 pointer-events-none",
            className
          )}
          {...props}
        >
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
