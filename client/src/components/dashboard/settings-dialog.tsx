import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Weight, Target, Trash2, LogOut, Sun, Moon, Monitor, Calendar } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { WEIGHT_CLASSES, PROTOCOL_NAMES, PROTOCOLS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  profile: any;
  updateProfile: (updates: any) => void;
  resetData: () => Promise<void>;
}

export function SettingsDialog({ profile, updateProfile, resetData }: SettingsDialogProps) {
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = async () => {
    await resetData();
    setShowResetConfirm(false);
    window.location.href = '/onboarding';
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground">
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[90%] rounded-xl bg-card border-muted max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading uppercase italic text-xl">Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="dates">Dates</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Weight (lbs)</Label>
              <div className="relative">
                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="number"
                  value={profile.currentWeight || ''}
                  onChange={(e) => updateProfile({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                  className="pl-10 font-mono h-12"
                  placeholder="Enter weight"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Weight Class</Label>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                <Select
                  value={profile.targetWeightClass.toString()}
                  onValueChange={(v) => updateProfile({ targetWeightClass: parseInt(v) })}
                >
                  <SelectTrigger className="pl-10 font-mono h-12">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEIGHT_CLASSES.map(w => (
                      <SelectItem key={w} value={w.toString()}>{w} lbs</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Next Weigh-in Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="date"
                  className="pl-10 bg-muted/30 border-muted h-12"
                  value={format(new Date(profile.weighInDate), 'yyyy-MM-dd')}
                  onChange={(e) => updateProfile({ weighInDate: new Date(e.target.value) })}
                />
              </div>
              {(() => {
                const daysUntil = differenceInDays(new Date(profile.weighInDate), profile.simulatedDate || new Date());
                if (daysUntil < 0) {
                  return <p className="text-[10px] text-yellow-500">Weigh-in has passed. Update for your next competition.</p>;
                } else if (daysUntil === 0) {
                  return <p className="text-[10px] text-primary font-medium">Competition day!</p>;
                } else if (daysUntil <= 5) {
                  return <p className="text-[10px] text-muted-foreground">{daysUntil} day{daysUntil > 1 ? 's' : ''} until weigh-in - cut week protocol active</p>;
                } else {
                  return <p className="text-[10px] text-muted-foreground">{daysUntil} days until weigh-in - maintenance mode until cut week</p>;
                }
              })()}
            </div>
            <div className="space-y-2 pt-2 border-t border-muted">
              <Label>Protocol</Label>
              <Select
                value={profile.protocol}
                onValueChange={(v) => updateProfile({ protocol: v as any })}
              >
                <SelectTrigger className="font-mono h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PROTOCOLS.BODY_COMP}>{PROTOCOL_NAMES[PROTOCOLS.BODY_COMP]}</SelectItem>
                  <SelectItem value={PROTOCOLS.MAKE_WEIGHT}>{PROTOCOL_NAMES[PROTOCOLS.MAKE_WEIGHT]}</SelectItem>
                  <SelectItem value={PROTOCOLS.HOLD_WEIGHT}>{PROTOCOL_NAMES[PROTOCOLS.HOLD_WEIGHT]}</SelectItem>
                  <SelectItem value={PROTOCOLS.BUILD}>{PROTOCOL_NAMES[PROTOCOLS.BUILD]}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {profile.protocol === PROTOCOLS.BODY_COMP && 'Aggressive fat loss - 0 protein until day before'}
                {profile.protocol === PROTOCOLS.MAKE_WEIGHT && 'Standard in-season cut - water loading protocol'}
                {profile.protocol === PROTOCOLS.HOLD_WEIGHT && 'At walk-around weight - minimal cutting'}
                {profile.protocol === PROTOCOLS.BUILD && 'Off-season muscle gain - no weight cutting'}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="dates" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Demo Mode
                <span className="text-[10px] text-muted-foreground font-normal">(Test different days)</span>
              </Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Simulate a different day to see how the app behaves on Friday, Saturday, etc.
              </p>
              <div className="flex gap-2">
                <Input
                  type="date"
                  className="bg-muted/30 border-muted flex-1 h-12"
                  value={profile.simulatedDate ? format(new Date(profile.simulatedDate), 'yyyy-MM-dd') : ''}
                  onChange={(e) => updateProfile({ simulatedDate: e.target.value ? new Date(e.target.value) : null })}
                />
                {profile.simulatedDate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateProfile({ simulatedDate: null })}
                    className="h-12"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                  // Calculate the date for each day of this week
                  const today = new Date();
                  const currentDay = today.getDay();
                  const targetDay = i === 6 ? 0 : i + 1; // Convert to JS day (0=Sun, 1=Mon, etc)
                  const diff = targetDay - currentDay;
                  const targetDate = new Date(today);
                  targetDate.setDate(today.getDate() + diff);

                  return (
                    <Button
                      key={day}
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-8 px-3"
                      onClick={() => updateProfile({ simulatedDate: targetDate })}
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="theme" className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Appearance</Label>
              <p className="text-xs text-muted-foreground">
                Choose how the app looks. System will follow your device settings.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                    theme === "light"
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-muted-foreground/50"
                  )}
                >
                  <Sun className={cn("w-6 h-6", theme === "light" ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-xs font-medium">Light</span>
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                    theme === "dark"
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-muted-foreground/50"
                  )}
                >
                  <Moon className={cn("w-6 h-6", theme === "dark" ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-xs font-medium">Dark</span>
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                    theme === "system"
                      ? "border-primary bg-primary/10"
                      : "border-muted hover:border-muted-foreground/50"
                  )}
                >
                  <Monitor className={cn("w-6 h-6", theme === "system" ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-xs font-medium">System</span>
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-4 py-4">
            {user && (
              <div className="space-y-3 pb-4 border-b border-muted">
                <h4 className="font-bold text-sm">Account</h4>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="w-full h-12"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="font-bold text-sm">Reset All Data</h4>
              <p className="text-xs text-muted-foreground">
                This will delete all your weight logs, tracking data, and profile settings. You will need to go through onboarding again.
              </p>

              {!showResetConfirm ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full h-12"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Reset All Data
                </Button>
              ) : (
                <div className="space-y-2 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                  <p className="text-xs font-bold text-destructive">Are you sure? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleReset}
                      className="flex-1 h-10"
                    >
                      Yes, Reset Everything
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 h-10"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
