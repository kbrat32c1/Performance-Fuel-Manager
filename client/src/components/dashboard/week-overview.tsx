import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Scale, Droplets, Flame, Dumbbell, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPhaseStyle } from "@/lib/phase-colors";

interface WeekOverviewProps {
  getWeeklyPlan: () => any[];
}

export function WeekOverview({ getWeeklyPlan }: WeekOverviewProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const weekPlan = getWeeklyPlan();

  const selectedDayData = selectedIdx !== null ? weekPlan[selectedIdx] ?? null : null;

  return (
    <div className="space-y-3 mt-4">
      {/* Visual Week Calendar */}
      <Card className="border-muted overflow-hidden">
        <CardContent className="p-0">
          {/* Header */}
          <div className="bg-muted/30 px-4 py-2 flex items-center justify-between border-b border-muted">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h4 className="font-bold text-sm uppercase">Week Overview</h4>
            </div>
            <span className="text-xs text-muted-foreground">Tap any day for details</span>
          </div>

          {/* One column per day for both the phase bar and the day cards, so they always line up.
              The plan can run past 7 days (today through the day after weigh-in); scroll sideways then. */}
          <div className="overflow-x-auto scrollbar-hide bg-muted/20" style={{ scrollbarWidth: "none" }}>
            <div
              className="grid gap-x-0.5 gap-y-2 p-2 min-w-full"
              style={{ gridTemplateColumns: `repeat(${weekPlan.length}, minmax(2.75rem, 1fr))` }}
            >
              {/* Phase Timeline Bar */}
              {weekPlan.map((day, idx) => (
                <div
                  key={`bar-${idx}`}
                  className={cn(
                    "h-2 rounded-sm",
                    getPhaseStyle(day.phase).bg || 'bg-muted',
                    day.isToday && "ring-2 ring-white ring-inset"
                  )}
                />
              ))}

              {weekPlan.map((day, idx) => {
                const colors = getPhaseStyle(day.phase);
                const isSelected = selectedIdx === idx;

                return (
                  <button
                    key={`${day.day}-${idx}`}
                    onClick={() => setSelectedIdx(isSelected ? null : idx)}
                    className={cn(
                      "flex flex-col items-center p-1.5 rounded-lg transition-all text-center min-h-[72px]",
                      day.isToday && "ring-2 ring-primary",
                      isSelected && colors.bgMedium,
                      isSelected && colors.border,
                      isSelected && "border",
                      !isSelected && !day.isToday && "hover:bg-muted/50"
                    )}
                  >
                    {/* Day Name + Date */}
                    <span className={cn(
                      "text-xs font-bold uppercase",
                      day.isToday ? "text-primary" : "text-muted-foreground"
                    )}>
                      {day.day.slice(0, 3)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(() => {
                        if (!day.date) return '';
                        const d = new Date(day.date);
                        return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
                      })()}
                    </span>

                    {/* Phase Indicator Dot */}
                    <div className={cn(
                      "w-2 h-2 rounded-full my-1",
                      getPhaseStyle(day.phase).bg || 'bg-muted'
                    )} />

                    {/* Weight Target (Morning) */}
                    <span className={cn(
                      "font-mono text-xs font-bold",
                      day.isToday ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {day.weightTarget}
                    </span>

                    {/* Today/Tomorrow Badge */}
                    {day.isToday && (
                      <span className="text-xs leading-4 whitespace-nowrap bg-primary text-white px-1.5 rounded mt-0.5 font-bold">
                        Today
                      </span>
                    )}
                    {day.isTomorrow && !day.isToday && (
                      <span className="text-xs leading-4 whitespace-nowrap bg-primary/15 text-primary px-1.5 rounded mt-0.5 font-bold">
                        Next
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expanded Day Details */}
          {selectedDayData && (
            <div className={cn(
              "border-t p-4 animate-in slide-in-from-top-2 duration-200",
              getPhaseStyle(selectedDayData.phase).bgMedium || 'bg-muted/20'
            )}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className="font-bold text-lg">
                    {selectedDayData.day}
                    {selectedDayData.date && (
                      <span className="text-sm text-muted-foreground font-normal ml-2">
                        {new Date(selectedDayData.date).getMonth() + 1}/{new Date(selectedDayData.date).getDate()}
                      </span>
                    )}
                  </h5>
                  <span className={cn(
                    "text-xs font-bold uppercase",
                    getPhaseStyle(selectedDayData.phase).text || 'text-primary'
                  )}>
                    {selectedDayData.phase} Phase
                  </span>
                </div>
                <button
                  aria-label="Close day details"
                  onClick={() => setSelectedIdx(null)}
                  className="text-muted-foreground hover:text-foreground p-1 relative after:absolute after:-inset-2"
                >
                  <ChevronRight className="w-5 h-5 rotate-90" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Weight Target (Morning) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Morning Target</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className="font-mono font-bold text-lg">{selectedDayData.weightTarget} lbs</span>
                  </div>
                </div>

                {/* Water */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-cyan-500" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Water</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className="font-mono font-bold text-cyan-500 block">{selectedDayData.water.amount}</span>
                    <span className={cn(
                      "text-xs font-bold uppercase",
                      selectedDayData.water.type === 'Sip Only' ? "text-orange-500" : "text-muted-foreground"
                    )}>
                      {selectedDayData.water.type}
                    </span>
                  </div>
                </div>

                {/* Carbs */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Carbs</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className="font-mono font-bold text-primary">
                      {selectedDayData.carbs.min}-{selectedDayData.carbs.max}g
                    </span>
                  </div>
                </div>

                {/* Protein */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-orange-500" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Protein</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <span className={cn(
                      "font-mono font-bold",
                      selectedDayData.protein.min === 0 ? "text-destructive" : "text-orange-500"
                    )}>
                      {selectedDayData.protein.min === selectedDayData.protein.max
                        ? `${selectedDayData.protein.min}g`
                        : `${selectedDayData.protein.min}-${selectedDayData.protein.max}g`}
                    </span>
                    {selectedDayData.protein.min === 0 && (
                      <span className="text-xs text-destructive block font-bold">NO PROTEIN</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Day-specific note or phase tips */}
              <div className="mt-3 pt-3 border-t border-muted/50">
                <p className="text-xs text-muted-foreground">
                  {selectedDayData.waterLoadingNote || (
                    <>
                      {selectedDayData.phase === 'Load' && "Water loading phase — drink consistently throughout the day to trigger natural diuresis."}
                      {selectedDayData.phase === 'Cut' && "Water cut — restrict water intake. Follow protocol strictly. Monitor weight drift carefully."}
                      {selectedDayData.phase === 'Compete' && "Competition day — focus on fast carbs between matches. Rehydrate with electrolytes."}
                      {selectedDayData.phase === 'Recover' && "Recovery day — high protein to repair muscle. Eat freely to refuel."}
                      {selectedDayData.phase === 'Train' && "Training day — maintain consistent nutrition and hydration."}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-2">
        {['Train', 'Load', 'Cut', 'Compete', 'Recover']
          .filter((phase) => phase !== 'Load' || weekPlan.some((d) => d.phase === 'Load'))
          .map((phase) => (
          <div key={phase} className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", getPhaseStyle(phase).bg)} />
            <span className="text-xs text-muted-foreground">{phase}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
