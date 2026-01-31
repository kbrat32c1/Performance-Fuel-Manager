import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { format, startOfDay } from "date-fns";
import { WEIGHT_CLASSES, PROTOCOL_NAMES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface NextCyclePromptProps {
  profile: {
    weighInDate: Date;
    targetWeightClass: number;
    protocol: string;
  };
  updateProfile: (updates: any) => void;
  daysUntilWeighIn: number;
}

export function NextCyclePrompt({ profile, updateProfile, daysUntilWeighIn }: NextCyclePromptProps) {
  const [expanded, setExpanded] = useState(false);
  const [nextDate, setNextDate] = useState('');
  const [nextWeightClass, setNextWeightClass] = useState(String(profile.targetWeightClass));
  const [nextProtocol, setNextProtocol] = useState(profile.protocol);
  const [isDismissed, setIsDismissed] = useState(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return localStorage.getItem('pwm-next-cycle-dismissed') === todayStr;
  });

  if (isDismissed) return null;
  if (daysUntilWeighIn >= 0) return null;

  const daysSince = Math.abs(daysUntilWeighIn);

  const handleDismiss = () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    localStorage.setItem('pwm-next-cycle-dismissed', todayStr);
    setIsDismissed(true);
  };

  const handleStartCycle = () => {
    if (!nextDate) {
      toast({ title: "Set a date", description: "Pick your next weigh-in date" });
      return;
    }

    const [year, month, day] = nextDate.split('-').map(Number);
    const localDate = new Date(year, month - 1, day, 12, 0, 0);

    if (localDate <= new Date()) {
      toast({ title: "Invalid date", description: "Weigh-in date must be in the future" });
      return;
    }

    updateProfile({
      weighInDate: localDate,
      targetWeightClass: parseFloat(nextWeightClass),
      protocol: nextProtocol,
    });

    // Clear dismissal so it doesn't interfere with new cycle
    localStorage.removeItem('pwm-next-cycle-dismissed');

    toast({ title: "New cycle started!", description: `Weigh-in set for ${format(localDate, 'MMM d')}` });
  };

  return (
    <Card className="mb-3 border-cyan-500/30 bg-cyan-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-cyan-500" />
            <h3 className="font-heading uppercase italic text-sm text-cyan-500">Competition Complete!</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {daysSince} day{daysSince !== 1 ? 's' : ''} ago
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Ready for your next meet? Set a new weigh-in date to start your next cycle.
        </p>

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 text-xs text-cyan-500 font-bold mb-2"
        >
          {expanded ? 'Hide' : 'Schedule Next Competition'}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-cyan-500/20">
            {/* Next weigh-in date */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">
                Next Weigh-in Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-10 bg-muted/30 border-muted h-10"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                />
              </div>
            </div>

            {/* Weight class */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">
                Weight Class
              </label>
              <Select value={nextWeightClass} onValueChange={setNextWeightClass}>
                <SelectTrigger className="bg-muted/30 border-muted h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHT_CLASSES.map((wc: number) => (
                    <SelectItem key={wc} value={String(wc)}>{wc} lbs</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Protocol */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">
                Protocol
              </label>
              <Select value={nextProtocol} onValueChange={setNextProtocol}>
                <SelectTrigger className="bg-muted/30 border-muted h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROTOCOL_NAMES).map(([key, name]) => (
                    <SelectItem key={key} value={key}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleStartCycle}
                className="flex-1 h-10 bg-cyan-500 hover:bg-cyan-600 text-white font-bold"
              >
                Start Next Cycle
              </Button>
            </div>
          </div>
        )}

        <button
          onClick={handleDismiss}
          className="w-full text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-1"
        >
          Stay in Recovery — remind me tomorrow
        </button>
      </CardContent>
    </Card>
  );
}
