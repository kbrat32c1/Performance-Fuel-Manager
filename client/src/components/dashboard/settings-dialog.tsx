import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Weight, Target, Trash2, LogOut, Sun, Moon, Monitor, Calendar, Clock, Check, X, Bell, BellOff, Share2, Copy, RefreshCw, Link2, User, RotateCcw, HelpCircle, Utensils, Scale, Zap, Activity, TrendingDown, Flame, Dumbbell, Sliders, Brain, ChevronDown, ChevronUp, Briefcase, Heart, Smartphone, Bluetooth, BatteryMedium, Search, Loader2 } from "lucide-react";
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
  type NotificationPreferences,
} from "@/lib/notifications";
import { isHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";
import { useHealthKitSync } from "@/hooks/use-healthkit-sync";
import { useV5BandContext } from "@/lib/v5band-context";
import { WaterLoadingSwitch } from "@/components/water-loading-switch";
import { WhoopCard } from "@/components/dashboard/whoop-card";

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
  const hkSync = useHealthKitSync(user?.id ?? null);
  const v5band = useV5BandContext();
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
    <>
      <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground" aria-label="Open settings" onClick={() => setOpen(true)}>
        <Settings className="w-5 h-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
        className="w-[92%] max-w-md rounded-xl bg-card border-muted max-h-[80vh] flex flex-col !top-[8%] !translate-y-0 p-0"
      >
        {/* Fixed Header */}
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-muted shrink-0">
          <DialogTitle className="font-heading uppercase italic text-lg">Settings</DialogTitle>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={cn("grid w-full px-4 py-2 sticky top-0 bg-card z-10", isSparGeneral ? "grid-cols-5" : "grid-cols-6")}>
              <TabsTrigger value="profile" className="text-xs px-1">Profile</TabsTrigger>
              {!isSparGeneral && <TabsTrigger value="schedule" className="text-xs px-1">Schedule</TabsTrigger>}
              <TabsTrigger value="health" className="text-xs px-1">Health</TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs px-1">Alerts</TabsTrigger>
              <TabsTrigger value="theme" className="text-xs px-1">Theme</TabsTrigger>
              <TabsTrigger value="data" className="text-xs px-1">Data</TabsTrigger>
            </TabsList>

            {/* ═══ PROFILE TAB ═══ */}
            <TabsContent value="profile" className="px-4 pb-4 space-y-3 mt-0">
              {/* SPAR General has no Schedule tab, but athletes on it still join their team. */}
              {isSparGeneral && <TeamScheduleLink onOpen={() => navigate('/team')} />}
              {/* Name Row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="settings-first-name" className="text-xs">First Name</Label>
                  <Input id="settings-first-name"
                    type="text"
                    value={getValue('name') || ''}
                    onChange={(e) => handleChange({ name: e.target.value })}
                    className="h-10"
                    placeholder="First"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="settings-last-name" className="text-xs">Last Name</Label>
                  <Input id="settings-last-name"
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
                  <Label htmlFor="settings-current-weight" className="text-xs">Current Weight</Label>
                  <div className="relative">
                    <Input id="settings-current-weight"
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
                    <Label htmlFor="settings-current-weight-comp" className="text-xs">Current Weight</Label>
                    <div className="relative">
                      <Input id="settings-current-weight-comp"
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
                    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                      {WEIGHT_CLASSES.map(w => (
                        <button
                          key={w}
                          onClick={() => handleChange({ targetWeightClass: w })}
                          className={cn(
                            "shrink-0 h-10 px-3 rounded-lg border-2 font-mono text-sm font-bold transition-all",
                            getValue('targetWeightClass') === w
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-muted hover:border-muted-foreground/50"
                          )}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
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
                        getValue('targetWeightClass') || profile.targetWeightClass,
                        { bodyFatPercent: getValue('bodyFatPercent') ?? profile.bodyFatPercent, weighInDate: (getValue('weighInCleared') ?? profile.weighInCleared) ? null : (getValue('weighInDate') || profile.weighInDate) }
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
                            aria-pressed={isSelected}
                            onClick={() => {
                              if (p !== profile.protocol) {
                                setShowProtocolSwitchConfirm(p);
                              } else if (getValue('protocol') !== profile.protocol) {
                                // Back to the saved protocol: drop the unsaved switch.
                                const { protocol: _protocol, sparV2: _sparV2, ...rest } = pendingChanges;
                                setPendingChanges(rest);
                                setHasChanges(Object.keys(rest).length > 0);
                              }
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

              {/* Age — needed for strain HR zone calculations (all protocols) */}
              <div className="flex items-center gap-3 pt-2 border-t border-muted">
                <Label htmlFor="settings-age" className="text-xs text-muted-foreground whitespace-nowrap">Age</Label>
                <Input id="settings-age"
                  type="number"
                  min="10"
                  max="100"
                  placeholder="Enter age"
                  className="h-7 font-mono text-xs w-20 text-center"
                  value={getValue('age') || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    handleChange({ age: !isNaN(val) && val > 0 ? val : undefined });
                  }}
                />
                <span className="text-xs text-muted-foreground/60">Max HR: {getValue('age') ? 220 - Number(getValue('age')) : '—'} bpm</span>
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
                          <Label htmlFor="settings-goal-weight" className="text-xs">Goal Weight (optional)</Label>
                          <div className="flex gap-2 items-center">
                            <Input id="settings-goal-weight"
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
                              <Label htmlFor="settings-body-fat" className="text-xs text-purple-500">Body Fat % (enables Cunningham formula)</Label>
                              <Input id="settings-body-fat"
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
                              <Label htmlFor="settings-protein-per-lb" className="text-xs text-purple-500">Custom Protein (g/lb bodyweight)</Label>
                              <Input id="settings-protein-per-lb"
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
                                <Label htmlFor="settings-fat-percent" className="text-xs text-purple-500">Fat % of remaining</Label>
                                <Input id="settings-fat-percent"
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
                                <Label htmlFor="settings-carb-percent" className="text-xs text-purple-500">Carb % of remaining</Label>
                                <Input id="settings-carb-percent"
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
                              <Input aria-label="Height, feet"
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
                              <Input aria-label="Height, inches"
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
                            <Label htmlFor="settings-age-spar" className="text-xs text-muted-foreground">Age</Label>
                            <Input id="settings-age-spar"
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
              <TeamScheduleLink onOpen={() => navigate('/team')} />

              <WaterLoadingSwitch />

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
                        className="pl-10 h-10 w-full min-w-0 appearance-none"
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
                        className="pl-10 h-10 w-full min-w-0 appearance-none"
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
                <Label htmlFor="settings-weigh-in-time" className="text-xs">Weigh-in Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                  <Input id="settings-weigh-in-time"
                    type="time"
                    className="pl-10 h-10 font-mono w-full min-w-0 appearance-none"
                    value={getValue('weighInTime') || '07:00'}
                    onChange={(e) => handleChange({ weighInTime: e.target.value })}
                  />
                </div>
              </div>

              {/* Demo Mode: a developer tool for testing other days. Hidden from athletes,
                  except to clear a date that's already set. */}
              {(import.meta.env.DEV || simulatedDate) && (
                <div className="space-y-2 pt-3 border-t border-muted">
                  <Label className="text-xs flex items-center gap-2">
                    Demo Mode
                    <span className="text-xs text-muted-foreground font-normal">(Test different days)</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      className="flex-1 h-10 min-w-0 appearance-none"
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
              )}
            </TabsContent>

            {/* ═══ HEALTH TRACKER TAB ═══ */}
            <TabsContent value="health" className="px-4 pb-4 space-y-4 mt-0">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-semibold">Health Tracker</span>
                </div>

                {/* ── WHOOP (web and app) ── */}
                <WhoopCard onSynced={() => void hkSync.refreshData()} />

                {/* ── V5 SMART BAND SECTION ── */}
                {v5band.available ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Bluetooth className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-xs font-semibold">JCVital V5 Band</span>
                      <span className="text-xs text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-full font-medium">Direct BLE</span>
                    </div>

                    {/* Connection Status */}
                    <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          v5band.connected ? "bg-green-500" :
                          v5band.connecting ? "bg-yellow-500 animate-pulse" :
                          "bg-muted-foreground"
                        )} />
                        <div>
                          <span className="text-xs font-medium block">
                            {v5band.connected ? v5band.deviceName || "V5 Band Connected" :
                             v5band.connecting ? "Connecting..." :
                             v5band.scanning ? "Scanning..." :
                             "Not connected"}
                          </span>
                          {v5band.connected && v5band.batteryLevel != null && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <BatteryMedium className="w-3 h-3" />
                              {v5band.batteryLevel}%
                            </span>
                          )}
                        </div>
                      </div>

                      {v5band.connected ? (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={v5band.syncing}
                            onClick={() => v5band.syncNow()}
                          >
                            <RefreshCw className={cn("w-3 h-3 mr-1", v5band.syncing && "animate-spin")} />
                            {v5band.syncing ? "Syncing" : "Sync"}
                          </Button>
                          <Button
                            aria-label="Disconnect band"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() => v5band.disconnect()}
                          >
                            <X className="w-3 h-3" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : !v5band.scanning ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          disabled={v5band.connecting}
                          onClick={() => v5band.scan()}
                        >
                          <Search className="w-3 h-3 mr-1" />
                          Scan
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => v5band.stopScan()}
                        >
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Stop
                        </Button>
                      )}
                    </div>

                    {/* Discovered Devices */}
                    {!v5band.connected && v5band.devices.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Discovered Bands</Label>
                        {v5band.devices.map((device) => (
                          <button
                            key={device.deviceId}
                            onClick={() => v5band.connect(device.deviceId)}
                            disabled={v5band.connecting}
                            className="w-full flex items-center justify-between bg-muted/20 hover:bg-muted/40 rounded-lg p-2.5 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                              <span className="text-xs font-medium">{device.name}</span>
                            </div>
                            <span className="text-xs text-primary font-medium">Connect</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* No devices found */}
                    {!v5band.connected && !v5band.scanning && v5band.devices.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        Tap Scan to search for your V5 band. Make sure Bluetooth is on and the band is nearby.
                      </p>
                    )}

                    {/* Last Sync */}
                    {v5band.connected && v5band.lastSyncAt && (
                      <div className="text-xs text-muted-foreground/60 text-center">
                        Last synced: {new Date(v5band.lastSyncAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* ── DIVIDER between V5 Band and Apple Health ── */}
                {v5band.available && hkSync.available && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-muted" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-muted" />
                  </div>
                )}

                {/* ── APPLE HEALTH SECTION ── */}
                {hkSync.available ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Heart className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-xs font-semibold">Apple Health</span>
                      <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-full font-medium">Fallback</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {v5band.available
                        ? "Apple Health is used as a fallback when the V5 band is not directly connected."
                        : "Connect Apple Health to sync heart rate, HRV, sleep, and activity data into your Cut Score."}
                    </p>

                    {/* Authorization */}
                    <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          hkSync.authorized ? "bg-green-500" : "bg-muted-foreground"
                        )} />
                        <span className="text-xs font-medium">
                          {hkSync.authorized ? "Connected to Apple Health" : "Not connected"}
                        </span>
                      </div>
                      {!hkSync.authorized ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={async () => {
                            const success = await hkSync.authorize();
                            if (success) {
                              toast({ title: "Connected!", description: "Apple Health data will now sync to your Cut Score." });
                            }
                          }}
                        >
                          Connect
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={hkSync.syncing}
                          onClick={() => hkSync.syncNow()}
                        >
                          <RefreshCw className={cn("w-3 h-3 mr-1", hkSync.syncing && "animate-spin")} />
                          {hkSync.syncing ? "Syncing..." : "Sync Now"}
                        </Button>
                      )}
                    </div>

                    {/* Last Sync */}
                    {hkSync.authorized && hkSync.lastSyncAt && (
                      <div className="text-xs text-muted-foreground/60 text-center">
                        Last synced: {new Date(hkSync.lastSyncAt).toLocaleString()}
                        {hkSync.lastSyncCount > 0 && ` (${hkSync.lastSyncCount} day${hkSync.lastSyncCount > 1 ? 's' : ''} updated)`}
                      </div>
                    )}

                    {/* Data Types */}
                    {hkSync.authorized && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Syncing from Apple Health</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { icon: "❤️", label: "Heart Rate (HRV)" },
                            { icon: "💤", label: "Sleep Analysis" },
                            { icon: "🫁", label: "Blood Oxygen (SpO2)" },
                            { icon: "🌡️", label: "Body Temperature" },
                            { icon: "🏃", label: "Active Energy" },
                            { icon: "👟", label: "Step Count" },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center gap-1.5 bg-muted/20 rounded px-2 py-1.5">
                              <span className="text-xs">{item.icon}</span>
                              <span className="text-xs text-muted-foreground">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : !v5band.available ? (
                  /* Not running in Capacitor — web/PWA mode */
                  <div className="bg-muted/30 rounded-lg p-4 text-center space-y-3">
                    <Smartphone className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Native App Required</p>
                      <p className="text-xs text-muted-foreground">
                        Install the SPAR Nutrition iOS app to connect your V5 band directly or use Apple Health to sync health data.
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Cut Score Integration Note — show when any source is connected */}
                {(v5band.connected || (hkSync.available && hkSync.authorized)) && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className="w-3 h-3 text-green-500" />
                      <span className="text-xs font-semibold text-green-500">Premium Cut Score</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {v5band.connected
                        ? "V5 band data is feeding directly into your Cut Score recovery pillar. HRV, heart rate, and sleep quality drive your recovery readiness."
                        : "Apple Health data is feeding into the Cut Score recovery pillar. HRV, heart rate, and sleep quality are used to calculate your recovery readiness."}
                    </p>
                  </div>
                )}
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
                    <div className="grid grid-cols-4 gap-1">
                      {(['1-2', '3-4', '5-6', '7+'] as const).map((sessions) => {
                        const isSelected = (pendingChanges.trainingSessions || profile.trainingSessions || '3-4') === sessions;
                        return (
                          <button
                            key={sessions}
                            onClick={() => handleChange({ trainingSessions: sessions })}
                            className={cn(
                              "p-1.5 rounded border-2 text-center transition-all",
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
                  <div className="space-y-1">
                    <Label className="text-xs">Daily Activity Level</Label>
                    <div className="space-y-1">
                      {([
                        { value: 'mostly_sitting', label: 'Mostly Sitting' },
                        { value: 'on_feet_some', label: 'On Feet Some' },
                        { value: 'on_feet_most', label: 'On Feet Most' },
                      ] as const).map((opt) => {
                        const isSelected = (pendingChanges.workdayActivity || profile.workdayActivity || 'mostly_sitting') === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => handleChange({ workdayActivity: opt.value })}
                            className={cn(
                              "w-full p-1.5 rounded border-2 text-left transition-all flex items-center justify-between",
                              isSelected ? "border-primary bg-primary/10" : "border-muted"
                            )}
                          >
                            <span className="text-xs font-medium">{opt.label}</span>
                            {isSelected && <Check className="w-3 h-3 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
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
                bodyFatPercent={getValue('bodyFatPercent') ?? profile.bodyFatPercent}
                weighInDate={(getValue('weighInCleared') ?? profile.weighInCleared) ? null : (getValue('weighInDate') || profile.weighInDate)}
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
    </>
  );
}

// ── Alerts Tab ──────────────────────────────────────────────────────
function AlertsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPrefs());
  const [permission, setPermission] = useState(getPermissionState());

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

          />
          <ReminderRow
            label="Pre-Practice"
            icon={<Clock className="w-3.5 h-3.5 text-blue-500" />}
            enabled={prefs.prePracticeReminder}
            time={prefs.prePracticeTime}
            onToggle={(v) => update({ prePracticeReminder: v })}
            onTimeChange={(v) => update({ prePracticeTime: v })}

          />
          <ReminderRow
            label="Before Bed"
            icon={<Moon className="w-3.5 h-3.5 text-purple-500" />}
            enabled={prefs.beforeBedReminder}
            time={prefs.beforeBedTime}
            onToggle={(v) => update({ beforeBedReminder: v })}
            onTimeChange={(v) => update({ beforeBedTime: v })}

          />
        </div>
      )}
    </div>
  );
}

function ReminderRow({ label, icon, enabled, time, onToggle, onTimeChange }: {
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  time: string;
  onToggle: (v: boolean) => void;
  onTimeChange: (v: string) => void;
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
        <Input aria-label={`${label} reminder time`}
          type="time"
          className="w-[90px] h-8 text-xs font-mono px-2"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
        />
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
            <Button aria-label={copied ? "Link copied" : "Copy link"} variant="outline" size="sm" onClick={copyLink} className="h-auto px-2">
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
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

function TeamScheduleLink({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-left"
    >
      <span>
        <span className="block text-sm font-bold">Team schedule</span>
        <span className="block text-xs text-muted-foreground">Join your team, or set one up as a coach. Your weigh-in dates then fill in by themselves.</span>
      </span>
      <span className="text-sm font-bold text-primary shrink-0">Open</span>
    </button>
  );
}
