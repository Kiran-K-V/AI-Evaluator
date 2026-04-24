"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { format } from "date-fns";
import {
  Wrench, Brain, Shield, Braces, Tags, Gauge, GraduationCap,
  RefreshCcw, FileText, Microscope,
  ArrowRight, FlaskConical, TrendingUp, TrendingDown, Activity,
  Zap, Swords,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCounter } from "@/components/metrics/animated-counter";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { getRuns } from "@/lib/db";
import { MODULES } from "@/lib/modules";
import { getRunScore } from "@/lib/utils";
import type { EvaluationRun } from "@/lib/types";

const iconMap: Record<string, React.ElementType> = {
  Wrench, Brain, Shield, Braces, Tags, Gauge, GraduationCap, RefreshCcw, FileText, Microscope,
};

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function DashboardPage() {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    getRuns().then((data) => { setRuns(data); setMounted(true); });
  }, []);

  if (!mounted) return null;

  const totalRuns = runs.length;
  const passedRuns = runs.filter((r) => r.passed).length;
  const failedRuns = runs.filter((r) => !r.passed).length;
  const avgScore = runs.length > 0
    ? runs.reduce((sum, r) => sum + getRunScore(r), 0) / runs.length
    : 0;

  const recentRuns = runs.slice(0, 8);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Overview Cards */}
      <motion.div data-tour="dashboard-overview" variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Runs", value: totalRuns, icon: Activity, gradient: "from-orange-500 to-amber-600", decimals: 0 },
          { label: "Passed", value: passedRuns, icon: TrendingUp, gradient: "from-emerald-500 to-teal-600", decimals: 0 },
          { label: "Failed", value: failedRuns, icon: TrendingDown, gradient: "from-red-500 to-rose-600", decimals: 0 },
          { label: "Avg Score", value: avgScore, icon: FlaskConical, gradient: "from-amber-500 to-orange-600", decimals: 1, suffix: "%" },
        ].map((card) => (
          <motion.div key={card.label} variants={fadeUp}>
            <div className="group glass rounded-2xl p-5 transition-all neu-hover">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</p>
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} shadow-lg`}>
                  <card.icon className="h-4 w-4 text-white" />
                </div>
              </div>
              <div className="mt-3">
                <AnimatedCounter value={card.value} decimals={card.decimals} suffix={card.suffix} className="text-3xl font-bold tracking-tight" />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div data-tour="quick-actions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/run-all">
          <div className="group glass rounded-2xl p-5 transition-all neu-hover cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold">Run All Modules</h3>
                <p className="text-sm text-muted-foreground">Execute all {MODULES.length} benchmarks at once with aggregated results</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
        <Link href="/arena">
          <div className="group glass rounded-2xl p-5 transition-all neu-hover cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/25">
                <Swords className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold">Model Arena</h3>
                <p className="text-sm text-muted-foreground">Compare two models head-to-head across all metrics</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Module Quick Launch */}
      <motion.div data-tour="module-grid" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Evaluation Modules</h2>
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MODULES.map((mod) => {
            const Icon = iconMap[mod.icon] || FlaskConical;
            const moduleRuns = runs.filter((r) => r.module === mod.slug);
            const modulePassed = moduleRuns.filter((r) => r.passed).length;
            return (
              <motion.div key={mod.slug} variants={fadeUp}>
                <Link href={`/evaluate/${mod.slug}`}>
                  <div className="group glass h-full rounded-2xl p-5 transition-all neu-hover cursor-pointer">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/15 text-orange-500 transition-all group-hover:from-orange-500 group-hover:to-amber-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-orange-500/25">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{mod.name}</h3>
                        {moduleRuns.length > 0 && (
                          <p className="text-xs text-muted-foreground">{modulePassed}/{moduleRuns.length} passed</p>
                        )}
                      </div>
                    </div>
                    <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground">{mod.description}</p>
                    <div className="flex items-center text-sm font-semibold text-orange-500">
                      Run Evaluation <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </motion.div>

      {/* Recent Runs */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Recent Evaluations</h2>
          {runs.length > 0 && (
            <Link href="/results">
              <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-400">
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>

        {recentRuns.length === 0 ? (
          <div className="glass rounded-2xl border-dashed p-12 text-center">
            <FlaskConical className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
            <p className="text-lg font-semibold text-muted-foreground">No evaluations yet</p>
            <p className="mt-1 text-sm text-muted-foreground/60">Select a module above to run your first evaluation</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentRuns.map((run, i) => {
              const mod = MODULES.find((m) => m.slug === run.module);
              const Icon = mod ? iconMap[mod.icon] || FlaskConical : FlaskConical;
              return (
                <motion.div key={run.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
                  <Link href={`/results/${run.id}`}>
                    <div className="glass group flex cursor-pointer items-center gap-4 rounded-2xl p-4 transition-all hover:ring-1 hover:ring-orange-500/30">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{mod?.name ?? run.module}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(run.timestamp), "MMM d, yyyy 'at' h:mm a")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-muted-foreground sm:block">{run.cases.length} cases</span>
                        <PassFailBadge passed={run.passed} />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
