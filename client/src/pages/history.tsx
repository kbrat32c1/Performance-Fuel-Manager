import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, subMonths, addMonths, startOfWeek, endOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Sun, Dumbbell, Moon, Scale } from "lucide-react";
import { useState } from "react";

export default function History() {
  const { logs, profile } = useStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Get calendar days for the current month view
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get logs for a specific date
  const getLogsForDate = (date: Date) => {
    return logs.filter(log => {
      const logDate = new Date(log.date);
      return isSameDay(logDate, date);
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Check if a date has any logs
  const hasLogs = (date: Date) => {
    return logs.some(log => isSameDay(new Date(log.date), date));
  };

  // Get weight range for a date (morning to before-bed)
  const getWeightRange = (date: Date) => {
    const dayLogs = getLogsForDate(date).filter(l =>
      l.type === 'morning' || l.type === 'pre-practice' || l.type === 'post-practice' || l.type === 'before-bed'
    );
    if (dayLogs.length === 0) return null;
    const weights = dayLogs.map(l => l.weight);
    return {
      min: Math.min(...weights),
      max: Math.max(...weights),
      change: dayLogs.length > 1 ? dayLogs[dayLogs.length - 1].weight - dayLogs[0].weight : 0
    };
  };

  const selectedDateLogs = selectedDate ? getLogsForDate(selectedDate) : [];

  const getLogTypeIcon = (type: string) => {
    switch (type) {
      case 'morning': return <Sun className="w-4 h-4 text-yellow-500" />;
      case 'pre-practice': return <Dumbbell className="w-4 h-4 text-blue-500" />;
      case 'post-practice': return <Dumbbell className="w-4 h-4 text-orange-500" />;
      case 'before-bed': return <Moon className="w-4 h-4 text-purple-500" />;
      case 'extra-before': return <Scale className="w-4 h-4 text-cyan-500" />;
      case 'extra-after': return <Scale className="w-4 h-4 text-cyan-500" />;
      default: return <Scale className="w-4 h-4" />;
    }
  };

  const getLogTypeLabel = (type: string) => {
    switch (type) {
      case 'morning': return 'Morning';
      case 'pre-practice': return 'Pre-Practice';
      case 'post-practice': return 'Post-Practice';
      case 'before-bed': return 'Before Bed';
      case 'extra-before': return 'Extra (Before)';
      case 'extra-after': return 'Extra (After)';
      default: return type;
    }
  };

  return (
    <MobileLayout showNav={true}>
      {/* Header */}
      <header className="mb-6">
        <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
          Weight Log
        </h2>
        <h1 className="text-2xl font-heading font-bold uppercase italic">
          History
        </h1>
      </header>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="font-bold text-lg">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card className="mb-4">
        <CardContent className="p-2">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const dayHasLogs = hasLogs(day);
              const weightRange = getWeightRange(day);

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all relative",
                    !isCurrentMonth && "text-muted-foreground/30",
                    isCurrentMonth && !dayHasLogs && "text-muted-foreground",
                    isCurrentMonth && dayHasLogs && "text-foreground font-bold",
                    isToday && "ring-2 ring-primary",
                    isSelected && "bg-primary text-black",
                    !isSelected && dayHasLogs && "bg-primary/10"
                  )}
                >
                  <span>{format(day, 'd')}</span>
                  {dayHasLogs && !isSelected && (
                    <div className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Details */}
      {selectedDate && (
        <div className="space-y-3">
          <h3 className="font-bold text-sm uppercase text-muted-foreground">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </h3>

          {selectedDateLogs.length === 0 ? (
            <Card className="border-muted">
              <CardContent className="p-4 text-center text-muted-foreground">
                No weigh-ins recorded this day
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {selectedDateLogs.map((log, i) => (
                <Card key={log.id} className="border-muted">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getLogTypeIcon(log.type)}
                        <div>
                          <span className="font-bold text-sm">{getLogTypeLabel(log.type)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {format(new Date(log.date), 'h:mm a')}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-lg">{log.weight} lbs</span>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Daily Summary */}
              {(() => {
                const weightRange = getWeightRange(selectedDate);
                if (weightRange && selectedDateLogs.length > 1) {
                  return (
                    <Card className="border-primary/30 bg-primary/5">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-primary">Daily Summary</span>
                          <div className="text-right">
                            <span className="font-mono text-sm">
                              {weightRange.min.toFixed(1)} - {weightRange.max.toFixed(1)} lbs
                            </span>
                            <span className={cn(
                              "text-xs font-bold ml-2",
                              weightRange.change < 0 ? "text-primary" : "text-muted-foreground"
                            )}>
                              {weightRange.change < 0 ? '' : '+'}{weightRange.change.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      )}

      {/* No date selected message */}
      {!selectedDate && (
        <Card className="border-muted">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Scale className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Tap a date to view weigh-ins</p>
          </CardContent>
        </Card>
      )}

      {/* Bottom Spacing */}
      <div className="h-20" />
    </MobileLayout>
  );
}
