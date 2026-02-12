import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface NextCyclePromptProps {
  profile: {
    weighInDate: Date;
    targetWeightClass: number;
    protocol: string;
    currentWeight: number;
    weighInCleared?: boolean;
    nextCyclePromptDismissed?: boolean;
  };
  updateProfile: (updates: any) => void;
  daysUntilWeighIn: number;
}

export function NextCyclePrompt({ profile, updateProfile, daysUntilWeighIn }: NextCyclePromptProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [nextDate, setNextDate] = useState('');

  // Only show once after competition day (daysUntilWeighIn < 0 means comp has passed)
  // Don't show if user already dismissed it or if weighIn is cleared (they already chose "not right now")
  if (profile.nextCyclePromptDismissed) return null;
  if (profile.weighInCleared) return null;
  if (daysUntilWeighIn >= 0) return null;

  const handleSetDate = () => {
    if (!nextDate) {
      toast({ title: "Pick a date", description: "Select your next weigh-in date" });
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
      weighInCleared: false,
      nextCyclePromptDismissed: true,
    });

    toast({ title: "Weigh-in scheduled!", description: `Set for ${format(localDate, 'MMM d')}` });
  };

  const handleNotRightNow = () => {
    // Clear the weigh-in and dismiss the prompt permanently
    updateProfile({
      weighInCleared: true,
      nextCyclePromptDismissed: true,
    });
  };

  return (
    <Card className="mb-3 border-cyan-500/30 bg-cyan-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-500" />
            <h3 className="text-sm font-bold text-cyan-500">What's next?</h3>
          </div>
        </div>

        {!showDatePicker ? (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Competition's done. Set your next weigh-in date when you're ready.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowDatePicker(true)}
                className="flex-1 h-9 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs"
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Set next weigh-in
              </Button>
              <Button
                onClick={handleNotRightNow}
                variant="outline"
                className="h-9 text-xs text-muted-foreground border-muted"
              >
                Not right now
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Pick your next weigh-in date. You can always change it later in Settings.
            </p>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-10 bg-muted/30 border-muted h-9"
                  value={nextDate}
                  onChange={(e) => {
                    setNextDate(e.target.value);
                    e.target.blur();
                  }}
                />
              </div>
              <Button
                onClick={handleSetDate}
                disabled={!nextDate}
                className="h-9 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs px-4"
              >
                Set
              </Button>
              <button
                onClick={() => setShowDatePicker(false)}
                className="p-1.5 rounded hover:bg-muted/50"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
