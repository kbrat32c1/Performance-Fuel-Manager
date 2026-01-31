import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Weight, Target, Trash2, LogOut, Sun, Moon, Monitor, Calendar, Clock, Check, X, Bell, BellOff, Share2, Copy, RefreshCw, Link2 } from "lucide-react";
import { format, differenceInDays, startOfDay, parseISO } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { WEIGHT_CLASSES, PROTOCOL_NAMES, PROTOCOLS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  getPermissionState,
  requestPermission as requestNotifPermission,
  getTimeOptions,
  type NotificationPreferences,
} from "@/lib/notifications";

interface SettingsDialogProps {
  profile: any;
  updateProfile: (updates: any) => void;
  resetData: () => Promise<void>;
  clearLogs: () => Promise<void>;
}

export function SettingsDialog({ profile, updateProfile, resetData, clearLogs }: SettingsDialogProps) {
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWeightClassConfirm, setShowWeightClassConfirm] = useState(false);
  const [open, setOpen] = useState(false);

  // Local state for pending changes
  const [pendingChanges, setPendingChanges] = useState<any>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  // Reset pending changes when dialog opens
  useEffect(() => {
    if (open) {
      setPendingChanges({});
      setHasChanges(false);
      setShowWeightClassConfirm(false);
      setActiveTab('profile');
    }
  }, [open]);

  // Get the current value (pending or actual)
  const getValue = (key: string) => {
    return pendingChanges[key] !== undefined ? pendingChanges[key] : profile[key];
  };

  // Update pending changes
  const handleChange = (updates: any) => {
    setPendingChanges((prev: any) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  // Check if weight class has changed
  const newWeightClass = pendingChanges.targetWeightClass;
  const oldWeightClass = profile.targetWeightClass;
  const weightClassChanged = newWeightClass !== undefined &&
    Number(newWeightClass) !== Number(oldWeightClass);

  // Save all changes
  const handleSave = () => {
    if (hasChanges) {
      // If weight class changed, show confirmation dialog
      if (weightClassChanged) {
        setShowWeightClassConfirm(true);
        return;
      }
      updateProfile(pendingChanges);
    }
    setOpen(false);
  };

  // Save with clear logs option
  const handleSaveWithClearLogs = async () => {
    await clearLogs();
    updateProfile(pendingChanges);
    setShowWeightClassConfirm(false);
    setOpen(false);
  };

  // Save and keep logs
  const handleSaveKeepLogs = () => {
    updateProfile(pendingChanges);
    setShowWeightClassConfirm(false);
    setOpen(false);
  };

  // Cancel and discard changes
  const handleCancel = () => {
    setPendingChanges({});
    setHasChanges(false);
    setOpen(false);
  };

  const handleReset = async () => {
    await resetData();
    setShowResetConfirm(false);
    setOpen(false);
    window.location.href = '/onboarding';
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  // Calculate days until weigh-in using pending or actual values
  const weighInDate = getValue('weighInDate');
  const simulatedDate = getValue('simulatedDate');
  const daysUntil = differenceInDays(
    startOfDay(new Date(weighInDate)),
    startOfDay(simulatedDate || new Date())
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground">
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="w-[90%] max-w-md rounded-xl bg-card border-muted max-h-[75vh] overflow-y-auto flex flex-col !top-[10%] !translate-y-0"
        onPointerDownOutside={(e) => {
          // Prevent dialog from closing when clicking Select dropdown (rendered in portal)
          const target = e.target as HTMLElement;
          if (target?.closest?.('[role="listbox"], [role="option"], [data-radix-select-viewport]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-heading uppercase italic text-xl">Settings</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-2 flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="dates">Dates</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 py-4 min-h-[340px]">
            <div className="space-y-2">
              <Label>Current Weight (lbs)</Label>
              <div className="relative">
                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="number"
                  value={getValue('currentWeight') || ''}
                  onChange={(e) => handleChange({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
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
                  value={getValue('targetWeightClass').toString()}
                  onValueChange={(v) => handleChange({ targetWeightClass: parseInt(v) })}
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
                  value={format(new Date(weighInDate), 'yyyy-MM-dd')}
                  onChange={(e) => {
                    if (e.target.value) {
                      // Parse as local date to avoid timezone shift
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      const localDate = new Date(year, month - 1, day, 12, 0, 0); // noon to avoid DST issues
                      handleChange({ weighInDate: localDate });
                    }
                  }}
                />
              </div>
              {(() => {
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
            <div className="space-y-2">
              <Label>Weigh-in Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                <Select
                  value={getValue('weighInTime') || '07:00'}
                  onValueChange={(v) => handleChange({ weighInTime: v })}
                >
                  <SelectTrigger className="pl-10 font-mono h-12">
                    <SelectValue placeholder="Select time">
                      {(() => {
                        const val = getValue('weighInTime') || '07:00';
                        const [h, m] = val.split(':').map(Number);
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
              <p className="text-[10px] text-muted-foreground">What time do you step on the scale?</p>
            </div>
            <div className="space-y-2 pt-2 border-t border-muted">
              <Label>Protocol</Label>
              <Select
                value={getValue('protocol')}
                onValueChange={(v) => handleChange({ protocol: v as any })}
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
                {getValue('protocol') === PROTOCOLS.BODY_COMP && 'Aggressive fat loss - 0 protein until day before'}
                {getValue('protocol') === PROTOCOLS.MAKE_WEIGHT && 'Standard in-season cut - water loading protocol'}
                {getValue('protocol') === PROTOCOLS.HOLD_WEIGHT && 'At walk-around weight - minimal cutting'}
                {getValue('protocol') === PROTOCOLS.BUILD && 'Off-season muscle gain - no weight cutting'}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="dates" className="space-y-4 py-4 min-h-[340px]">
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
                  value={simulatedDate ? format(new Date(simulatedDate), 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      // Parse as local date to avoid timezone shift
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      const localDate = new Date(year, month - 1, day, 12, 0, 0);
                      handleChange({ simulatedDate: localDate });
                    } else {
                      handleChange({ simulatedDate: null });
                    }
                  }}
                />
                {simulatedDate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleChange({ simulatedDate: null })}
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
                      onClick={() => handleChange({ simulatedDate: targetDate })}
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4 py-4 min-h-[340px]">
            <AlertsTab />
          </TabsContent>

          <TabsContent value="theme" className="space-y-4 py-4 min-h-[340px]">
            <div className="space-y-3">
              <Label>Appearance</Label>
              <p className="text-xs text-muted-foreground">
                Choose how the app looks. Changes apply instantly. System follows your device settings.
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

          <TabsContent value="data" className="space-y-4 py-4 min-h-[340px]">
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

            {user && <ShareWithCoachSection userId={user.id} />}

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

        {/* Weight Class Change Confirmation */}
        {showWeightClassConfirm && (
          <div className="absolute inset-0 bg-background/95 flex items-center justify-center p-4 rounded-xl z-50">
            <div className="space-y-4 w-full max-w-sm">
              <div className="space-y-2 text-center">
                <h4 className="font-bold text-lg">Weight Class Changed</h4>
                <p className="text-sm text-muted-foreground">
                  You changed your weight class from {oldWeightClass} lbs to {newWeightClass} lbs.
                </p>
                <p className="text-sm text-muted-foreground">
                  Would you like to clear your existing weight logs and start fresh?
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={handleSaveWithClearLogs}
                  className="w-full h-12"
                  variant="destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Logs & Save
                </Button>
                <Button
                  onClick={handleSaveKeepLogs}
                  className="w-full h-12"
                  variant="outline"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Keep Logs & Save
                </Button>
                <Button
                  onClick={() => setShowWeightClassConfirm(false)}
                  className="w-full h-12"
                  variant="ghost"
                >
                  <X className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Save/Cancel Footer — only show on tabs with pending changes */}
        {(activeTab === 'profile' || activeTab === 'dates') && (
          <DialogFooter className="flex gap-2 pt-4 border-t border-muted mt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1 h-12"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 h-12"
              disabled={!hasChanges}
            >
              <Check className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Alerts Tab ──────────────────────────────────────────────────────
function AlertsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPrefs());
  const [permission, setPermission] = useState(getPermissionState());
  const timeOptions = getTimeOptions();

  const update = (changes: Partial<NotificationPreferences>) => {
    const next = { ...prefs, ...changes };
    setPrefs(next);
    saveNotificationPrefs(next);
  };

  const handleEnable = async () => {
    if (permission === 'default' || permission === 'unsupported') {
      const result = await requestNotifPermission();
      setPermission(result === 'unsupported' ? 'unsupported' : result);
      if (result === 'granted') {
        update({ enabled: true });
      }
    } else if (permission === 'granted') {
      update({ enabled: !prefs.enabled });
    }
  };

  const isSupported = permission !== 'unsupported';
  const isDenied = permission === 'denied';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          {prefs.enabled ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
          Weigh-in Reminders
        </Label>
        <p className="text-xs text-muted-foreground">
          Get notified when it's time to log your weight. Reminders only fire when the app is open.
        </p>
      </div>

      {!isSupported && (
        <p className="text-xs text-orange-500">
          Notifications are not supported in this browser.
        </p>
      )}

      {isDenied && (
        <p className="text-xs text-orange-500">
          Notifications are blocked. Enable them in your browser settings to use reminders.
        </p>
      )}

      <Button
        variant={prefs.enabled ? "default" : "outline"}
        onClick={handleEnable}
        disabled={isDenied || !isSupported}
        className="w-full h-10"
      >
        {prefs.enabled ? "Reminders On" : "Enable Reminders"}
      </Button>

      {prefs.enabled && permission === 'granted' && (
        <div className="space-y-3 pt-2 border-t border-muted">
          {/* Morning */}
          <ReminderRow
            label="Morning"
            icon={<Sun className="w-4 h-4 text-yellow-500" />}
            enabled={prefs.morningReminder}
            time={prefs.morningTime}
            onToggle={(v) => update({ morningReminder: v })}
            onTimeChange={(v) => update({ morningTime: v })}
            timeOptions={timeOptions}
          />

          {/* Pre-Practice */}
          <ReminderRow
            label="Pre-Practice"
            icon={<Clock className="w-4 h-4 text-blue-500" />}
            enabled={prefs.prePracticeReminder}
            time={prefs.prePracticeTime}
            onToggle={(v) => update({ prePracticeReminder: v })}
            onTimeChange={(v) => update({ prePracticeTime: v })}
            timeOptions={timeOptions}
          />

          {/* Before Bed */}
          <ReminderRow
            label="Before Bed"
            icon={<Moon className="w-4 h-4 text-purple-500" />}
            enabled={prefs.beforeBedReminder}
            time={prefs.beforeBedTime}
            onToggle={(v) => update({ beforeBedReminder: v })}
            onTimeChange={(v) => update({ beforeBedTime: v })}
            timeOptions={timeOptions}
          />
        </div>
      )}
    </div>
  );
}

function ReminderRow({ label, icon, enabled, time, onToggle, onTimeChange, timeOptions }: {
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  time: string;
  onToggle: (v: boolean) => void;
  onTimeChange: (v: string) => void;
  timeOptions: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onToggle(!enabled)}
        className={cn(
          "flex items-center gap-2 flex-1 text-left py-2 px-3 rounded-lg transition-colors",
          enabled ? "bg-primary/10" : "bg-muted/30 opacity-50"
        )}
      >
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </button>
      {enabled && (
        <Select value={time} onValueChange={onTimeChange}>
          <SelectTrigger className="w-[110px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-[200px] z-[100]">
            {timeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ── Share with Coach ────────────────────────────────────────────────
function ShareWithCoachSection({ userId }: { userId: string }) {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Load current share token on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('share_token')
        .eq('user_id', userId)
        .single();
      setShareToken(data?.share_token || null);
      setLoading(false);
    })();
  }, [userId]);

  const shareUrl = shareToken ? `${window.location.origin}/coach/${shareToken}` : null;

  const enableSharing = async () => {
    const token = crypto.randomUUID();
    const { error } = await supabase
      .from('profiles')
      .update({ share_token: token })
      .eq('user_id', userId);
    if (!error) {
      setShareToken(token);
      toast({ title: "Sharing enabled", description: "Copy the link to share with your coach" });
    } else {
      toast({ title: "Failed to enable sharing", description: "Please try again", variant: "destructive" });
    }
  };

  const disableSharing = async () => {
    const { error } = await supabase
      .from('profiles')
      .update({ share_token: null })
      .eq('user_id', userId);
    if (!error) {
      setShareToken(null);
      toast({ title: "Sharing disabled", description: "Your coach link is no longer active" });
    } else {
      toast({ title: "Failed to disable sharing", description: "Please try again", variant: "destructive" });
    }
  };

  const regenerateLink = async () => {
    const token = crypto.randomUUID();
    const { error } = await supabase
      .from('profiles')
      .update({ share_token: token })
      .eq('user_id', userId);
    if (!error) {
      setShareToken(token);
      toast({ title: "New link generated", description: "Previous link is now invalid" });
    } else {
      toast({ title: "Failed to generate new link", description: "Please try again", variant: "destructive" });
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Copy failed", description: "Try selecting and copying the link manually" });
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-3 pb-4 border-b border-muted">
      <div className="flex items-center gap-2">
        <Share2 className="w-4 h-4 text-primary" />
        <h4 className="font-bold text-sm">Share with Coach</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Generate a link your coach can use to view your weight data in real-time. No account needed.
      </p>

      {!shareToken ? (
        <Button variant="outline" size="sm" onClick={enableSharing} className="w-full h-10">
          <Link2 className="w-4 h-4 mr-2" />
          Enable Coach Sharing
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 bg-muted/30 border border-muted rounded-md px-3 py-2 text-xs font-mono truncate">
              {shareUrl}
            </div>
            <Button variant="outline" size="sm" onClick={copyLink} className="h-auto px-3">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={regenerateLink} className="flex-1 h-8 text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />
              New Link
            </Button>
            <Button variant="ghost" size="sm" onClick={disableSharing} className="flex-1 h-8 text-xs text-destructive hover:text-destructive">
              <X className="w-3 h-3 mr-1" />
              Disable
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
