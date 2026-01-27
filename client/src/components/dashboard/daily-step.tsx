import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Scale, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";

interface DailyStepProps {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  logs: any[];
  logType: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';
  addLog: (log: { weight: number; date: Date; type: string }) => void;
  updateLog: (id: string, updates: { weight: number }) => void;
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
  addLog,
  updateLog,
  targetWeight,
  simulatedDate
}: DailyStepProps) {
  const [weight, setWeight] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

  const handleSubmit = () => {
    if (weight) {
      // Use simulated date if available, with appropriate time for log type
      const logDate = new Date(today);
      if (logType === 'morning') logDate.setHours(7, 0, 0, 0);
      else if (logType === 'pre-practice') logDate.setHours(15, 0, 0, 0);
      else if (logType === 'post-practice') logDate.setHours(17, 0, 0, 0);
      else if (logType === 'before-bed') logDate.setHours(22, 0, 0, 0);

      addLog({
        weight: parseFloat(weight),
        date: logDate,
        type: logType,
      });
      setWeight('');
      setIsLogging(false);
    }
  };

  const handleEdit = () => {
    setWeight(todayLog.weight.toString());
    setIsEditing(true);
  };

  const handleUpdate = () => {
    if (weight && todayLog) {
      updateLog(todayLog.id, { weight: parseFloat(weight) });
      setWeight('');
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setWeight('');
    setIsLogging(false);
    setIsEditing(false);
  };

  return (
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

            {isComplete && !isEditing ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-lg text-primary">{todayLog.weight} lbs</span>
                <span className="text-xs text-muted-foreground">at {format(new Date(todayLog.date), 'h:mm a')}</span>
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
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (isLogging || isEditing) ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Weight"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-24 h-10 font-mono"
                  autoFocus
                />
                <span className="text-sm text-muted-foreground">lbs</span>
                <Button size="sm" onClick={isEditing ? handleUpdate : handleSubmit} className="h-10">
                  {isEditing ? 'Update' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} className="h-10">
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsLogging(true)}
                className="h-10 min-w-[120px]"
              >
                <Scale className="w-3 h-3 mr-1" />
                Log Weight
              </Button>
            )}

            {!isComplete && !isLogging && (
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
}
