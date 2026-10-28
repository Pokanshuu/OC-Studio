import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { NavigationProvider } from "@/components/layout/NavigationContext";
import { WordCountProvider } from "@/components/layout/WordCountContext";
import { EntityNavigateProvider } from "@/components/layout/EntityNavigateContext";
import { NavigationSourceProvider } from "@/components/layout/NavigationSourceContext";
import { SettingsProvider } from "@/lib/settings";
import { ActiveEditorProvider } from "@/lib/editor-context";
import { Providers } from "./providers";
import { SeedData } from "@/components/shared/SeedData";
import { VaultGate } from "@/features/vault";
import { VaultProvider } from "@/lib/vault/vault-provider";
import { OverlayRoot } from "@/components/layout/OverlayRoot";
import { Toaster } from "@/components/shared/toaster";
import { NativeMenuBlocker } from "@/components/shared/NativeMenuBlocker";
import { KeyboardProvider } from "@/lib/KeyboardContext";
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
      <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var s=JSON.parse(localStorage.getItem('oc-studio-settings')||'{}');var t=s.theme||'auto';var d=t==='auto'?window.matchMedia('(prefers-color-scheme:dark)').matches:t==='dark';if(d){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark')}if(window.__TAURI__||window.__TAURI_INTERNALS__){document.documentElement.classList.add('tauri-mica')}}catch(e){}})()`,
            }}
          />
        </head>
        <body className="flex flex-col h-screen overflow-hidden">
        <Providers>
          <VaultProvider>
            <SeedData />
            <KeyboardProvider>
            <SettingsProvider>
              <ActiveEditorProvider>
              <EntityNavigateProvider>
                <WordCountProvider>
                  <NavigationProvider>
                    <NavigationSourceProvider>
                    <VaultGate>
                      <AppShell>
                        {children}
                      </AppShell>
                    </VaultGate>
                    </NavigationSourceProvider>
                  </NavigationProvider>
                </WordCountProvider>
              </EntityNavigateProvider>
              </ActiveEditorProvider>
            </SettingsProvider>
            </KeyboardProvider>
          </VaultProvider>
          {/* Toaster 必须在 VaultGate **外面**：闸门期间（还没绑定文件夹）也要能看见提示 */}
          <Toaster />
          {/* 同理：屏蔽 WebView 自带右键菜单也要在闸门外面，否则闸门里右键会弹出「刷新/另存为」 */}
          <NativeMenuBlocker />
        </Providers>
      <OverlayRoot />
      </body>
    </html>
  );
}
