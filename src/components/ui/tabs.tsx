"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        // 一条 1px 底线横贯整排（区块之间那种线）；选中项把属于自己的那一段描成墨色。
        "flex items-stretch border-b border-line",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        // 选中 = 2px 墨色下划线，压在 TabsList 那条 1px 底线上（不是浅底胶囊）：
        // 胶囊会把「选中」和「悬停」画成同一个东西；下划线只占线的位置、不占版面，
        // 也不受圆角影响（圆角块的选中态一旦配下划线，线会在拐角处翘起来）。
        // 下划线宽度 = 该 tab 的整列宽（等分时即列宽），左端与列边对齐，方头不收圆角。
        "relative inline-flex items-center justify-center whitespace-nowrap px-3 pb-2 pt-1.5 text-[13px] text-ink-muted transition-colors",
        // 悬停只换文字色：这一排没有「块」，不铺底色（全局 button:hover 会给按钮铺块，这里显式取消）
        "hover:bg-transparent hover:text-ink",
        // 焦点交给下划线：不加方框（方框会被误读成「选中的胶囊」）
        "focus:outline-none focus-visible:outline-none",
        "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-ink after:opacity-0 after:transition-opacity",
        "data-active:text-ink data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("pt-4", className)}
      keepMounted
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
