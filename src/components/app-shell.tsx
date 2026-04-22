"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { ThemeProvider } from "./theme-provider";
import { PageTransition } from "./page-transition";
import { OnboardingTour } from "./onboarding-tour";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="bg-orb" style={{ width: 600, height: 600, top: -200, right: -100, background: "oklch(0.6 0.25 270 / 20%)" }} />
        <div className="bg-orb" style={{ width: 500, height: 500, bottom: -150, left: -100, background: "oklch(0.6 0.2 330 / 15%)" }} />
        <div className="bg-orb" style={{ width: 400, height: 400, top: "40%", left: "30%", background: "oklch(0.65 0.18 200 / 10%)" }} />

        <div className="relative z-10 flex min-h-screen">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((prev) => !prev)}
          />
          <div
            className="flex flex-1 flex-col transition-all duration-300"
            style={{ marginLeft: sidebarCollapsed ? 68 : 264 }}
          >
            <TopNav />
            <main className="flex-1 p-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </div>
        <OnboardingTour />
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
