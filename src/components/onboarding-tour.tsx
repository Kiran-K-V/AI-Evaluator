"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Step, EventData } from "react-joyride";

const Joyride = dynamic(() => import("react-joyride").then((mod) => mod.Joyride), {
  ssr: false,
});

const TOUR_SEEN_KEY = "netra_tour_seen";

const steps: Step[] = [
  {
    target: "[data-tour='sidebar']",
    content:
      "Welcome to Netra AI! This is your navigation sidebar. Browse evaluation modules, batch tools, and results history here.",
    placement: "right",
    skipBeacon: true,
  },
  {
    target: "[data-tour='dashboard-overview']",
    content:
      "The dashboard shows an at-a-glance summary of your evaluation runs — total runs, pass/fail counts, and average scores.",
    placement: "bottom",
  },
  {
    target: "[data-tour='quick-actions']",
    content:
      "Use 'Run All Modules' to benchmark a model across every evaluation in one click, or 'Model Arena' to compare two models head-to-head.",
    placement: "bottom",
  },
  {
    target: "[data-tour='module-grid']",
    content:
      "Each card is a standalone evaluation module: Tool Calling, Hallucination Detection, RAG Grounding, Safety, Structured Output, Classification, and Performance. Click any card to run it individually.",
    placement: "top",
  },
  {
    target: "[data-tour='theme-toggle']",
    content: "Toggle between dark and light mode here.",
    placement: "bottom",
  },
  {
    target: "[data-tour='settings-link']",
    content:
      "Configure your AI model settings here — API key, model name, and base URL for any OpenAI-compatible endpoint.",
    placement: "bottom",
  },
];

export function OnboardingTour() {
  const [run, setRun] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      setMounted(true);
      const seen = localStorage.getItem(TOUR_SEEN_KEY);
      if (!seen) {
        setTimeout(() => setRun(true), 1200);
      }
    });
  }, []);

  useEffect(() => {
    const handler = () => setRun(true);
    window.addEventListener("netra:start-tour", handler);
    return () => window.removeEventListener("netra:start-tour", handler);
  }, []);

  const handleEvent = useCallback((data: EventData) => {
    if (data.status === "finished" || data.status === "skipped") {
      setRun(false);
      localStorage.setItem(TOUR_SEEN_KEY, "true");
    }
  }, []);

  if (!mounted) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{
        back: "Back",
        close: "Close",
        last: "Got it!",
        next: "Next",
        skip: "Skip tour",
      }}
      options={{
        primaryColor: "#8b5cf6",
        overlayColor: "rgba(0, 0, 0, 0.5)",
        backgroundColor: "rgba(15, 15, 25, 0.95)",
        textColor: "#e4e4e7",
        zIndex: 10000,
        showProgress: true,
        buttons: ["back", "close", "primary", "skip"],
      }}
    />
  );
}
