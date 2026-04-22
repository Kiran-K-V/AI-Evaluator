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
  FlaskConical,
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
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <FlaskConical className="h-4 w-4 text-white" />
              </div>
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                AI Eval
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
            <FlaskConical className="h-4 w-4 text-white" />
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
            ? "text-violet-400/80 hover:text-violet-300"
            : "text-muted-foreground hover:text-foreground"
      )}
    >
      {active && (
        <motion.div
          layoutId="activeNav"
          className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-500/20"
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
