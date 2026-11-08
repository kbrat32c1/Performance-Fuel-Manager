/**
 * TodayPlanView — draws a built Today's plan. No store access, so it can be
 * previewed with fixed data. The store wiring is in today-plan-card.tsx.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanLine, PlanStatus, TodayPlan } from "@/lib/today-plan";

const STATUS_STYLE: Record<PlanStatus, { dot: string; ring: string; tint: string; label: string }> = {
  'on-track': { dot: 'bg-chart-5', ring: 'border-chart-5/40', tint: 'bg-chart-5/10', label: 'On track' },
  'data-check': { dot: 'bg-chart-3', ring: 'border-chart-3/50', tint: 'bg-chart-3/10', label: 'Needs a data check' },
  'coach': { dot: 'bg-chart-4', ring: 'border-chart-4/50', tint: 'bg-chart-4/10', label: 'Talk to your coach' },
};

const ACTION_BUTTON: Partial<Record<TodayPlan['next']['kind'], string>> = {
  'set-weigh-in': 'Set date',
  'log-morning': 'Log',
  'log-pre-practice': 'Log',
  'log-post-practice': 'Log',
  'log-before-bed': 'Log',
  'log-official': 'Log',
  'recovery': 'Open',
  'log-food': 'Add food',
};

export function TodayPlanView({ plan, onAction }: { plan: TodayPlan; onAction: () => void }) {
  const [showConfidence, setShowConfidence] = useState(false);
  const style = STATUS_STYLE[plan.status];
  const buttonLabel = ACTION_BUTTON[plan.next.kind];

  return (
    <Card className={cn("mb-3 overflow-hidden border", style.ring)} data-testid="today-plan" aria-labelledby="today-plan-title">
      <CardContent className="p-0">
        {/* Facts, then one status line */}
        <div className={cn("px-4 pt-3 pb-3", style.tint)}>
          <h2 id="today-plan-title" className="text-base font-heading font-bold uppercase tracking-wide">Today's plan</h2>
          <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1" data-testid="today-plan-facts">
            {plan.facts.map(f => (
              <div key={f.label} className="flex items-baseline gap-1.5">
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="text-sm font-bold tabular-nums text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm leading-snug" data-testid="today-plan-status">
            <span className="mr-1.5 inline-flex items-center gap-1.5 font-bold text-foreground">
              <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden="true" />
              {style.label}:
            </span>
            <span className="text-muted-foreground">{plan.reason}</span>
          </p>
        </div>

        {/* Next action */}
        <div className="flex items-center gap-3 border-t border-muted px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Next</div>
            <div className="text-sm font-bold text-foreground">{plan.next.title}</div>
            <div className="text-xs text-muted-foreground">{plan.next.when}</div>
          </div>
          {buttonLabel && (
            <Button onClick={onAction} className="h-11 min-w-11 shrink-0 px-4 font-bold" data-testid="today-plan-action">
              {buttonLabel}
            </Button>
          )}
        </div>

        {/* Plan: food and fluids */}
        <div className="border-t border-muted px-4 py-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Today's targets</div>
          {plan.foodWarning && (
            <p role="alert" className="mb-2 rounded-lg border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-xs font-semibold text-foreground">
              {plan.foodWarning}
            </p>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {plan.food.map(l => <TargetRow key={l.key} line={l} />)}
            {plan.fluid && <TargetRow line={plan.fluid} fluid />}
          </div>
        </div>

        {/* Confidence */}
        <div className="border-t border-muted">
          <button
            type="button"
            onClick={() => setShowConfidence(v => !v)}
            aria-expanded={showConfidence}
            aria-controls="today-plan-confidence"
            className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left"
          >
            {showConfidence ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">How sure is this?</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {plan.measured.length} measured · {plan.estimated.length} estimated · {plan.missing.length} missing
              </span>
            </span>
          </button>
          {showConfidence && (
            <div id="today-plan-confidence" className="grid grid-cols-1 gap-3 px-4 pb-3 sm:grid-cols-3">
              <ConfidenceList title="Measured" items={plan.measured} empty="Nothing measured yet today" />
              <ConfidenceList title="Estimated" items={plan.estimated} empty="Nothing estimated" />
              <ConfidenceList title="Missing" items={plan.missing} empty="Nothing missing" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TargetRow({ line, fluid = false }: { line: PlanLine; fluid?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-sm">
      <span className="flex w-24 shrink-0 items-center gap-1 font-semibold">
        {line.label}
        {fluid && <Droplets className="h-3.5 w-3.5 text-chart-2" aria-hidden="true" />}
      </span>
      <span className="flex-1 text-muted-foreground tabular-nums">{line.progress}</span>
      <span className={cn("shrink-0 text-xs font-bold tabular-nums", line.done ? "text-muted-foreground" : "text-foreground")}>
        {line.remaining}
      </span>
    </div>
  );
}

function ConfidenceList({ title, items, empty }: { title: string; items: { label: string; detail: string }[]; empty: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map(i => (
            <li key={i.label} className="text-xs leading-snug">
              <span className="font-semibold text-foreground">{i.label}:</span>{' '}
              <span className="text-muted-foreground">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
