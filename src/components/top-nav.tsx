"use client";

import { Moon, Sun, Settings, HelpCircle } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES } from "@/lib/modules";

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/results") return "Results History";
  if (pathname === "/run-all") return "Run All Modules";
  if (pathname === "/arena") return "Model Arena";
  if (pathname.startsWith("/results/")) return "Result Detail";
  if (pathname.startsWith("/evaluate/")) {
    const slug = pathname.split("/evaluate/")[1];
    const mod = MODULES.find((m) => m.slug === slug);
    return mod ? mod.name : "Evaluation";
  }
  return "Netra AI";
}

export function TopNav() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  const startTour = () => {
    window.dispatchEvent(new CustomEvent("netra:start-tour"));
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between px-6 glass-subtle">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={startTour}
          className="rounded-xl neu-hover gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          data-tour="help-button"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">How it works</span>
        </Button>
        <div data-tour="theme-toggle">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="rounded-xl neu-hover"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        <div data-tour="settings-link">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="rounded-xl neu-hover">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
