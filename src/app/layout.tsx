import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AppShell } from "@/components/layout/AppShell";
import { NavigationProvider } from "@/components/layout/NavigationContext";
import { WordCountProvider } from "@/components/layout/WordCountContext";
import { EntityNavigateProvider } from "@/components/layout/EntityNavigateContext";
import { NavigationSourceProvider } from "@/components/layout/NavigationSourceContext";
import { SettingsProvider } from "@/lib/settings";
import { ActiveEditorProvider } from "@/lib/editor-context";
import { Providers } from "./providers";
import { SeedData } from "@/components/shared/SeedData";
import { OverlayRoot } from "@/components/layout/OverlayRoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "OC Studio",
  description: "原创角色与世界观创作工作台",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head />
      <body className="flex flex-col min-h-dvh md:h-screen md:overflow-hidden">
        <Script id="theme-init" src="/theme-init.js" strategy="beforeInteractive" />
        <Providers>
          <SeedData />
          <SettingsProvider>
            <ActiveEditorProvider>
            <EntityNavigateProvider>
              <WordCountProvider>
                <NavigationProvider>
                  <NavigationSourceProvider>
                  <AppShell>
                    {children}
                  </AppShell>
                  </NavigationSourceProvider>
                </NavigationProvider>
              </WordCountProvider>
            </EntityNavigateProvider>
            </ActiveEditorProvider>
          </SettingsProvider>
        </Providers>
      <OverlayRoot />
      </body>
    </html>
  );
}
