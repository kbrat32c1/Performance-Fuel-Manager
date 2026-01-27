import { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeighInCountdownProps {
  weighInDate: Date;
  simulatedDate: Date | null;
  dayOfWeek: number;
  fridayTarget?: string; // e.g., "159-161 lbs"
}

export function WeighInCountdown({ weighInDate, simulatedDate, dayOfWeek, fridayTarget }: WeighInCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [hoursLeft, setHoursLeft] = useState<number>(0);

  useEffect(() => {
    const updateCountdown = () => {
      const now = simulatedDate || new Date();
      const weighIn = new Date(weighInDate);
      const diff = weighIn.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('WEIGH-IN TIME');
        setHoursLeft(0);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setHoursLeft(hours);

      if (hours < 48) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days}d ${hours % 24}h`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [weighInDate, simulatedDate]);

  // Day-specific messaging
  const getMessage = () => {
    if (dayOfWeek === 3) return "Peak water loading today";
    if (dayOfWeek === 4) return "Start flushing - cut water intake";
    if (dayOfWeek === 5) return "Final push to make weight";
    return "Until weigh-in";
  };

  // Color intensity increases as weigh-in approaches
  const getColors = () => {
    if (hoursLeft <= 24) return { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-500" };
    if (hoursLeft <= 48) return { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-500" };
    return { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-500" };
  };

  const colors = getColors();
  const isFriday = dayOfWeek === 5;

  return (
    <div className={cn(colors.bg, colors.border, "border rounded-lg p-3 mb-4")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isFriday ? (
            <AlertTriangle className={cn("w-5 h-5", colors.text)} />
          ) : (
            <Clock className={cn("w-5 h-5", colors.text)} />
          )}
          <div>
            <span className={cn("font-bold text-lg font-mono", colors.text)}>{timeLeft}</span>
            <span className="text-xs text-muted-foreground ml-2">until weigh-in</span>
          </div>
        </div>
        <span className={cn("text-xs font-medium", colors.text)}>{getMessage()}</span>
      </div>
      {/* Friday critical target info */}
      {isFriday && fridayTarget && (
        <div className="mt-2 pt-2 border-t border-orange-500/30 text-[11px] text-muted-foreground">
          Must be <strong className="text-orange-500">{fridayTarget}</strong> by evening for safe overnight cut.
        </div>
      )}
    </div>
  );
}
