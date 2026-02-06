import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Scale, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { SwipeableRow } from "@/components/ui/swipeable-row";
import { useToast } from "@/hooks/use-toast";

interface DailyStepProps {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  logs: any[];
  logType: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';
  addLog: (log: { weight: number; date: Date; type: string; duration?: number; sleepHours?: number }) => void;
  updateLog: (id: string, updates: { weight?: number; date?: Date; duration?: number; sleepHours?: number }) => void;
  deleteLog?: (id: string) => void;
  targetWeight: number;
  simulatedDate?: Date | null;
}

export function DailyStep({
  step,
  title,
  description,
  icon: Icon,
  logs,
  logType,
  deleteLog,
  targetWeight,
  simulatedDate
}: DailyStepProps) {
  const { toast } = useToast();
  // Check if already logged today (use simulated date if available)
  const today = simulatedDate || new Date();
  const todayLog = logs.find(log => {
    const logDate = new Date(log.date);
    return log.type === logType &&
           logDate.getFullYear() === today.getFullYear() &&
           logDate.getMonth() === today.getMonth() &&
           logDate.getDate() === today.getDate();
  });

  const isComplete = !!todayLog;

  const handleLog = () => {
    // Open FAB for new entry of this type
    window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { type: logType } }));
  };

  const handleEdit = () => {
    // Open FAB in edit mode with existing log data
    window.dispatchEvent(new CustomEvent('open-quick-log', { detail: { editLog: todayLog } }));
  };

  const handleDelete = () => {
    if (deleteLog && todayLog?.id) {
      deleteLog(todayLog.id);
      toast({
        title: `${title} deleted`,
        description: `${todayLog.weight.toFixed(1)} lbs removed`,
      });
    }
  };

  // Wrap completed cards in SwipeableRow for delete gesture
  const cardContent = (
    <Card className={cn(
      "border-muted transition-all",
      isComplete && "bg-primary/5 border-primary/30"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
            isComplete ? "bg-primary" : "bg-muted/50"
          )}>
            {isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-black" />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">{step}</span>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn("w-4 h-4", isComplete ? "text-primary" : "text-muted-foreground")} />
              <h3 className={cn("font-bold", isComplete && "text-primary")}>{title}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{description}</p>

            {isComplete ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-lg text-primary">{todayLog.weight} lbs</span>
                <span className="text-xs text-muted-foreground">at {format(new Date(todayLog.date), 'h:mm a')}</span>
                {logType === 'post-practice' && todayLog.duration && (
                  <span className="text-[10px] text-orange-500 font-bold">{todayLog.duration}min</span>
                )}
                {logType === 'morning' && todayLog.sleepHours && (
                  <span className="text-[10px] text-purple-500 font-bold">{todayLog.sleepHours}hr sleep</span>
                )}
                {targetWeight && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    todayLog.weight <= targetWeight ? "bg-green-500/20 text-green-500" :
                    todayLog.weight <= targetWeight + 2 ? "bg-yellow-500/20 text-yellow-500" :
                    "bg-destructive/20 text-destructive"
                  )}>
                    {todayLog.weight <= targetWeight ? "ON TARGET" :
                     `+${(todayLog.weight - targetWeight).toFixed(1)} lbs`}
                  </span>
                )}
                <button
                  onClick={handleEdit}
                  className="ml-auto p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit weight"
                  aria-label={`Edit ${title} weight`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLog}
                className="h-12 min-w-[120px] min-h-[48px]"
              >
                <Scale className="w-3 h-3 mr-1" />
                Log Weight
              </Button>
            )}

            {!isComplete && (
              <div className="mt-2 space-y-1">
                {targetWeight && (
                  <p className="text-[10px] text-muted-foreground">
                    Target: {targetWeight.toFixed(1)} lbs
                  </p>
                )}
                <p className="text-[10px] text-yellow-500 font-medium">
                  {logType === 'morning' && "Log morning weight to track overnight drift"}
                  {logType === 'pre-practice' && "Log pre-practice to measure session loss"}
                  {logType === 'post-practice' && "Log post-practice to see sweat rate"}
                  {logType === 'before-bed' && "Log before bed to predict tomorrow's weight"}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Only wrap in SwipeableRow if logged and delete is available
  if (isComplete && deleteLog) {
    return (
      <SwipeableRow onDelete={handleDelete}>
        {cardContent}
      </SwipeableRow>
    );
  }

  return cardContent;
}
