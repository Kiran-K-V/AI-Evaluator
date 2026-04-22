"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface PassFailBadgeProps {
  passed: boolean | null;
  size?: "sm" | "md" | "lg";
}

export function PassFailBadge({ passed, size = "sm" }: PassFailBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-2.5 py-1 gap-1",
    md: "text-sm px-3 py-1.5 gap-1.5",
    lg: "text-sm px-4 py-2 gap-2",
  };

  const iconSize = { sm: "h-3 w-3", md: "h-3.5 w-3.5", lg: "h-4 w-4" };

  if (passed === null) {
    return (
      <span className={cn("inline-flex items-center rounded-xl font-semibold glass-subtle ring-1 ring-amber-500/30 text-amber-400", sizeClasses[size])}>
        <AlertTriangle className={iconSize[size]} /> Warning
      </span>
    );
  }

  return passed ? (
    <span className={cn("inline-flex items-center rounded-xl font-semibold glass-subtle ring-1 ring-emerald-500/30 text-emerald-400", sizeClasses[size])}>
      <CheckCircle2 className={iconSize[size]} /> Pass
    </span>
  ) : (
    <span className={cn("inline-flex items-center rounded-xl font-semibold glass-subtle ring-1 ring-red-500/30 text-red-400", sizeClasses[size])}>
      <XCircle className={iconSize[size]} /> Fail
    </span>
  );
}
