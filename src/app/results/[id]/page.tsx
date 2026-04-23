"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { format } from "date-fns";
import {
  ArrowLeft, Clock, Bot, Hash, Wrench, Brain, BookOpen,
  Shield, Braces, Tags, Gauge, GraduationCap, RefreshCcw, FileText, FlaskConical, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { ResultsPanel } from "@/components/evaluation/results-panel";
import { getRunById, deleteRun } from "@/lib/storage";
import { getModule } from "@/lib/modules";
import type { EvaluationRun } from "@/lib/types";
import { toast } from "sonner";

const iconMap: Record<string, React.ElementType> = { Wrench, Brain, BookOpen, Shield, Braces, Tags, Gauge, GraduationCap, RefreshCcw, FileText };

export default function ResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<EvaluationRun | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const data = getRunById(id);
    requestAnimationFrame(() => { setRun(data); setMounted(true); });
  }, [id]);

  if (!mounted) return null;

  if (!run) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="glass rounded-2xl border-dashed p-12 text-center">
          <FlaskConical className="mx-auto mb-4 h-12 w-12 text-amber-400" />
          <h2 className="text-xl font-bold">Run Not Found</h2>
          <p className="mt-2 text-muted-foreground">This evaluation run may have been deleted.</p>
          <Button variant="outline" className="mt-4 rounded-xl glass-subtle" onClick={() => router.push("/results")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Results
          </Button>
        </div>
      </div>
    );
  }

  const mod = getModule(run.module);
  const Icon = mod ? iconMap[mod.icon] || FlaskConical : FlaskConical;

  const handleDelete = () => { deleteRun(run.id); toast.success("Run deleted"); router.push("/results"); };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/results")} className="mt-1 rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{mod?.name ?? run.module}</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(run.timestamp), "MMM d, yyyy 'at' h:mm:ss a")}</span>
                <span className="text-muted-foreground/30">|</span>
                <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{run.modelConfig.model}</span>
                <span className="text-muted-foreground/30">|</span>
                <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{run.cases.length} cases</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PassFailBadge passed={run.passed} size="lg" />
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-muted-foreground hover:text-red-400 rounded-xl">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <ResultsPanel metrics={run.metrics} cases={run.cases} passed={run.passed} metricDefinitions={mod?.metricDefinitions ?? []} />
      </motion.div>
    </div>
  );
}
