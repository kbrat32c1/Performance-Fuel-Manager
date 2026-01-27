import { useState } from 'react';
import { format, addDays, subDays, isToday, startOfDay, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

interface DateNavigatorProps {
  currentDate: Date;
  onDateChange: (date: Date | null) => void;
  className?: string;
}

export function DateNavigator({ currentDate, onDateChange, className }: DateNavigatorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = startOfDay(new Date());
  const viewingToday = isToday(currentDate);

  const handlePreviousDay = () => {
    const prevDay = subDays(currentDate, 1);
    // Set simulatedDate for past days
    onDateChange(prevDay);
  };

  const handleNextDay = () => {
    const nextDay = addDays(currentDate, 1);
    // If next day is today or future, go back to "today" view (simulatedDate = null)
    if (nextDay >= today) {
      onDateChange(null);
    } else {
      onDateChange(nextDay);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;

    const selected = startOfDay(date);
    if (isSameDay(selected, today) || selected > today) {
      // Selecting today or future - clear simulated date
      onDateChange(null);
    } else {
      // Selecting past date
      onDateChange(selected);
    }
    setCalendarOpen(false);
  };

  const handleTodayClick = () => {
    onDateChange(null);
    setCalendarOpen(false);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Previous Day Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={handlePreviousDay}
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      {/* Date Display with Calendar Picker */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors",
              "hover:bg-muted/50 active:bg-muted",
              !viewingToday && "bg-yellow-500/20 border border-yellow-500/30"
            )}
          >
            <Calendar className={cn(
              "w-4 h-4",
              viewingToday ? "text-muted-foreground" : "text-yellow-500"
            )} />
            <div className="text-left">
              <span className={cn(
                "text-xs font-mono uppercase tracking-widest block",
                viewingToday ? "text-muted-foreground" : "text-yellow-500"
              )}>
                {viewingToday ? format(currentDate, 'EEEE, MMMM d') : format(currentDate, 'EEE, MMM d')}
              </span>
              {!viewingToday && (
                <span className="text-[10px] text-yellow-500 font-bold uppercase">
                  Historical View
                </span>
              )}
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-card border-muted" align="center">
          <div className="p-2 border-b border-muted">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={handleTodayClick}
            >
              Back to Today
            </Button>
          </div>
          <CalendarComponent
            mode="single"
            selected={currentDate}
            onSelect={handleCalendarSelect}
            disabled={(date) => date > today}
            initialFocus
            className="rounded-md"
          />
        </PopoverContent>
      </Popover>

      {/* Next Day Button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8",
          viewingToday
            ? "text-muted-foreground/30 cursor-not-allowed"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={handleNextDay}
        disabled={viewingToday}
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );
}
