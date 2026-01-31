import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Scale, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";

function getCurrentTimeStr(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

interface DailyStepProps {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  logs: any[];
  logType: 'morning' | 'pre-practice' | 'post-practice' | 'before-bed';
  addLog: (log: { weight: number; date: Date; type: string; duration?: number; sleepHours?: number }) => void;
  updateLog: (id: string, updates: { weight?: number; date?: Date; duration?: number; sleepHours?: number }) => void;
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
  const [logTime, setLogTime] = useState(getCurrentTimeStr());
  const [duration, setDuration] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [isLogging, setIsLogging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const needsDuration = logType === 'post-practice';
  const needsSleep = logType === 'morning';

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
      const logDate = new Date(today);
      const [h, m] = logTime.split(':').map(Number);
      logDate.setHours(h, m, 0, 0);

      const logData: any = {
        weight: parseFloat(weight),
        date: logDate,
        type: logType,
      };
      if (needsDuration && duration) logData.duration = parseInt(duration, 10);
      if (needsSleep && sleepHours) logData.sleepHours = parseFloat(sleepHours);

      addLog(logData);
      setWeight('');
      setLogTime(getCurrentTimeStr());
      setDuration('');
      setSleepHours('');
      setIsLogging(false);
    }
  };

  const handleEdit = () => {
    setWeight(todayLog.weight.toString());
    const d = new Date(todayLog.date);
    setLogTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
    setDuration(todayLog.duration ? todayLog.duration.toString() : '');
    setSleepHours(todayLog.sleepHours ? todayLog.sleepHours.toString() : '');
    setIsEditing(true);
  };

  const handleUpdate = () => {
    if (weight && todayLog) {
      const updates: any = { weight: parseFloat(weight) };
      if (logTime) {
        const [h, m] = logTime.split(':').map(Number);
        const newDate = new Date(todayLog.date);
        newDate.setHours(h, m, 0, 0);
        updates.date = newDate;
      }
      if (needsDuration && duration) updates.duration = parseInt(duration, 10);
      if (needsSleep && sleepHours) updates.sleepHours = parseFloat(sleepHours);
      updateLog(todayLog.id, updates);
      setWeight('');
      setLogTime(getCurrentTimeStr());
      setDuration('');
      setSleepHours('');
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setWeight('');
    setLogTime(getCurrentTimeStr());
    setDuration('');
    setSleepHours('');
    setIsLogging(false);
    setIsEditing(false);
  };

  const isSaveDisabled = !weight ||
    (needsDuration && (!duration || parseInt(duration, 10) <= 0)) ||
    (needsSleep && (!sleepHours || parseFloat(sleepHours) <= 0));

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
                {needsDuration && todayLog.duration && (
                  <span className="text-[10px] text-orange-500 font-bold">{todayLog.duration}min</span>
                )}
                {needsSleep && todayLog.sleepHours && (
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
            ) : (isLogging || isEditing) ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Weight"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-24 h-10 font-mono"
                    autoFocus
                    aria-label={`Enter ${title} weight in pounds`}
                  />
                  <span className="text-sm text-muted-foreground" aria-hidden="true">lbs</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      value={logTime}
                      onChange={(e) => setLogTime(e.target.value)}
                      className="h-8 text-xs font-mono bg-background border border-border rounded px-1.5"
                    />
                    <button
                      type="button"
                      onClick={() => setLogTime(getCurrentTimeStr())}
                      className="text-[9px] text-primary font-bold px-1.5 py-1 rounded border border-primary/30 hover:bg-primary/10"
                    >
                      Now
                    </button>
                  </div>
                </div>

                {needsDuration && (
                  <div className="flex items-center gap-2 p-2 rounded border border-orange-500/40 bg-orange-500/5">
                    <span className="text-[10px] text-orange-500 font-bold whitespace-nowrap">Duration *</span>
                    <Input
                      type="number"
                      placeholder="min"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-20 h-8 text-xs font-mono border-orange-500/30"
                    />
                    <span className="text-[10px] text-muted-foreground">min</span>
                    <span className="text-[9px] text-orange-500/70 ml-auto">for loss/hr</span>
                  </div>
                )}

                {needsSleep && (
                  <div className="flex items-center gap-2 p-2 rounded border border-purple-500/40 bg-purple-500/5">
                    <span className="text-[10px] text-purple-500 font-bold whitespace-nowrap">Sleep *</span>
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="hrs"
                      value={sleepHours}
                      onChange={(e) => setSleepHours(e.target.value)}
                      className="w-20 h-8 text-xs font-mono border-purple-500/30"
                    />
                    <span className="text-[10px] text-muted-foreground">hrs</span>
                    <span className="text-[9px] text-purple-500/70 ml-auto">for drift/hr</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={isEditing ? handleUpdate : handleSubmit}
                    className="h-10"
                    disabled={isSaveDisabled}
                    aria-label={isEditing ? `Update ${title} weight` : `Save ${title} weight`}
                  >
                    {isEditing ? 'Update' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancel} className="h-10">
                    Cancel
                  </Button>
                </div>
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
