"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Wrench,
  Brain,
  BookOpen,
  Shield,
  Braces,
  Tags,
  Gauge,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Swords,
} from "lucide-react";
import { cn } from "@/lib/utils";

const moduleLinks = [
  { slug: "tool-calling", label: "Tool Calling", icon: Wrench },
  { slug: "hallucination", label: "Hallucination", icon: Brain },
  { slug: "rag-grounding", label: "RAG Grounding", icon: BookOpen },
  { slug: "safety", label: "Safety & Toxicity", icon: Shield },
  { slug: "structured-output", label: "Structured Output", icon: Braces },
  { slug: "classification", label: "Classification", icon: Tags },
  { slug: "performance", label: "Performance", icon: Gauge },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 264 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      data-tour="sidebar"
      className="fixed left-0 top-0 z-40 flex h-full flex-col glass-strong"
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2.5"
            >
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 shadow-lg shadow-orange-500/25">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-400 bg-clip-text text-lg font-bold tracking-tight text-transparent leading-tight">
                  AI Eval
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
                  Platform
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="mx-auto relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 shadow-lg shadow-orange-500/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 z-50 flex h-6 w-6 items-center justify-center rounded-full glass border border-border/50 text-muted-foreground shadow-md transition-colors hover:text-foreground"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <NavItem href="/" icon={LayoutDashboard} label="Dashboard" active={isActive("/")} collapsed={collapsed} />

        <SectionLabel collapsed={collapsed} label="Evaluate" />
        {moduleLinks.map((m) => (
          <NavItem key={m.slug} href={`/evaluate/${m.slug}`} icon={m.icon} label={m.label} active={isActive(`/evaluate/${m.slug}`)} collapsed={collapsed} />
        ))}

        <SectionLabel collapsed={collapsed} label="Batch" />
        <NavItem href="/run-all" icon={Zap} label="Run All" active={isActive("/run-all")} collapsed={collapsed} accent />
        <NavItem href="/arena" icon={Swords} label="Arena" active={isActive("/arena")} collapsed={collapsed} accent />

        <SectionLabel collapsed={collapsed} label="History" />
        <NavItem href="/results" icon={History} label="Results" active={isActive("/results")} collapsed={collapsed} />
        <NavItem href="/settings" icon={Settings} label="Settings" active={isActive("/settings")} collapsed={collapsed} />
      </nav>
    </motion.aside>
  );
}

function SectionLabel({ collapsed, label }: { collapsed: boolean; label: string }) {
  return (
    <div className="pb-1 pt-4">
      {!collapsed ? (
        <span className="px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
          {label}
        </span>
      ) : (
        <div className="mx-auto h-px w-6 bg-border/50" />
      )}
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  accent,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "text-white"
          : accent
            ? "text-orange-500/80 hover:text-orange-400"
            : "text-muted-foreground hover:text-foreground"
      )}
    >
      {active && (
        <motion.div
          layoutId="activeNav"
          className="absolute inset-0 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/20"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <Icon className={cn("h-4 w-4 shrink-0 relative z-10", active && "text-white")} />
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="relative z-10 whitespace-nowrap"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
