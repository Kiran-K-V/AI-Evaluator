"use client";

import { motion } from "framer-motion";

interface EvalProgressBarProps {
  current: number;
  total: number;
}

export function EvalProgressBar({ current, total }: EvalProgressBarProps) {
  const pct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Evaluating case {current} of {total}...
        </span>
        <span className="font-mono font-bold text-orange-500">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full glass-subtle">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
