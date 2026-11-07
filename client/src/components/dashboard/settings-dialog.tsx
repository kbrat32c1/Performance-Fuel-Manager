import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Weight, Target, Trash2, LogOut, Sun, Moon, Monitor, Calendar, Clock, Check, X, Bell, BellOff, Share2, Copy, RefreshCw, Link2, User, RotateCcw, HelpCircle, Utensils, Scale, Zap, Activity, TrendingDown, Flame, Dumbbell, Sliders, Brain, ChevronDown, ChevronUp, Briefcase } from "lucide-react";
import { format, differenceInDays, startOfDay } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { WEIGHT_CLASSES, PROTOCOL_NAMES, PROTOCOLS } from "@/lib/constants";
import { getWeightContext, getProtocolRecommendation, PROTOCOL_CONFIG } from "@/lib/protocol-utils";
import { ProtocolWizard } from "@/components/protocol-wizard";
import type { Protocol, AthleteProfile } from "@/lib/store";
import {
  type Goal as SparV2Goal,
  type GoalIntensity,
  type MaintainPriority,
  type TrainingSessions,
  type WorkdayActivity,
} from "@/lib/spar-calculator-v2";
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
import { isHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";

/** Profile updates use Record<string, any> because settings-dialog
 *  accesses fields dynamically via getValue(key) and Select returns string. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProfileUpdates = Record<string, any>;

interface SettingsDialogProps {
  profile: AthleteProfile;
  updateProfile: (updates: ProfileUpdates) => void;
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
  const [pendingChanges, setPendingChanges] = useState<ProfileUpdates>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [showNerdMode, setShowNerdMode] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(isHapticsEnabled());
  const [showProtocolWizard, setShowProtocolWizard] = useState(false);

  // Reset pending changes when dialog opens
  useEffect(() => {
    if (open) {
      setPendingChanges({});
      setHasChanges(false);
      setShowWeightClassConfirm(false);
      // Don't reset activeTab if it was set by the open-settings event
    }
  }, [open]);

  // Listen for open-settings event (e.g., from "No weigh-in scheduled" badge)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab) setActiveTab(detail.tab);
      setOpen(true);
    };
    window.addEventListener('open-settings', handler);
    return () => window.removeEventListener('open-settings', handler);
  }, []);

  // Get the current value (pending or actual)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getValue = (key: keyof AthleteProfile): any => {
    return key in pendingChanges ? pendingChanges[key] : profile[key];
  };

  // Update pending changes
  const handleChange = (updates: ProfileUpdates) => {
    setPendingChanges(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  // Check if weight class has changed
  const newWeightClass = pendingChanges.targetWeightClass;
  const oldWeightClass = profile.targetWeightClass;
  const weightClassChanged = newWeightClass !== undefined &&
    Number(newWeightClass) !== Number(oldWeightClass);

  // Protocol classification
  const currentProtocol = (getValue('protocol') || profile.protocol) as string;
  const isSparNutrition = currentProtocol === '5' || currentProtocol === '6';
  const isSparGeneral = currentProtocol === '5';
  const isSparProtocol = isSparNutrition; // backward compat alias

  // Is SPAR v2 enabled?
  // Auto-upgrade: If user is on SPAR protocol and has v2 stats (height, age), treat as v2
  const hasV2Stats = profile.heightInches && profile.age;
  const isSparV2 = getValue('sparV2') || profile.sparV2 || (isSparProtocol && hasV2Stats);

  // Auto-upgrade: If showing v2 UI but sparV2 not explicitly set, include it in save
  // Also always include current v2 settings to ensure they persist
  // Use explicit undefined checks because || doesn't distinguish between undefined and falsy
  const currentGoal = pendingChanges.sparGoal !== undefined ? pendingChanges.sparGoal : (profile.sparGoal || 'maintain');
  const currentIntensity = pendingChanges.goalIntensity !== undefined ? pendingChanges.goalIntensity : profile.goalIntensity;
  const currentPriority = pendingChanges.maintainPriority !== undefined ? pendingChanges.maintainPriority : profile.maintainPriority;
  const currentTraining = pendingChanges.trainingSessions !== undefined ? pendingChanges.trainingSessions : (profile.trainingSessions || '3-4');
  const currentActivity = pendingChanges.workdayActivity !== undefined ? pendingChanges.workdayActivity : (profile.workdayActivity || 'mostly_sitting');

  const v2SettingsToSave = isSparV2 ? {
    sparV2: true,
    sparGoal: currentGoal,
    goalIntensity: currentGoal !== 'maintain' ? (currentIntensity || 'lean') : null,
    maintainPriority: currentGoal === 'maintain' ? (currentPriority || 'general') : null,
    trainingSessions: currentTraining,
    workdayActivity: currentActivity,
  } : {};

  // Save all changes
  const handleSave = () => {
    // If weight class changed, show confirmation dialog
    if (weightClassChanged) {
      setShowWeightClassConfirm(true);
      return;
    }
    const savePayload = { ...pendingChanges, ...v2SettingsToSave };
    updateProfile(savePayload);
    setOpen(false);
  };

  // Save with clear logs option
  const handleSaveWithClearLogs = async () => {
    await clearLogs();
    updateProfile({ ...pendingChanges, ...v2SettingsToSave });
    setShowWeightClassConfirm(false);
    setOpen(false);
  };

  // Save and keep logs
  const handleSaveKeepLogs = () => {
    updateProfile({ ...pendingChanges, ...v2SettingsToSave });
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
        <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground" aria-label="Open settings">
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
            <TabsList className={cn("grid w-full px-4 py-2 sticky top-0 bg-card z-10", isSparGeneral ? "grid-cols-4" : "grid-cols-5")}>
              <TabsTrigger value="profile" className="text-xs px-1">Profile</TabsTrigger>
              {!isSparGeneral && <TabsTrigger value="schedule" className="text-xs px-1">Schedule</TabsTrigger>}
              <TabsTrigger value="alerts" className="text-xs px-1">Alerts</TabsTrigger>
              <TabsTrigger value="theme" className="text-xs px-1">Theme</TabsTrigger>
              <TabsTrigger value="data" className="text-xs px-1">Data</TabsTrigger>
            </TabsList>

            {/* ═══ PROFILE TAB ═══ */}
            <TabsContent value="profile" className="px-4 pb-4 space-y-3 mt-0">
              {/* Name Row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">First Name</Label>
                  <Input
                    type="text"
                    value={getValue('name') || ''}
                    onChange={(e) => handleChange({ name: e.target.value })}
                    className="h-10"
                    placeholder="First"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Last Name</Label>
                  <Input
                    type="text"
                    value={getValue('lastName') || ''}
                    onChange={(e) => handleChange({ lastName: e.target.value })}
                    className="h-10"
                    placeholder="Last"
                  />
                </div>
              </div>

              {/* Weight Row - Target Class only for competition protocols (including SPAR Competition) */}
              {isSparGeneral ? (
                <div className="space-y-1">
                  <Label className="text-xs">Current Weight</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={getValue('currentWeight') || ''}
                      onChange={(e) => handleChange({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                      className="h-10 font-mono pr-10"
                      placeholder="170"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">lbs</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Current Weight</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={getValue('currentWeight') || ''}
                        onChange={(e) => handleChange({ currentWeight: e.target.value ? parseFloat(e.target.value) : 0 })}
                        className="h-10 font-mono pr-10"
                        placeholder="170"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">lbs</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Target Class</Label>
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
              <div className="space-y-2">
                <Label className="text-xs">Protocol</Label>

                {/* Weight Context Card — for competition protocols (including SPAR Competition) */}
                {!isSparGeneral && getValue('targetWeightClass') > 0 && (() => {
                  const ctx = getWeightContext(
                    getValue('currentWeight') || profile.currentWeight,
                    getValue('targetWeightClass') || profile.targetWeightClass
                  );
                  const isUnder = ctx.percentOver < 0;
                  const statusColor = isUnder ? 'text-blue-500' : ctx.percentOver > 12 ? 'text-red-500' : ctx.percentOver > 7 ? 'text-amber-500' : 'text-green-500';
                  const statusBg = isUnder ? 'bg-blue-500/10' : ctx.percentOver > 12 ? 'bg-red-500/10' : ctx.percentOver > 7 ? 'bg-amber-500/10' : 'bg-green-500/10';

                  return (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-muted">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold">{(getValue('currentWeight') || profile.currentWeight)} lbs</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono text-muted-foreground">{ctx.walkAroundWeight.toFixed(1)} lbs</span>
                      </div>
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", statusColor, statusBg)}>
                        {isUnder
                          ? `${Math.abs(ctx.percentOver).toFixed(1)}% under`
                          : `${ctx.percentOver.toFixed(1)}% over class`}
                      </span>
                    </div>
                  );
                })()}

                {(() => {
                  const recommended = !isSparGeneral && getValue('targetWeightClass') > 0
                    ? getProtocolRecommendation(
                        getValue('currentWeight') || profile.currentWeight,
                        getValue('targetWeightClass') || profile.targetWeightClass
                      )
                    : null;
                  const groups: { title: string; hint: string; protocols: Protocol[] }[] = [
                    {
                      title: 'Weight-class plans',
                      hint: 'Pick by how far you are from your class.',
                      protocols: [PROTOCOLS.EXTREME_CUT, PROTOCOLS.RAPID_CUT, PROTOCOLS.OPTIMAL_CUT, PROTOCOLS.GAIN],
                    },
                    {
                      title: 'SPAR portion plans',
                      hint: 'Count palms and fists instead of calories.',
                      protocols: [PROTOCOLS.SPAR, PROTOCOLS.SPAR_COMPETITION],
                    },
                  ];

                  return groups.map((group) => (
                    <div key={group.title} className="space-y-1.5">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide">{group.title}</p>
                        <p className="text-xs text-muted-foreground">{group.hint}</p>
                      </div>
                      {group.protocols.map((p) => {
                        const isSelected = getValue('protocol') === p;
                        const isRecommended = recommended?.protocol === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              if (p !== profile.protocol) setShowProtocolSwitchConfirm(p);
                            }}
                            className={cn(
                              "w-full flex items-start gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-left",
                              isSelected
                                ? "border-primary bg-primary/10"
                                : "border-muted hover:border-muted-foreground/50"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-sm font-bold">{PROTOCOL_NAMES[p]}</span>
                                {isRecommended && (
                                  <span className="text-xs font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                                    Recommended for you
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                {PROTOCOL_CONFIG[p].pickIf}
                              </p>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()}

                {/* Help Me Choose — opens ProtocolWizard dialog */}
                {!isSparGeneral && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => setShowProtocolWizard(true)}
                  >
                    <HelpCircle className="w-3.5 h-3.5 mr-1.5" />
                    Help Me Choose
                  </Button>
                )}
              </div>

              {/* Nutrition Mode Toggle */}
              <div className="space-y-2 pt-2 border-t border-muted">
                <Label className="text-xs">Nutrition Tracking</Label>
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

              {/* SPAR Nutrition Settings */}
              {isSparNutrition && (
                <div className="pt-2 border-t border-muted space-y-3">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-bold">SPAR Nutrition Settings</span>
                  </div>

                  {/* V2 Settings - Goal, Training, Activity */}
                  <>
                      {/* Goal Selection — disabled for SPAR Competition (auto-adjusts) */}
                      {currentProtocol === '6' ? (
                        <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                          <p className="text-xs text-purple-400 font-bold">
                            Calorie targets auto-adjust based on walk-around weight and days until weigh-in.
                          </p>
                        </div>
                      ) : (<>
                      <div className="space-y-2">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Target className="w-3 h-3" />
                          Goal
                        </Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['lose', 'maintain', 'gain'] as SparV2Goal[]).map((goal) => {
                            const isSelected = (getValue('sparGoal') || 'maintain') === goal;
                            const iconColor = goal === 'lose' ? 'text-orange-500' :
                                              goal === 'maintain' ? 'text-blue-500' : 'text-green-500';
                            const Icon = goal === 'lose' ? Flame : goal === 'maintain' ? Scale : Dumbbell;
                            const label = goal === 'lose' ? 'Lose' : goal === 'maintain' ? 'Maintain' : 'Gain';
                            return (
                              <button
                                key={goal}
                                onClick={() => {
                                  handleChange({
                                    sparGoal: goal,
                                    goalIntensity: goal !== 'maintain' ? (getValue('goalIntensity') || 'aggressive') : undefined,
                                    maintainPriority: goal === 'maintain' ? (getValue('maintainPriority') || 'general') : undefined,
                                  });
                                }}
                                className={cn(
                                  "flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all",
                                  isSelected ? "border-primary bg-primary/10" : "border-muted hover:border-muted-foreground/50"
                                )}
                              >
                                <Icon className={cn("w-4 h-4", iconColor)} />
                                <span className="text-xs font-bold">{label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Sub-options based on goal */}
                        {getValue('sparGoal') === 'lose' || getValue('sparGoal') === 'gain' ? (
                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            {(['lean', 'aggressive'] as GoalIntensity[]).map((intensity) => {
                              const isSelected = (getValue('goalIntensity') || 'aggressive') === intensity;
                              const cal = getValue('sparGoal') === 'lose'
                                ? (intensity === 'lean' ? -250 : -500)
                                : (intensity === 'lean' ? 250 : 500);
                              return (
                                <button
                                  key={intensity}
                                  onClick={() => handleChange({ goalIntensity: intensity })}
                                  className={cn(
                                    "p-1.5 rounded border text-center transition-all",
                                    isSelected ? "border-primary bg-primary/10" : "border-muted"
                                  )}
                                >
                                  <span className="text-xs font-bold capitalize">{intensity}</span>
                                  <span className="text-xs text-muted-foreground block">{cal > 0 ? '+' : ''}{cal} cal/day</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : getValue('sparGoal') === 'maintain' ? (
                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            {(['general', 'performance'] as MaintainPriority[]).map((priority) => {
                              const isSelected = (getValue('maintainPriority') || 'general') === priority;
                              const split = priority === 'general' ? '45/55' : '70/30';
                              return (
                                <button
                                  key={priority}
                                  onClick={() => handleChange({ maintainPriority: priority })}
                                  className={cn(
                                    "p-1.5 rounded border text-center transition-all",
                                    isSelected ? "border-primary bg-primary/10" : "border-muted"
                                  )}
                                >
                                  <span className="text-xs font-bold capitalize">{priority}</span>
                                  <span className="text-xs text-muted-foreground block">{split} carb/fat</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>

                      {/* Goal Weight (for lose/gain) */}
                      {(getValue('sparGoal') === 'lose' || getValue('sparGoal') === 'gain') && (
                        <div className="space-y-1">
                          <Label className="text-xs">Goal Weight (optional)</Label>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="number"
                              placeholder="e.g. 165"
                              className="h-9 font-mono flex-1"
                              value={getValue('goalWeightLbs') || ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                handleChange({ goalWeightLbs: !isNaN(val) && val > 0 ? val : undefined });
                              }}
                            />
                            <span className="text-xs text-muted-foreground">lbs</span>
                          </div>
                        </div>
                      )}
                      </>)}

                      {/* Training Sessions */}
                      <div className="space-y-2 pt-2 border-t border-muted/50">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Dumbbell className="w-3 h-3" />
                          Weekly Training
                        </Label>
                        <div className="grid grid-cols-4 gap-1">
                          {(['1-2', '3-4', '5-6', '7+'] as TrainingSessions[]).map((sessions) => {
                            const isSelected = (getValue('trainingSessions') || '3-4') === sessions;
                            return (
                              <button
                                key={sessions}
                                onClick={() => handleChange({ trainingSessions: sessions })}
                                className={cn(
                                  "p-1.5 rounded border text-center transition-all",
                                  isSelected ? "border-primary bg-primary/10" : "border-muted"
                                )}
                              >
                                <span className="text-xs font-bold">{sessions}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Workday Activity */}
                      <div className="space-y-2">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Briefcase className="w-3 h-3" />
                          Workday Activity
                        </Label>
                        <div className="space-y-1">
                          {(['mostly_sitting', 'on_feet_some', 'on_feet_most'] as WorkdayActivity[]).map((activity) => {
                            const isSelected = (getValue('workdayActivity') || 'mostly_sitting') === activity;
                            const label = activity === 'mostly_sitting' ? 'Mostly Sitting' :
                                          activity === 'on_feet_some' ? 'On Feet Some' : 'On Feet Most';
                            return (
                              <button
                                key={activity}
                                onClick={() => handleChange({ workdayActivity: activity })}
                                className={cn(
                                  "w-full p-1.5 rounded border text-left transition-all flex items-center justify-between",
                                  isSelected ? "border-primary bg-primary/10" : "border-muted"
                                )}
                              >
                                <span className="text-xs font-medium">{label}</span>
                                {isSelected && <Check className="w-3 h-3 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Haptic Feedback Toggle */}
                      <div className="pt-2 border-t border-muted/50">
                        <button
                          onClick={() => {
                            const newVal = !hapticsOn;
                            setHapticsOn(newVal);
                            setHapticsEnabled(newVal);
                          }}
                          className="flex items-center justify-between w-full py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-cyan-500" />
                            <span className="text-xs font-bold">Haptic Feedback</span>
                          </div>
                          <div className={cn(
                            "w-10 h-5 rounded-full transition-colors relative",
                            hapticsOn ? "bg-cyan-500" : "bg-muted"
                          )}>
                            <div className={cn(
                              "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                              hapticsOn ? "translate-x-5" : "translate-x-0.5"
                            )} />
                          </div>
                        </button>
                        <p className="text-xs text-muted-foreground">Vibrate on key actions (mobile only)</p>
                      </div>

                      {/* Nerd Mode - Collapsible */}
                      <div className="pt-2 border-t border-muted/50">
                        <button
                          onClick={() => setShowNerdMode(!showNerdMode)}
                          className="flex items-center justify-between w-full py-1"
                        >
                          <div className="flex items-center gap-2">
                            <Brain className="w-4 h-4 text-purple-500" />
                            <span className="text-xs font-bold">Nerd Mode</span>
                          </div>
                          {showNerdMode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showNerdMode && (
                          <div className="space-y-3 pt-2">
                            {/* Body Fat % */}
                            <div className="space-y-1">
                              <Label className="text-xs text-purple-500">Body Fat % (enables Cunningham formula)</Label>
                              <Input
                                type="number"
                                min="5"
                                max="50"
                                placeholder="e.g. 15"
                                className="h-8 font-mono text-sm"
                                value={getValue('bodyFatPercent') || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  handleChange({ bodyFatPercent: !isNaN(val) && val > 0 && val < 100 ? val : undefined });
                                }}
                              />
                            </div>

                            {/* Custom Protein g/lb */}
                            <div className="space-y-1">
                              <Label className="text-xs text-purple-500">Custom Protein (g/lb bodyweight)</Label>
                              <Input
                                type="number"
                                min="0.5"
                                max="1.5"
                                step="0.05"
                                placeholder="0.65 - 0.95"
                                className="h-8 font-mono text-sm"
                                value={getValue('customProteinPerLb') || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  handleChange({ customProteinPerLb: !isNaN(val) && val > 0 ? val : undefined });
                                }}
                              />
                            </div>

                            {/* Custom Fat/Carb Split */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-purple-500">Fat % of remaining</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  placeholder="30-50"
                                  className="h-8 font-mono text-sm"
                                  value={getValue('customFatPercent') || ''}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    handleChange({ customFatPercent: !isNaN(val) && val >= 0 ? val : undefined });
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-purple-500">Carb % of remaining</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  placeholder="50-70"
                                  className="h-8 font-mono text-sm"
                                  value={getValue('customCarbPercent') || ''}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    handleChange({ customCarbPercent: !isNaN(val) && val >= 0 ? val : undefined });
                                  }}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Leave blank to use protocol defaults. Fat + Carb should total 100%.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Editable Stats */}
                      <div className="space-y-3 pt-2 border-t border-muted/50">
                        <div className="grid grid-cols-3 gap-2">
                          {/* Height */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Height</Label>
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                min="4"
                                max="7"
                                placeholder="ft"
                                className="h-7 font-mono text-xs w-12 px-1 text-center"
                                value={getValue('heightInches') ? Math.floor(getValue('heightInches') / 12) : ''}
                                onChange={(e) => {
                                  const ft = parseInt(e.target.value) || 0;
                                  const currentIn = (getValue('heightInches') || 0) % 12;
                                  handleChange({ heightInches: ft * 12 + currentIn });
                                }}
                              />
                              <Input
                                type="number"
                                min="0"
                                max="11"
                                placeholder="in"
                                className="h-7 font-mono text-xs w-12 px-1 text-center"
                                value={getValue('heightInches') ? getValue('heightInches') % 12 : ''}
                                onChange={(e) => {
                                  const inches = parseInt(e.target.value) || 0;
                                  const currentFt = Math.floor((getValue('heightInches') || 0) / 12);
                                  handleChange({ heightInches: currentFt * 12 + inches });
                                }}
                              />
                            </div>
                          </div>
                          {/* Age */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Age</Label>
                            <Input
                              type="number"
                              min="10"
                              max="100"
                              placeholder="Age"
                              className="h-7 font-mono text-xs text-center"
                              value={getValue('age') || ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                handleChange({ age: !isNaN(val) && val > 0 ? val : undefined });
                              }}
                            />
                          </div>
                          {/* Sex */}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Sex</Label>
                            <div className="flex gap-1">
                              {(['male', 'female'] as const).map((sex) => (
                                <button
                                  key={sex}
                                  type="button"
                                  onClick={() => handleChange({ gender: sex })}
                                  className={cn(
                                    "flex-1 h-7 rounded text-xs font-medium transition-colors",
                                    (getValue('gender') || profile.gender) === sex
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted/50 hover:bg-muted"
                                  )}
                                >
                                  {sex === 'male' ? 'M' : 'F'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                  </>

                  {/* Practice Weigh-ins Toggle - Always show */}
                  <div className="pt-2 border-t border-muted/50">
                    <button
                      onClick={() => handleChange({ trackPracticeWeighIns: !getValue('trackPracticeWeighIns') })}
                      className="flex items-center justify-between w-full py-1"
                    >
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-blue-500" />
                        <div className="text-left">
                          <span className="text-xs font-bold block">Track Practice Weigh-ins</span>
                          <span className="text-xs text-muted-foreground">Log PRE/POST weights to track sweat loss</span>
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
                <Label className="text-xs">Next Weigh-in Date</Label>
                {getValue('weighInCleared') ? (
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-2">No weigh-in date set</p>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input
                        type="date"
                        className="pl-10 h-10"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            const [year, month, day] = e.target.value.split('-').map(Number);
                            const localDate = new Date(year, month - 1, day, 12, 0, 0);
                            handleChange({ weighInDate: localDate, weighInCleared: false, nextCyclePromptDismissed: false });
                            e.target.blur();
                          }
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
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
                            handleChange({ weighInDate: localDate, weighInCleared: false, nextCyclePromptDismissed: false });
                            e.target.blur();
                          }
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {daysUntil < 0 && "Weigh-in has passed"}
                        {daysUntil === 0 && "Competition day!"}
                        {daysUntil > 0 && daysUntil <= 5 && `${daysUntil} day${daysUntil > 1 ? 's' : ''} - cut week`}
                        {daysUntil > 5 && `${daysUntil} days - training`}
                      </p>
                      <button
                        onClick={() => handleChange({ weighInCleared: true })}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Clear date
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Weigh-in Time */}
              <div className="space-y-1">
                <Label className="text-xs">Weigh-in Time</Label>
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
                <Label className="text-xs flex items-center gap-2">
                  Demo Mode
                  <span className="text-xs text-muted-foreground font-normal">(Test different days)</span>
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
                        className="text-xs h-7 px-2"
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
                <Label className="text-xs">Appearance</Label>
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
                    <span className="text-xs font-medium">Light</span>
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
                    <span className="text-xs font-medium">Dark</span>
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
                    <span className="text-xs font-medium">System</span>
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
                  <Label className="text-xs">Account</Label>
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
                <Label className="text-xs text-destructive">Danger Zone</Label>
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

        {/* Protocol Switch Confirmation — now does inline switching */}
        {showProtocolSwitchConfirm && (
          <div className="absolute inset-0 bg-background/95 flex flex-col p-4 rounded-xl z-50 overflow-y-auto">
            <div className="space-y-4 w-full max-w-sm mx-auto">
              <div className="space-y-2 text-center">
                <h4 className="font-bold text-base">Switch to {PROTOCOL_NAMES[showProtocolSwitchConfirm as keyof typeof PROTOCOL_NAMES]}?</h4>
                <p className="text-xs text-muted-foreground">
                  {showProtocolSwitchConfirm === '5'
                    ? 'SPAR uses portion-based tracking with slices instead of strict macros.'
                    : showProtocolSwitchConfirm === '6'
                    ? 'SPAR portion tracking with competition water loading and auto-adjusting calorie targets.'
                    : 'This will change your daily targets and recommendations.'
                  }
                </p>
              </div>

              {/* Inline SPAR setup when switching to SPAR or SPAR Competition */}
              {(showProtocolSwitchConfirm === '5' || showProtocolSwitchConfirm === '6') && (
                <div className="space-y-3 py-2 border-t border-muted">
                  {/* Goal */}
                  <div className="space-y-1">
                    <Label className="text-xs">Your Goal</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'lose', label: 'Lose', icon: <TrendingDown className="w-4 h-4" />, color: 'text-orange-500' },
                        { value: 'maintain', label: 'Maintain', icon: <Target className="w-4 h-4" />, color: 'text-blue-500' },
                        { value: 'gain', label: 'Gain', icon: <Flame className="w-4 h-4" />, color: 'text-green-500' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => handleChange({ sparGoal: opt.value })}
                          className={cn(
                            "flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all",
                            (pendingChanges.sparGoal || 'maintain') === opt.value
                              ? "border-primary bg-primary/10"
                              : "border-muted hover:border-muted-foreground/50"
                          )}
                        >
                          <span className={opt.color}>{opt.icon}</span>
                          <span className="text-xs font-bold">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Training Frequency */}
                  <div className="space-y-1">
                    <Label className="text-xs">Training Sessions / Week</Label>
                    <Select
                      value={pendingChanges.trainingSessions || profile.trainingSessions || '3-4'}
                      onValueChange={(v) => handleChange({ trainingSessions: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-2">1-2 sessions</SelectItem>
                        <SelectItem value="3-4">3-4 sessions</SelectItem>
                        <SelectItem value="5-6">5-6 sessions</SelectItem>
                        <SelectItem value="7+">7+ sessions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Workday Activity */}
                  <div className="space-y-1">
                    <Label className="text-xs">Daily Activity Level</Label>
                    <Select
                      value={pendingChanges.workdayActivity || profile.workdayActivity || 'mostly_sitting'}
                      onValueChange={(v) => handleChange({ workdayActivity: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mostly_sitting">Mostly sitting (desk job)</SelectItem>
                        <SelectItem value="on_feet_some">On feet some of the day</SelectItem>
                        <SelectItem value="on_feet_most">On feet most of the day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Button
                  onClick={() => {
                    // Apply the protocol change inline
                    const updates: any = { protocol: showProtocolSwitchConfirm };
                    if (showProtocolSwitchConfirm === '5' || showProtocolSwitchConfirm === '6') {
                      updates.sparV2 = true;
                      updates.sparGoal = pendingChanges.sparGoal || 'maintain';
                      updates.trainingSessions = pendingChanges.trainingSessions || profile.trainingSessions || '3-4';
                      updates.workdayActivity = pendingChanges.workdayActivity || profile.workdayActivity || 'mostly_sitting';
                    }
                    handleChange(updates);
                    setShowProtocolSwitchConfirm(null);
                    toast({
                      title: 'Protocol updated',
                      description: `Switched to ${PROTOCOL_NAMES[showProtocolSwitchConfirm as keyof typeof PROTOCOL_NAMES]}. Save to apply.`,
                    });
                  }}
                  className="w-full h-10"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Switch Protocol
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

        {/* Protocol Wizard — "Help Me Choose" overlay */}
        {showProtocolWizard && (
          <div className="absolute inset-0 bg-background flex flex-col rounded-xl z-50 overflow-y-auto overflow-x-hidden">
            <div className="p-4 w-full max-w-sm mx-auto">
              <ProtocolWizard
                currentWeight={getValue('currentWeight') || profile.currentWeight}
                targetWeightClass={getValue('targetWeightClass') || profile.targetWeightClass}
                submitLabel="Select Protocol"
                onComplete={(protocol: Protocol) => {
                  if (protocol !== profile.protocol) {
                    handleChange({ protocol });
                    toast({
                      title: 'Protocol updated',
                      description: `Switched to ${PROTOCOL_CONFIG[protocol].label}. Save to apply.`,
                    });
                  }
                  setShowProtocolWizard(false);
                }}
                onBack={() => setShowProtocolWizard(false)}
              />
            </div>
          </div>
        )}

        {/* Sticky Footer - Only for tabs that need save */}
        {(activeTab === 'profile' || (activeTab === 'schedule' && !isSparGeneral)) && (
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
        <Label className="text-xs flex items-center gap-2">
          {prefs.enabled ? <Bell className="w-3.5 h-3.5 text-primary" /> : <BellOff className="w-3.5 h-3.5 text-muted-foreground" />}
          Weigh-in Reminders
        </Label>
        <p className="text-xs text-muted-foreground">
          Get notified when it's time to log your weight.
        </p>
      </div>

      {!isSupported && (
        <p className="text-xs text-orange-500">
          Notifications not supported in this browser.
        </p>
      )}

      {isDenied && (
        <p className="text-xs text-orange-500">
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
          <SelectTrigger className="w-[90px] h-8 text-xs">
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
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    const token = crypto.randomUUID();
    const { error } = await supabase
      .from('profiles')
      .update({ share_token: token })
      .eq('user_id', userId);
    setSaving(false);
    if (!error) {
      setShareToken(token);
      toast({ title: "Sharing enabled" });
    }
  };

  const disableSharing = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ share_token: null })
      .eq('user_id', userId);
    setSaving(false);
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
      <Label className="text-xs flex items-center gap-2">
        <Share2 className="w-3.5 h-3.5 text-primary" />
        Share with Coach
      </Label>

      {!shareToken ? (
        <Button variant="outline" size="sm" onClick={enableSharing} disabled={saving} className="w-full h-9 text-xs">
          <Link2 className="w-3.5 h-3.5 mr-2" />
          {saving ? 'Enabling...' : 'Enable Coach Sharing'}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 bg-muted/30 border border-muted rounded-md px-2 py-1.5 text-xs font-mono truncate">
              {shareUrl}
            </div>
            <Button variant="outline" size="sm" onClick={copyLink} className="h-auto px-2">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={disableSharing} disabled={saving} className="w-full h-7 text-xs text-destructive hover:text-destructive">
            <X className="w-3 h-3 mr-1" />
            {saving ? 'Disabling...' : 'Disable Sharing'}
          </Button>
        </div>
      )}
    </div>
  );
}
