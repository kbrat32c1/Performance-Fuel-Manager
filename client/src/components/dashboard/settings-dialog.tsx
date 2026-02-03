import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Weight, Target, Trash2, LogOut, Sun, Moon, Monitor, Calendar, Clock, Check, X, Bell, BellOff, Share2, Copy, RefreshCw, Link2, User, RotateCcw, HelpCircle, Utensils, Scale } from "lucide-react";
import { format, differenceInDays, startOfDay } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { WEIGHT_CLASSES, PROTOCOL_NAMES, PROTOCOLS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { resetDashboardTour } from "./tour";
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
  const [, navigate] = useLocation();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showWeightClassConfirm, setShowWeightClassConfirm] = useState(false);
  const [showProtocolSwitchConfirm, setShowProtocolSwitchConfirm] = useState<string | null>(null);
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

  // Is SPAR protocol selected?
  const isSparProtocol = (getValue('protocol') || profile.protocol) === '5';

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
        className="w-[92%] max-w-md rounded-xl bg-card border-muted max-h-[80vh] flex flex-col !top-[8%] !translate-y-0 p-0"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target?.closest?.('[role="listbox"], [role="option"], [data-radix-select-viewport]')) {
            e.preventDefault();
          }
        }}
      >
        {/* Fixed Header */}
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-muted shrink-0">
          <DialogTitle className="font-heading uppercase italic text-lg">Settings</DialogTitle>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={cn("grid w-full px-4 py-2 sticky top-0 bg-card z-10", isSparProtocol ? "grid-cols-4" : "grid-cols-5")}>
              <TabsTrigger value="profile" className="text-[11px]">Profile</TabsTrigger>
              {!isSparProtocol && <TabsTrigger value="schedule" className="text-[11px]">Schedule</TabsTrigger>}
              <TabsTrigger value="alerts" className="text-[11px]">Alerts</TabsTrigger>
              <TabsTrigger value="theme" className="text-[11px]">Theme</TabsTrigger>
              <TabsTrigger value="data" className="text-[11px]">Data</TabsTrigger>
            </TabsList>

            {/* ═══ PROFILE TAB ═══ */}
            <TabsContent value="profile" className="px-4 pb-4 space-y-3 mt-0">
              {/* Name Row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">First Name</Label>
                  <Input
                    type="text"
                    value={getValue('name') || ''}
                    onChange={(e) => handleChange({ name: e.target.value })}
                    className="h-10"
                    placeholder="First"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Last Name</Label>
                  <Input
                    type="text"
                    value={getValue('lastName') || ''}
                    onChange={(e) => handleChange({ lastName: e.target.value })}
                    className="h-10"
                    placeholder="Last"
                  />
                </div>
              </div>

              {/* Weight Row - Target Class only for competition protocols */}
              {isSparProtocol ? (
                <div className="space-y-1">
                  <Label className="text-[11px]">Current Weight</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={getValue('currentWeight') || ''}
                      onChange={(e) => handleChange({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                      className="h-10 font-mono pr-10"
                      placeholder="170"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">lbs</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Current Weight</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={getValue('currentWeight') || ''}
                        onChange={(e) => handleChange({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                        className="h-10 font-mono pr-10"
                        placeholder="170"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">lbs</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Target Class</Label>
                    <Select
                      value={getValue('targetWeightClass').toString()}
                      onValueChange={(v) => handleChange({ targetWeightClass: parseInt(v) })}
                    >
                      <SelectTrigger className="h-10 font-mono">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEIGHT_CLASSES.map(w => (
                          <SelectItem key={w} value={w.toString()}>{w} lbs</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Protocol */}
              <div className="space-y-1">
                <Label className="text-[11px]">Protocol</Label>
                <Select
                  value={getValue('protocol')}
                  onValueChange={(v) => {
                    // If switching protocols, show confirmation first
                    if (v !== profile.protocol) {
                      setShowProtocolSwitchConfirm(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PROTOCOLS.BODY_COMP}>{PROTOCOL_NAMES[PROTOCOLS.BODY_COMP]}</SelectItem>
                    <SelectItem value={PROTOCOLS.MAKE_WEIGHT}>{PROTOCOL_NAMES[PROTOCOLS.MAKE_WEIGHT]}</SelectItem>
                    <SelectItem value={PROTOCOLS.HOLD_WEIGHT}>{PROTOCOL_NAMES[PROTOCOLS.HOLD_WEIGHT]}</SelectItem>
                    <SelectItem value={PROTOCOLS.BUILD}>{PROTOCOL_NAMES[PROTOCOLS.BUILD]}</SelectItem>
                    <SelectItem value={PROTOCOLS.SPAR}>{PROTOCOL_NAMES[PROTOCOLS.SPAR]}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {getValue('protocol') === PROTOCOLS.BODY_COMP && 'Aggressive fat loss - fructose-only'}
                  {getValue('protocol') === PROTOCOLS.MAKE_WEIGHT && 'Weekly cut with water loading'}
                  {getValue('protocol') === PROTOCOLS.HOLD_WEIGHT && 'At walk-around weight'}
                  {getValue('protocol') === PROTOCOLS.BUILD && 'Off-season muscle gain'}
                  {getValue('protocol') === PROTOCOLS.SPAR && 'Clean eating — count slices'}
                </p>
              </div>

              {/* Nutrition Mode Toggle */}
              <div className="space-y-2 pt-2 border-t border-muted">
                <Label className="text-[11px]">Nutrition Tracking</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleChange({ nutritionPreference: 'spar' })}
                    className={cn(
                      "flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 transition-all",
                      (getValue('nutritionPreference') || 'spar') === 'spar'
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <span className="text-base">🥧</span>
                    <span className="text-xs font-bold">Slices</span>
                  </button>
                  <button
                    onClick={() => handleChange({ nutritionPreference: 'sugar' })}
                    className={cn(
                      "flex items-center justify-center gap-2 p-2.5 rounded-lg border-2 transition-all",
                      getValue('nutritionPreference') === 'sugar'
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <span className="text-base">⚖️</span>
                    <span className="text-xs font-bold">Grams</span>
                  </button>
                </div>
              </div>

              {/* SPAR Profile Info - Direct to wizard for changes */}
              {isSparProtocol && (
                <div className="pt-2 border-t border-muted">
                  <div className="flex items-center gap-2 py-2">
                    <Utensils className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-bold">SPAR Nutrition Profile</span>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {profile.heightInches && profile.age ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-muted/30 rounded px-2 py-1.5">
                            <span className="font-mono font-bold text-foreground">{Math.floor(profile.heightInches / 12)}'{profile.heightInches % 12}"</span>
                          </div>
                          <div className="bg-muted/30 rounded px-2 py-1.5">
                            <span className="font-mono font-bold text-foreground">{profile.age} yrs</span>
                          </div>
                          <div className="bg-muted/30 rounded px-2 py-1.5">
                            <span className="font-mono font-bold text-foreground capitalize">{profile.weeklyGoal || 'maintain'}</span>
                          </div>
                        </div>
                        <p className="text-[10px]">Use "Re-run Setup Wizard" below to update your SPAR profile.</p>
                      </>
                    ) : (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5">
                        <p className="text-yellow-600 dark:text-yellow-400 font-medium">
                          Profile incomplete. Use "Re-run Setup Wizard" below to complete your SPAR setup.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Practice Weigh-ins Toggle */}
                  <div className="mt-3 pt-3 border-t border-muted/50">
                    <button
                      onClick={() => handleChange({ trackPracticeWeighIns: !getValue('trackPracticeWeighIns') })}
                      className="flex items-center justify-between w-full py-1"
                    >
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-blue-500" />
                        <div className="text-left">
                          <span className="text-xs font-bold block">Track Practice Weigh-ins</span>
                          <span className="text-[10px] text-muted-foreground">Log PRE/POST weights to track sweat loss</span>
                        </div>
                      </div>
                      <div className={cn(
                        "w-10 h-5 rounded-full transition-colors relative",
                        getValue('trackPracticeWeighIns') ? "bg-primary" : "bg-muted"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                          getValue('trackPracticeWeighIns') ? "translate-x-5" : "translate-x-0.5"
                        )} />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Re-run Wizard */}
              <div className="pt-2 border-t border-muted">
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    sessionStorage.setItem('rerunWizard', 'true');
                    setTimeout(() => navigate('/onboarding'), 100);
                  }}
                  className="w-full h-10 text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-2" />
                  Re-run Setup Wizard
                </Button>
              </div>
            </TabsContent>

            {/* ═══ SCHEDULE TAB ═══ */}
            <TabsContent value="schedule" className="px-4 pb-4 space-y-3 mt-0">
              {/* Weigh-in Date */}
              <div className="space-y-1">
                <Label className="text-[11px]">Next Weigh-in Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    type="date"
                    className="pl-10 h-10"
                    value={format(new Date(weighInDate), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [year, month, day] = e.target.value.split('-').map(Number);
                        const localDate = new Date(year, month - 1, day, 12, 0, 0);
                        handleChange({ weighInDate: localDate });
                        e.target.blur();
                      }
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {daysUntil < 0 && "Weigh-in has passed"}
                  {daysUntil === 0 && "Competition day!"}
                  {daysUntil > 0 && daysUntil <= 5 && `${daysUntil} day${daysUntil > 1 ? 's' : ''} - cut week`}
                  {daysUntil > 5 && `${daysUntil} days - maintenance`}
                </p>
              </div>

              {/* Weigh-in Time */}
              <div className="space-y-1">
                <Label className="text-[11px]">Weigh-in Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                  <Select
                    value={getValue('weighInTime') || '07:00'}
                    onValueChange={(v) => handleChange({ weighInTime: v })}
                  >
                    <SelectTrigger className="pl-10 h-10 font-mono">
                      <SelectValue>
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
              </div>

              {/* Demo Mode */}
              <div className="space-y-2 pt-3 border-t border-muted">
                <Label className="text-[11px] flex items-center gap-2">
                  Demo Mode
                  <span className="text-[9px] text-muted-foreground font-normal">(Test different days)</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    className="flex-1 h-10"
                    value={simulatedDate ? format(new Date(simulatedDate), 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      if (e.target.value) {
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
                      className="h-10 px-3"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                    const today = new Date();
                    const currentDay = today.getDay();
                    const targetDay = i === 6 ? 0 : i + 1;
                    const diff = targetDay - currentDay;
                    const targetDate = new Date(today);
                    targetDate.setDate(today.getDate() + diff);

                    return (
                      <Button
                        key={day}
                        variant="outline"
                        size="sm"
                        className="text-[10px] h-7 px-2"
                        onClick={() => handleChange({ simulatedDate: targetDate })}
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* ═══ ALERTS TAB ═══ */}
            <TabsContent value="alerts" className="px-4 pb-4 mt-0">
              <AlertsTab />
            </TabsContent>

            {/* ═══ THEME TAB ═══ */}
            <TabsContent value="theme" className="px-4 pb-4 space-y-4 mt-0">
              <div className="space-y-2">
                <Label className="text-[11px]">Appearance</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all",
                      theme === "light"
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <Sun className={cn("w-5 h-5", theme === "light" ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-[10px] font-medium">Light</span>
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all",
                      theme === "dark"
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <Moon className={cn("w-5 h-5", theme === "dark" ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-[10px] font-medium">Dark</span>
                  </button>
                  <button
                    onClick={() => setTheme("system")}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all",
                      theme === "system"
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                  >
                    <Monitor className={cn("w-5 h-5", theme === "system" ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-[10px] font-medium">System</span>
                  </button>
                </div>
              </div>

              {/* Replay Tour */}
              <div className="pt-3 border-t border-muted">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetDashboardTour();
                    setOpen(false);
                    toast({ title: "Tour restarted", description: "The dashboard walkthrough will show now." });
                  }}
                  className="w-full h-10 text-xs"
                >
                  <HelpCircle className="w-3.5 h-3.5 mr-2" />
                  Replay Dashboard Tour
                </Button>
              </div>
            </TabsContent>

            {/* ═══ DATA TAB ═══ */}
            <TabsContent value="data" className="px-4 pb-4 space-y-4 mt-0">
              {user && (
                <div className="space-y-2">
                  <Label className="text-[11px]">Account</Label>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSignOut}
                    className="w-full h-10"
                  >
                    <LogOut className="w-3.5 h-3.5 mr-2" />
                    Sign Out
                  </Button>
                </div>
              )}

              {user && <ShareWithCoachSection userId={user.id} />}

              <div className="space-y-2 pt-3 border-t border-muted">
                <Label className="text-[11px] text-destructive">Danger Zone</Label>
                {!showResetConfirm ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full h-10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
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
                        className="flex-1 h-9"
                      >
                        Yes, Reset
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 h-9"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Weight Class Change Confirmation */}
        {showWeightClassConfirm && (
          <div className="absolute inset-0 bg-background/95 flex items-center justify-center p-4 rounded-xl z-50">
            <div className="space-y-4 w-full max-w-sm">
              <div className="space-y-2 text-center">
                <h4 className="font-bold text-base">Weight Class Changed</h4>
                <p className="text-xs text-muted-foreground">
                  Changed from {oldWeightClass} to {newWeightClass} lbs. Clear existing logs?
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={handleSaveWithClearLogs}
                  className="w-full h-10"
                  variant="destructive"
                >
                  Clear Logs & Save
                </Button>
                <Button
                  onClick={handleSaveKeepLogs}
                  className="w-full h-10"
                  variant="outline"
                >
                  Keep Logs & Save
                </Button>
                <Button
                  onClick={() => setShowWeightClassConfirm(false)}
                  className="w-full h-10"
                  variant="ghost"
                >
                  Go Back
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Protocol Switch Confirmation */}
        {showProtocolSwitchConfirm && (
          <div className="absolute inset-0 bg-background/95 flex items-center justify-center p-4 rounded-xl z-50">
            <div className="space-y-4 w-full max-w-sm">
              <div className="space-y-2 text-center">
                <h4 className="font-bold text-base">Switch Protocol?</h4>
                <p className="text-xs text-muted-foreground">
                  Switching to <span className="font-bold text-foreground">{PROTOCOL_NAMES[showProtocolSwitchConfirm as keyof typeof PROTOCOL_NAMES]}</span> will open the setup wizard to configure your new protocol.
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Your current weight ({profile.currentWeight} lbs) and name will be kept.
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={() => {
                    setOpen(false);
                    sessionStorage.setItem('rerunWizard', 'true');
                    sessionStorage.setItem('switchingProtocol', showProtocolSwitchConfirm);
                    setShowProtocolSwitchConfirm(null);
                    setTimeout(() => navigate('/onboarding'), 100);
                  }}
                  className="w-full h-10"
                >
                  Continue to Setup
                </Button>
                <Button
                  onClick={() => setShowProtocolSwitchConfirm(null)}
                  className="w-full h-10"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sticky Footer - Only for tabs that need save */}
        {(activeTab === 'profile' || (activeTab === 'schedule' && !isSparProtocol)) && (
          <div className="shrink-0 px-4 py-3 pb-safe-bottom border-t border-muted bg-card flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1 h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 h-10"
              disabled={!hasChanges}
            >
              <Check className="w-4 h-4 mr-1.5" />
              Save
            </Button>
          </div>
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
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-[11px] flex items-center gap-2">
          {prefs.enabled ? <Bell className="w-3.5 h-3.5 text-primary" /> : <BellOff className="w-3.5 h-3.5 text-muted-foreground" />}
          Weigh-in Reminders
        </Label>
        <p className="text-[10px] text-muted-foreground">
          Get notified when it's time to log your weight.
        </p>
      </div>

      {!isSupported && (
        <p className="text-[10px] text-orange-500">
          Notifications not supported in this browser.
        </p>
      )}

      {isDenied && (
        <p className="text-[10px] text-orange-500">
          Notifications blocked. Enable in browser settings.
        </p>
      )}

      <Button
        variant={prefs.enabled ? "default" : "outline"}
        onClick={handleEnable}
        disabled={isDenied || !isSupported}
        className="w-full h-9 text-xs"
      >
        {prefs.enabled ? "Reminders On" : "Enable Reminders"}
      </Button>

      {prefs.enabled && permission === 'granted' && (
        <div className="space-y-2 pt-2 border-t border-muted">
          <ReminderRow
            label="Morning"
            icon={<Sun className="w-3.5 h-3.5 text-yellow-500" />}
            enabled={prefs.morningReminder}
            time={prefs.morningTime}
            onToggle={(v) => update({ morningReminder: v })}
            onTimeChange={(v) => update({ morningTime: v })}
            timeOptions={timeOptions}
          />
          <ReminderRow
            label="Pre-Practice"
            icon={<Clock className="w-3.5 h-3.5 text-blue-500" />}
            enabled={prefs.prePracticeReminder}
            time={prefs.prePracticeTime}
            onToggle={(v) => update({ prePracticeReminder: v })}
            onTimeChange={(v) => update({ prePracticeTime: v })}
            timeOptions={timeOptions}
          />
          <ReminderRow
            label="Before Bed"
            icon={<Moon className="w-3.5 h-3.5 text-purple-500" />}
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
    <div className="flex items-center gap-2">
      <button
        onClick={() => onToggle(!enabled)}
        className={cn(
          "flex items-center gap-2 flex-1 text-left py-2 px-2.5 rounded-lg transition-colors",
          enabled ? "bg-primary/10" : "bg-muted/30 opacity-50"
        )}
      >
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </button>
      {enabled && (
        <Select value={time} onValueChange={onTimeChange}>
          <SelectTrigger className="w-[90px] h-8 text-[10px]">
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
      toast({ title: "Sharing enabled" });
    }
  };

  const disableSharing = async () => {
    const { error } = await supabase
      .from('profiles')
      .update({ share_token: null })
      .eq('user_id', userId);
    if (!error) {
      setShareToken(null);
      toast({ title: "Sharing disabled" });
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
      toast({ title: "Copy failed" });
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-2 pt-3 border-t border-muted">
      <Label className="text-[11px] flex items-center gap-2">
        <Share2 className="w-3.5 h-3.5 text-primary" />
        Share with Coach
      </Label>

      {!shareToken ? (
        <Button variant="outline" size="sm" onClick={enableSharing} className="w-full h-9 text-xs">
          <Link2 className="w-3.5 h-3.5 mr-2" />
          Enable Coach Sharing
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 bg-muted/30 border border-muted rounded-md px-2 py-1.5 text-[10px] font-mono truncate">
              {shareUrl}
            </div>
            <Button variant="outline" size="sm" onClick={copyLink} className="h-auto px-2">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={disableSharing} className="w-full h-7 text-[10px] text-destructive hover:text-destructive">
            <X className="w-3 h-3 mr-1" />
            Disable Sharing
          </Button>
        </div>
      )}
    </div>
  );
}
