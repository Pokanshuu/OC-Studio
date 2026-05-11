import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { NavigationProvider } from "@/components/layout/NavigationContext";
import { WordCountProvider } from "@/components/layout/WordCountContext";
import { EntityNavigateProvider } from "@/components/layout/EntityNavigateContext";
import { NavigationSourceProvider } from "@/components/layout/NavigationSourceContext";
import { SettingsProvider } from "@/lib/settings";
import { ActiveEditorProvider } from "@/lib/editor-context";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "OC Studio",
  description: "原创角色与世界观创作工作台",
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
            __html: `
              (function() {
                try {
                  var s = JSON.parse(localStorage.getItem('oc-studio-settings') || '{}');
                  var t = s.theme || 'auto';
                  var d = t === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : t === 'dark';
                  if (d) { document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); }

                  if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
                    document.documentElement.classList.add('tauri-mica');
                  }
                } catch(e) {}
              })()
            `,
          }}
        />
      </head>
      <body className="flex h-screen flex-col overflow-hidden">
        <Providers>
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
      <div id="overlay-root" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999999 }} />
      </body>
    </html>
  );
}
