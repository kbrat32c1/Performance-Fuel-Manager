/**
 * TodayPlanView — draws a built Today's plan. No store access, so it can be
 * previewed with fixed data. The store wiring is in today-plan-card.tsx.
 *
 * Order: weight + class + days → one status line → next log → 7-day trend →
 * fuel bars → recovery line → how sure is this.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanLine, PlanStatus, TodayPlan } from "@/lib/today-plan";
import { TIMING_LABEL, type TrendTiming, type WeightTrend } from "@/lib/today-trend";
import type { RecoveryTone } from "@/lib/recovery-zone";

const STATUS_DOT: Record<PlanStatus, string> = {
  'on-track': 'bg-chart-5',
  'data-check': 'bg-chart-3',
  'coach': 'bg-chart-4',
};

const RECOVERY_TEXT: Record<RecoveryTone, string> = {
  good: 'text-chart-5',
  watch: 'text-chart-3',
  low: 'text-chart-4',
};

export interface RecoveryLine {
  score: number;
  label: string;
  source: string;
  tone: RecoveryTone;
}

interface TodayPlanViewProps {
  plan: TodayPlan;
  onAction: () => void;
  trend?: WeightTrend;
  recovery?: RecoveryLine | null;
  onRecoveryTap?: () => void;
}

export function TodayPlanView({ plan, onAction, trend, recovery, onRecoveryTap }: TodayPlanViewProps) {
  const [showConfidence, setShowConfidence] = useState(false);
  const hasAction = plan.next.kind !== 'none';

  return (
    <Card className="mb-3 overflow-hidden" data-testid="today-plan" aria-labelledby="today-plan-title">
      <CardContent className="p-0">
        {/* 1. Weight, class, days to weigh-in */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="today-plan-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Today</h2>
            {plan.demo && (
              <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground" data-testid="today-plan-demo">
                Demo
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2" data-testid="today-plan-weight">
            {plan.current ? (
              <>
                <span className="font-heading text-5xl font-bold leading-none tabular-nums">{plan.current.weight.toFixed(1)}</span>
                <span className="text-sm font-semibold text-muted-foreground">lbs</span>
                <span className="text-xs text-muted-foreground">{plan.current.timing}</span>
              </>
            ) : (
              <span className="font-heading text-3xl font-bold leading-none text-muted-foreground">No weight today</span>
            )}
          </div>
          {plan.facts.length > 0 && (
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5" data-testid="today-plan-facts">
              {plan.facts.map(f => (
                <div key={f.label} className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="text-sm font-bold tabular-nums">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* 2. One status line */}
          <p className="mt-2 text-sm leading-snug" data-testid="today-plan-status">
            <span className="mr-1.5 inline-flex items-center gap-1.5 font-bold">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[plan.status])} aria-hidden="true" />
              {plan.headline}.
            </span>
            <span className="text-muted-foreground">{plan.reason}</span>
          </p>
        </div>

        {/* 3. Next log, named */}
        <div className="px-4 pt-3 pb-3">
          {hasAction ? (
            <>
              <Button onClick={onAction} className="h-11 w-full text-sm font-bold" data-testid="today-plan-action">
                {plan.next.title}
              </Button>
              <p className="mt-1 text-center text-xs text-muted-foreground">{plan.next.when}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground"><span className="font-bold text-foreground">{plan.next.title}.</span> {plan.next.when}</p>
          )}
        </div>

        {/* 4. Weight trend */}
        {trend && <TrendChart trend={trend} />}

        {/* 5. Fuel bars */}
        <div className="border-t border-muted px-4 py-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Fuel today</div>
          {plan.foodWarning && (
            <p role="alert" className="mb-2 rounded-lg border border-chart-4/40 bg-chart-4/10 px-3 py-2 text-xs font-semibold">
              {plan.foodWarning}
            </p>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {plan.food.map(l => <FuelBar key={l.key} line={l} />)}
            {plan.fluid && <FuelBar line={plan.fluid} fluid />}
          </div>
        </div>

        {/* 6. Recovery as context */}
        {recovery && (
          <button
            type="button"
            onClick={onRecoveryTap}
            className="flex min-h-11 w-full items-center gap-2 border-t border-muted px-4 py-2 text-left"
            aria-label={`Recovery ${recovery.score}%, ${recovery.label}, ${recovery.source}. Show factors`}
            data-testid="today-plan-recovery"
          >
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recovery</span>
            <span className="text-sm">
              <span className={cn("font-bold tabular-nums", RECOVERY_TEXT[recovery.tone])}>{recovery.score}%</span>
              <span className="text-muted-foreground"> · {recovery.label} · {recovery.source}</span>
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        {/* How sure is this */}
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

// ── Trend chart ──────────────────────────────────────────────────────────────

/** Timing marks: morning is the connected line; the rest are dots by shape. */
const MARK: Record<TrendTiming, { fill: string; stroke: string; shape: 'circle' | 'ring' | 'square' }> = {
  'morning': { fill: 'hsl(var(--primary))', stroke: 'hsl(var(--primary))', shape: 'circle' },
  'pre-practice': { fill: 'none', stroke: 'hsl(var(--foreground))', shape: 'ring' },
  'post-practice': { fill: 'hsl(var(--muted-foreground))', stroke: 'hsl(var(--muted-foreground))', shape: 'circle' },
  'before-bed': { fill: 'none', stroke: 'hsl(var(--muted-foreground))', shape: 'ring' },
  'weigh-in': { fill: 'hsl(var(--primary))', stroke: 'hsl(var(--primary))', shape: 'square' },
};

function Mark({ timing, x, y, size = 4 }: { timing: TrendTiming; x: number; y: number; size?: number }) {
  const m = MARK[timing];
  if (m.shape === 'square') return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={m.fill} />;
  return <circle cx={x} cy={y} r={size} fill={m.fill} stroke={m.stroke} strokeWidth={m.shape === 'ring' ? 1.75 : 0} />;
}

function TrendChart({ trend }: { trend: WeightTrend }) {
  const W = 320, H = 120, padX = 14, padTop = 8, padBottom = 8;
  const colX = (day: number) => padX + (day * (W - padX * 2)) / 6;
  const y = (w: number) => padTop + ((trend.max - w) / (trend.max - trend.min || 1)) * (H - padTop - padBottom);
  // Within a day, spread multiple weigh-ins slightly by time so they don't overlap.
  const x = (p: { day: number; at: number }) => colX(p.day) + ((p.at - 720) / 720) * 12;

  const morning = trend.points.filter(p => p.timing === 'morning');
  const morningPath = morning.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const planPath = trend.planLine.map((p, i) => `${i ? 'L' : 'M'}${colX(p.day).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');

  return (
    <div className="border-t border-muted px-4 py-3" data-testid="today-plan-trend">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Last 7 days</span>
        {!trend.hasTarget && <span className="text-xs text-muted-foreground">No target set</span>}
      </div>
      {trend.points.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No weigh-ins in the last 7 days.</p>
      ) : (
        <div className="flex gap-2">
          <div className="flex w-9 shrink-0 flex-col justify-between py-1 text-right text-xs tabular-nums text-muted-foreground" aria-hidden="true">
            <span>{trend.max.toFixed(0)}</span>
            <span>{trend.min.toFixed(0)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" role="img"
              aria-label={`Weights over the last 7 days, ${trend.points.length} weigh-ins${trend.hasTarget ? '' : ', no target set'}`}>
              {trend.days.map((d, i) => (
                <line key={d.key} x1={colX(i)} x2={colX(i)} y1={padTop} y2={H - padBottom}
                  stroke="hsl(var(--border))" strokeWidth={d.isToday ? 1.5 : 1} strokeDasharray={d.isToday ? undefined : '2 4'} />
              ))}
              {planPath && <path d={planPath} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 4" />}
              {trend.todayTarget != null && (
                <line x1={colX(6) - 16} x2={colX(6) + 16} y1={y(trend.todayTarget)} y2={y(trend.todayTarget)}
                  stroke="hsl(var(--foreground))" strokeWidth={2} strokeDasharray="2 3" />
              )}
              {morningPath && <path d={morningPath} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />}
              {trend.points.map((p, i) => <Mark key={i} timing={p.timing} x={x(p)} y={y(p.weight)} />)}
            </svg>
            <div className="flex justify-between px-1 text-xs text-muted-foreground" aria-hidden="true">
              {trend.days.map(d => <span key={d.key} className={cn(d.isToday && "font-bold text-foreground")}>{d.label}</span>)}
            </div>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {trend.timings.map(t => (
          <span key={t} className="inline-flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><Mark timing={t} x={5} y={5} size={3.5} /></svg>
            {TIMING_LABEL[t]}
          </span>
        ))}
        {trend.planLine.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <svg width="14" height="10" aria-hidden="true"><line x1="0" x2="14" y1="5" y2="5" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
            Descent plan (lowest allowed)
          </span>
        )}
        {trend.planOffChart != null && (
          <span>Descent plan: lowest allowed today {trend.planOffChart.toFixed(1)} lbs</span>
        )}
        {trend.todayTarget != null && (
          <span className="inline-flex items-center gap-1">
            <svg width="14" height="10" aria-hidden="true"><line x1="0" x2="14" y1="5" y2="5" stroke="hsl(var(--foreground))" strokeWidth="2" strokeDasharray="2 3" /></svg>
            Today's morning target {trend.todayTarget.toFixed(1)} lbs
          </span>
        )}
      </div>
    </div>
  );
}

// ── Fuel bars ────────────────────────────────────────────────────────────────

function FuelBar({ line, fluid = false }: { line: PlanLine; fluid?: boolean }) {
  const m = /^([\d.]+) of ([\d.]+)/.exec(line.progress);
  const pct = m ? Math.min(100, (Number(m[1]) / Math.max(Number(m[2]), 1e-9)) * 100) : 0;
  const blocked = line.progress === 'None today';
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{line.label}</span>
        <span className="flex-1 text-xs text-muted-foreground tabular-nums">{line.progress}</span>
        <span className={cn("text-xs font-bold tabular-nums", line.done ? "text-muted-foreground" : "text-foreground")}>{line.remaining}</span>
      </div>
      {!blocked && m && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full", fluid ? "bg-chart-2" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}
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
