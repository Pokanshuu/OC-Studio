import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { NavigationProvider } from "@/components/layout/NavigationContext";
import { WordCountProvider } from "@/components/layout/WordCountContext";
import { EntityNavigateProvider } from "@/components/layout/EntityNavigateContext";
import { NavigationSourceProvider } from "@/components/layout/NavigationSourceContext";
import { SettingsProvider } from "@/lib/settings";
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
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex h-screen flex-col overflow-hidden bg-paper">
        <Providers>
          <SettingsProvider>
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
          </SettingsProvider>
        </Providers>
      </body>
    </html>
  );
}
