import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, ChevronLeft, Scale, Zap, Calendar, Apple, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  target: string; // data-tour attribute value
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Today's Weigh-Ins",
    description: "Tap any slot to log your weight. Track morning, pre-practice, post-practice, and bedtime — the 4 key checkpoints.",
    icon: <Scale className="w-5 h-5" />,
    target: "weigh-ins",
  },
  {
    title: "Your Daily Coach",
    description: "This card adapts to your situation — showing your status, what to focus on today, and how many extra workouts you need.",
    icon: <Zap className="w-5 h-5" />,
    target: "daily-coach",
  },
  {
    title: "The Countdown",
    description: "Your week at a glance with weight targets for each day. Tap any day for details. Drift, practice loss, and projected weigh-in update as you log.",
    icon: <Calendar className="w-5 h-5" />,
    target: "countdown",
  },
  {
    title: "Fuel Tracking",
    description: "Track food and hydration. In SPAR mode, count portions (slices). In Sugar System mode, track grams for competition week. The app switches automatically.",
    icon: <Apple className="w-5 h-5" />,
    target: "fuel",
  },
  {
    title: "AI Coach",
    description: "Tap this button for personalized advice. It knows your protocol, weight, and how many days you have left.",
    icon: <Sparkles className="w-5 h-5" />,
    target: "ai-coach",
  },
];

const TOUR_KEY = "pfm-dashboard-tour-seen";

// Viewport-relative rect (getBoundingClientRect values)
interface VRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export function DashboardTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<VRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowDir, setArrowDir] = useState<"up" | "down">("up");
  const [arrowLeft, setArrowLeft] = useState<number>(50); // percentage
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const seen = localStorage.getItem(TOUR_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for restart-tour event (from Settings replay button)
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setTimeout(() => setVisible(true), 400);
    };
    window.addEventListener("restart-dashboard-tour", handler);
    return () => window.removeEventListener("restart-dashboard-tour", handler);
  }, []);

  // Measure + scroll target into view
  const measure = useCallback(() => {
    if (!visible) return;
    const current = TOUR_STEPS[step];
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right });
  }, [step, visible]);

  // On step change: scroll into view, then measure
  useEffect(() => {
    if (!visible) return;
    const current = TOUR_STEPS[step];
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) { setRect(null); return; }

    // Check if element is fixed-position (like the AI Coach FAB)
    const isFixed = window.getComputedStyle(el).position === 'fixed';

    if (isFixed) {
      // Fixed elements don't need scrolling — just measure
      measure();
    } else {
      // Scroll into view first
      const r = el.getBoundingClientRect();
      const viewH = window.innerHeight;
      // Need room for target + tooltip (~240px)
      if (r.top < 60 || r.bottom > viewH - 260) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Wait for scroll to finish then measure
        setTimeout(measure, 400);
      } else {
        measure();
      }
    }
  }, [step, visible, measure]);

  // Re-measure on scroll/resize with rAF throttle
  useEffect(() => {
    if (!visible) return;
    const onUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    return () => {
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
      cancelAnimationFrame(rafRef.current);
    };
  }, [visible, measure]);

  // Position tooltip relative to target rect (all viewport coords, since we use fixed)
  useEffect(() => {
    if (!rect || !tooltipRef.current) return;
    const tooltipH = tooltipRef.current.offsetHeight;
    const tooltipW = tooltipRef.current.offsetWidth;
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;
    const gap = 14;
    const pad = 16; // side padding

    // Horizontal: center tooltip on target, clamped to screen
    let left = rect.left + rect.width / 2 - tooltipW / 2;
    left = Math.max(pad, Math.min(left, viewW - tooltipW - pad));

    // Arrow: point to center of target
    const targetCenterX = rect.left + rect.width / 2;
    const arrowPx = targetCenterX - left;
    const arrowPct = Math.max(15, Math.min(85, (arrowPx / tooltipW) * 100));
    setArrowLeft(arrowPct);

    // Vertical: prefer below target
    if (rect.bottom + gap + tooltipH < viewH - 20) {
      setTooltipStyle({ top: rect.bottom + gap, left });
      setArrowDir("up");
    } else {
      // Above
      setTooltipStyle({ top: rect.top - gap - tooltipH, left });
      setArrowDir("down");
    }
  }, [rect, step]);

  const handleNext = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      localStorage.setItem(TOUR_KEY, "true");
      setVisible(false);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(TOUR_KEY, "true");
    setVisible(false);
  }, []);

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;
  const spotPad = 6;

  return (
    <>
      {/* Dark overlay — uses a massive box-shadow on the spotlight hole to darken everything else */}
      <div
        className="fixed inset-0 z-[200]"
        style={{ pointerEvents: "none" }}
      />

      {/* Spotlight hole — the element with the giant box-shadow */}
      {rect && (
        <div
          className="fixed z-[200] rounded-xl transition-all duration-300 ease-out"
          style={{
            top: rect.top - spotPad,
            left: rect.left - spotPad,
            width: rect.width + spotPad * 2,
            height: rect.height + spotPad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55), 0 0 20px 4px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Ring highlight */}
      {rect && (
        <div
          className="fixed z-[201] rounded-xl ring-2 ring-primary pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top - spotPad,
            left: rect.left - spotPad,
            width: rect.width + spotPad * 2,
            height: rect.height + spotPad * 2,
          }}
        />
      )}

      {/* Click blocker — prevents interacting with anything behind the tour, but does NOT dismiss */}
      <div
        className="fixed inset-0 z-[202]"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[203] w-[320px] bg-background border border-border rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)] animate-in fade-in zoom-in-95 duration-200"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow */}
        <div
          className="absolute -translate-x-1/2"
          style={{
            left: `${arrowLeft}%`,
            ...(arrowDir === "up" ? { top: -7 } : { bottom: -7 }),
          }}
        >
          <div
            className={cn(
              "w-[14px] h-[14px] bg-background border border-border rotate-45",
              arrowDir === "up" ? "border-b-0 border-r-0" : "border-t-0 border-l-0"
            )}
          />
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Step indicator + close */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-primary">{current.icon}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                {step + 1} of {TOUR_STEPS.length}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="p-1 rounded-full hover:bg-muted/50 text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Title & description */}
          <h3 className="font-heading text-base font-bold uppercase italic mb-1.5">
            {current.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {current.description}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors active:scale-95"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              ) : (
                <button
                  onClick={handleSkip}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip tour
                </button>
              )}
            </div>
            <button
              onClick={handleNext}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all active:scale-95",
                isLast
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              {isLast ? "Let's go!" : "Next"}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5 mt-4">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  i === step ? "bg-primary w-4" : i < step ? "bg-primary/40" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Reset tour so it shows again (for testing or re-triggering) */
export function resetDashboardTour() {
  localStorage.removeItem(TOUR_KEY);
  window.dispatchEvent(new CustomEvent("restart-dashboard-tour"));
}
