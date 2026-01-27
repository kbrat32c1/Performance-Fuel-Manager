import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Scale, Droplets, Flame, Dumbbell, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeekOverviewProps {
  getWeeklyPlan: () => any[];
}

const PHASE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  'Load': { text: 'text-primary', bg: 'bg-primary/20', border: 'border-primary/50' },
  'Cut': { text: 'text-orange-500', bg: 'bg-orange-500/20', border: 'border-orange-500/50' },
  'Compete': { text: 'text-yellow-500', bg: 'bg-yellow-500/20', border: 'border-yellow-500/50' },
  'Recover': { text: 'text-cyan-500', bg: 'bg-cyan-500/20', border: 'border-cyan-500/50' },
  'Train': { text: 'text-green-500', bg: 'bg-green-500/20', border: 'border-green-500/50' },
  'Maintain': { text: 'text-blue-500', bg: 'bg-blue-500/20', border: 'border-blue-500/50' }
};

const PHASE_BG_COLORS: Record<string, string> = {
  'Load': 'bg-primary',
  'Cut': 'bg-orange-500',
  'Compete': 'bg-yellow-500',
  'Recover': 'bg-cyan-500',
  'Train': 'bg-green-500',
  'Maintain': 'bg-blue-500'
};

export function WeekOverview({ getWeeklyPlan }: WeekOverviewProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const weekPlan = getWeeklyPlan();

  const selectedDayData = selectedDay !== null ? weekPlan.find(d => d.dayNum === selectedDay) : null;

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
            <span className="text-[10px] text-muted-foreground">Tap any day for details</span>
          </div>

          {/* Phase Timeline Bar */}
          <div className="flex h-2">
            {weekPlan.map((day) => (
              <div
                key={day.day}
                className={cn(
                  "flex-1",
                  PHASE_BG_COLORS[day.phase] || 'bg-muted',
                  day.isToday && "ring-2 ring-white ring-inset"
                )}
              />
            ))}
          </div>

          {/* Day Cards Grid */}
          <div className="grid grid-cols-7 gap-0.5 p-2 bg-muted/20">
            {weekPlan.map((day) => {
              const colors = PHASE_COLORS[day.phase] || PHASE_COLORS['Load'];
              const isSelected = selectedDay === day.dayNum;

              return (
                <button
                  key={day.day}
                  onClick={() => setSelectedDay(isSelected ? null : day.dayNum)}
                  className={cn(
                    "flex flex-col items-center p-1.5 rounded-lg transition-all text-center min-h-[72px]",
                    day.isToday && "ring-2 ring-primary",
                    isSelected && colors.bg,
                    isSelected && colors.border,
                    isSelected && "border",
                    !isSelected && !day.isToday && "hover:bg-muted/50"
                  )}
                >
                  {/* Day Name */}
                  <span className={cn(
                    "text-[10px] font-bold uppercase",
                    day.isToday ? "text-primary" : "text-muted-foreground"
                  )}>
                    {day.day.slice(0, 3)}
                  </span>

                  {/* Phase Indicator Dot */}
                  <div className={cn(
                    "w-2 h-2 rounded-full my-1",
                    PHASE_BG_COLORS[day.phase] || 'bg-muted'
                  )} />

                  {/* Weight Target */}
                  <span className={cn(
                    "font-mono text-[11px] font-bold",
                    day.isToday ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {day.weightTarget.morning}
                  </span>

                  {/* Today/Tomorrow Badge */}
                  {day.isToday && (
                    <span className="text-[8px] bg-primary text-black px-1 rounded mt-0.5 font-bold">
                      TODAY
                    </span>
                  )}
                  {day.isTomorrow && !day.isToday && (
                    <span className="text-[8px] bg-primary/30 text-primary px-1 rounded mt-0.5 font-bold">
                      NEXT
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Expanded Day Details */}
          {selectedDayData && (
            <div className={cn(
              "border-t p-4 animate-in slide-in-from-top-2 duration-200",
              PHASE_COLORS[selectedDayData.phase]?.bg || 'bg-muted/20'
            )}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h5 className="font-bold text-lg">{selectedDayData.day}</h5>
                  <span className={cn(
                    "text-xs font-bold uppercase",
                    PHASE_COLORS[selectedDayData.phase]?.text || 'text-primary'
                  )}>
                    {selectedDayData.phase} Phase
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <ChevronRight className="w-5 h-5 rotate-90" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Weight Targets */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase font-bold">Weight</span>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground">Morning</span>
                      <span className="font-mono font-bold">{selectedDayData.weightTarget.morning} lbs</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-muted-foreground">Post-Practice</span>
                      <span className="font-mono font-bold">{selectedDayData.weightTarget.postPractice} lbs</span>
                    </div>
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
                      "text-[10px] font-bold uppercase",
                      selectedDayData.water.type === 'Distilled' ? "text-yellow-500" :
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
                      <span className="text-[10px] text-destructive block font-bold">NO PROTEIN</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Phase-specific tips */}
              <div className="mt-3 pt-3 border-t border-muted/50">
                <p className="text-xs text-muted-foreground">
                  {selectedDayData.phase === 'Load' && "Water loading phase - drink consistently throughout the day to trigger natural diuresis."}
                  {selectedDayData.phase === 'Cut' && "Cutting phase - follow protocol strictly. Monitor weight drift carefully."}
                  {selectedDayData.phase === 'Compete' && "Competition day - focus on fast carbs between matches. Rehydrate with electrolytes."}
                  {selectedDayData.phase === 'Recover' && "Recovery day - high protein to repair muscle. Eat freely to refuel."}
                  {selectedDayData.phase === 'Train' && "Training day - maintain consistent nutrition and hydration."}
                  {selectedDayData.phase === 'Maintain' && "Maintenance phase - stay at walk-around weight with balanced nutrition."}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase Legend */}
      <div className="flex flex-wrap justify-center gap-3 px-2">
        {['Load', 'Cut', 'Compete', 'Recover'].map((phase) => (
          <div key={phase} className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", PHASE_BG_COLORS[phase])} />
            <span className="text-[10px] text-muted-foreground">{phase}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
