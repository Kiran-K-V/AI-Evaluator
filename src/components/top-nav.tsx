"use client";

import { Moon, Sun, Settings } from "lucide-react";
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
  return "AI Eval Platform";
}

export function TopNav() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between px-6 glass-subtle">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-xl neu-hover"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="rounded-xl neu-hover">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
