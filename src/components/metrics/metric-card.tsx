"use client";

import { motion } from "framer-motion";
import { AnimatedCounter } from "./animated-counter";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number;
  unit?: string;
  status?: "pass" | "fail" | "warning" | "neutral";
  delay?: number;
  decimals?: number;
}

const statusRing = {
  pass: "ring-emerald-500/30 shadow-emerald-500/10",
  fail: "ring-red-500/30 shadow-red-500/10",
  warning: "ring-amber-500/30 shadow-amber-500/10",
  neutral: "ring-border/30",
};

const statusText = {
  pass: "text-emerald-400",
  fail: "text-red-400",
  warning: "text-amber-400",
  neutral: "text-foreground",
};

export function MetricCard({ label, value, unit = "", status = "neutral", delay = 0, decimals = 1 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay }}
    >
      <div className={cn("glass rounded-2xl p-4 ring-1 transition-all", statusRing[status])}>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <div className="mt-2 flex items-baseline gap-1">
          <AnimatedCounter
            value={value}
            decimals={decimals}
            className={cn("text-3xl font-bold tracking-tight", statusText[status])}
          />
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
      </div>
    </motion.div>
  );
}
