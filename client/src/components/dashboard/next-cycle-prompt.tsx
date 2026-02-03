import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Calendar, Clock, ChevronRight, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { WEIGHT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ProtocolWizard } from "@/components/protocol-wizard";
import type { Protocol } from "@/lib/store";

interface NextCyclePromptProps {
  profile: {
    weighInDate: Date;
    targetWeightClass: number;
    protocol: string;
    currentWeight: number;
  };
  updateProfile: (updates: any) => void;
  daysUntilWeighIn: number;
}

export function NextCyclePrompt({ profile, updateProfile, daysUntilWeighIn }: NextCyclePromptProps) {
  const [step, setStep] = useState<'intro' | 'details' | 'protocol'>('intro');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('07:00');
  const [nextWeightClass, setNextWeightClass] = useState(String(profile.targetWeightClass));
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

  const handleNextToProtocol = () => {
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
    setStep('protocol');
  };

  const handleProtocolComplete = (protocol: Protocol) => {
    const [year, month, day] = nextDate.split('-').map(Number);
    const localDate = new Date(year, month - 1, day, 12, 0, 0);

    updateProfile({
      weighInDate: localDate,
      weighInTime: nextTime,
      targetWeightClass: parseFloat(nextWeightClass),
      protocol,
    });

    localStorage.removeItem('pwm-next-cycle-dismissed');
    toast({ title: "New cycle started!", description: `Weigh-in set for ${format(localDate, 'MMM d')}` });
  };

  return (
    <Card className="mb-3 border-cyan-500/30 bg-cyan-500/5">
      <CardContent className="p-4">
        {/* Step 1: Intro */}
        {step === 'intro' && (
          <>
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
              Ready for your next meet? Let's set up your next cycle.
            </p>
            <Button
              onClick={() => setStep('details')}
              className="w-full h-10 bg-cyan-500 hover:bg-cyan-600 text-white font-bold"
            >
              Schedule Next Competition
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <button
              onClick={handleDismiss}
              className="w-full text-[10px] text-muted-foreground/60 hover:text-muted-foreground mt-2"
            >
              Stay in Recovery — remind me tomorrow
            </button>
          </>
        )}

        {/* Step 2: Date, Time, Weight Class */}
        {step === 'details' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setStep('intro')} className="p-1 rounded hover:bg-muted/50">
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <h3 className="font-heading uppercase italic text-sm text-cyan-500">Next Competition</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">
                  Weigh-in Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="date"
                    className="pl-10 bg-muted/30 border-muted h-10"
                    value={nextDate}
                    onChange={(e) => {
                      setNextDate(e.target.value);
                      // Close native date picker after selection
                      e.target.blur();
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">
                  Weigh-in Time
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <Select value={nextTime} onValueChange={setNextTime}>
                    <SelectTrigger className="pl-10 bg-muted/30 border-muted h-10 font-mono">
                      <SelectValue>
                        {(() => {
                          const [h, m] = nextTime.split(':').map(Number);
                          const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
                          const ampm = h < 12 ? 'AM' : 'PM';
                          return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {Array.from({ length: 48 }, (_, i) => {
                        const hour = Math.floor(i / 2);
                        const min = i % 2 === 0 ? '00' : '30';
                        const value = `${hour.toString().padStart(2, '0')}:${min}`;
                        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                        const ampm = hour < 12 ? 'AM' : 'PM';
                        const label = `${displayHour}:${min} ${ampm}`;
                        return <SelectItem key={value} value={value}>{label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

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

              <Button
                onClick={handleNextToProtocol}
                className="w-full h-10 bg-cyan-500 hover:bg-cyan-600 text-white font-bold"
              >
                Choose Protocol
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Protocol Wizard */}
        {step === 'protocol' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setStep('details')} className="p-1 rounded hover:bg-muted/50">
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <h3 className="font-heading uppercase italic text-sm text-cyan-500">Choose Your Protocol</h3>
            </div>
            <ProtocolWizard
              currentWeight={profile.currentWeight}
              targetWeightClass={parseFloat(nextWeightClass)}
              onComplete={handleProtocolComplete}
              onBack={() => setStep('details')}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
