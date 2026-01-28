import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, addMonths, startOfWeek, endOfWeek, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Sun, Dumbbell, Moon, Scale, Calendar, TrendingDown, Pencil, Trash2, Plus, Check, X, Droplets, Utensils, Share2, Download, Copy } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type HistoryTab = 'weight' | 'hydration' | 'macros';

export default function History() {
  const { logs, profile, updateLog, deleteLog, addLog, getWeekDescentData, dailyTracking, getHydrationTarget, getMacroTargets } = useStore();
  const weekStartForExport = startOfWeek(new Date(), { weekStartsOn: 1 });
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<HistoryTab>('weight');
  const macroTargets = getMacroTargets();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newLogType, setNewLogType] = useState('');
  const [newLogWeight, setNewLogWeight] = useState('');
  const descentData = getWeekDescentData();
  const hydrationTarget = getHydrationTarget();
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Export data to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Weight (lbs)', 'Time'];
    const rows = logs.map(log => [
      format(new Date(log.date), 'yyyy-MM-dd'),
      log.type,
      log.weight,
      format(new Date(log.date), 'HH:mm')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weight-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    toast({ title: "Exported!", description: "Weight log exported to CSV" });
  };

  // Generate coach summary text
  const generateCoachSummary = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekLogs = logs.filter(log => new Date(log.date) >= weekStart);
    const morningLogs = weekLogs.filter(l => l.type === 'morning').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let summary = `📊 Weight Report - ${format(new Date(), 'MMM d, yyyy')}\n\n`;
    summary += `Target: ${profile.targetWeightClass} lbs\n`;

    if (descentData.startWeight && descentData.currentWeight) {
      summary += `Start of Week: ${descentData.startWeight.toFixed(1)} lbs\n`;
      summary += `Current: ${descentData.currentWeight.toFixed(1)} lbs\n`;
      if (descentData.totalLost !== null) {
        summary += `Progress: ${descentData.totalLost > 0 ? '-' : '+'}${Math.abs(descentData.totalLost).toFixed(1)} lbs\n`;
      }
      summary += `Days to Weigh-in: ${descentData.daysRemaining}\n`;
    }

    if (morningLogs.length > 0) {
      summary += `\n📈 Morning Weights:\n`;
      morningLogs.forEach(log => {
        summary += `  ${format(new Date(log.date), 'EEE')}: ${log.weight} lbs\n`;
      });
    }

    return summary;
  };

  // Copy summary to clipboard
  const copyToClipboard = async () => {
    const summary = generateCoachSummary();
    try {
      await navigator.clipboard.writeText(summary);
      toast({ title: "Copied!", description: "Summary copied to clipboard" });
    } catch {
      toast({ title: "Error", description: "Could not copy to clipboard", variant: "destructive" });
    }
    setShowExportMenu(false);
  };

  // Share via native share API
  const shareWithCoach = async () => {
    const summary = generateCoachSummary();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Weight Report',
          text: summary,
        });
      } catch {
        // User cancelled share
      }
    } else {
      // Fallback to clipboard
      await copyToClipboard();
    }
    setShowExportMenu(false);
  };

  // Export full backup as JSON
  const exportBackup = () => {
    const backup = {
      version: 1,
      exportDate: new Date().toISOString(),
      profile: {
        targetWeightClass: profile.targetWeightClass,
        currentWeight: profile.currentWeight,
        protocol: profile.protocol,
      },
      weightLogs: logs.map(log => ({
        date: new Date(log.date).toISOString(),
        weight: log.weight,
        type: log.type,
      })),
      dailyTracking: dailyTracking,
    };

    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pwm-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    toast({ title: "Backup Created!", description: "Full data backup exported" });
  };

  // Import backup from JSON file
  const importBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const backup = JSON.parse(text);

        if (backup.version !== 1) {
          toast({ title: "Error", description: "Unsupported backup version", variant: "destructive" });
          return;
        }

        // Import weight logs
        if (backup.weightLogs && Array.isArray(backup.weightLogs)) {
          for (const log of backup.weightLogs) {
            addLog({
              date: new Date(log.date),
              weight: log.weight,
              type: log.type,
            });
          }
        }

        toast({ title: "Import Complete!", description: `Imported ${backup.weightLogs?.length || 0} weight logs` });
      } catch {
        toast({ title: "Error", description: "Could not read backup file", variant: "destructive" });
      }
    };
    input.click();
    setShowExportMenu(false);
  };

  // Validate weight is reasonable (between 80 and 350 lbs for wrestling)
  const validateWeight = (w: number): boolean => {
    if (w < 80 || w > 350) {
      toast({
        title: "Invalid weight",
        description: "Weight must be between 80 and 350 lbs",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // Get calendar days for the current month view
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Get logs for a specific date
  const getLogsForDate = (date: Date) => {
    return logs.filter(log => {
      const logDate = new Date(log.date);
      return isSameDay(logDate, date);
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Check if a date has any logs
  const hasLogs = (date: Date) => {
    return logs.some(log => isSameDay(new Date(log.date), date));
  };

  // Get weight range for a date
  const getWeightRange = (date: Date) => {
    const dayLogs = getLogsForDate(date).filter(l =>
      l.type === 'morning' || l.type === 'pre-practice' || l.type === 'post-practice' || l.type === 'before-bed'
    );
    if (dayLogs.length === 0) return null;
    const weights = dayLogs.map(l => l.weight);
    return {
      high: Math.max(...weights),
      low: Math.min(...weights),
      morning: dayLogs.find(l => l.type === 'morning')?.weight,
      beforeBed: dayLogs.find(l => l.type === 'before-bed')?.weight
    };
  };

  const selectedDateLogs = selectedDate ? getLogsForDate(selectedDate) : [];

  // Get log type icon
  const getLogTypeIcon = (type: string) => {
    switch (type) {
      case 'morning': return <Sun className="w-4 h-4 text-yellow-500" />;
      case 'pre-practice': return <Dumbbell className="w-4 h-4 text-primary" />;
      case 'post-practice': return <Dumbbell className="w-4 h-4 text-orange-500" />;
      case 'before-bed': return <Moon className="w-4 h-4 text-purple-500" />;
      default: return <Scale className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Get log type label
  const getLogTypeLabel = (type: string) => {
    switch (type) {
      case 'morning': return 'Morning';
      case 'pre-practice': return 'Pre-Practice';
      case 'post-practice': return 'Post-Practice';
      case 'before-bed': return 'Before Bed';
      case 'extra-before': return 'Extra (Before)';
      case 'extra-after': return 'Extra (After)';
      default: return type;
    }
  };

  // Calculate daily change
  const getDailyChange = (date: Date) => {
    const range = getWeightRange(date);
    if (!range || !range.morning || !range.beforeBed) return null;
    return range.beforeBed - range.morning;
  };

  // Edit handlers
  const startEdit = (log: any) => {
    setEditingId(log.id);
    setEditWeight(log.weight.toString());
  };

  const saveEdit = () => {
    if (editingId && editWeight) {
      const weight = parseFloat(editWeight);
      if (!validateWeight(weight)) return;

      updateLog(editingId, { weight });
      setEditingId(null);
      setEditWeight('');

      // Blur to close keyboard on mobile
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditWeight('');
  };

  // Delete confirmation handler
  const confirmDelete = (id: string) => {
    deleteLog(id);
    setDeletingId(null);
  };

  // Get missing log types for a date
  const getMissingLogTypes = (date: Date): Array<'morning' | 'pre-practice' | 'post-practice' | 'before-bed'> => {
    const dayLogs = getLogsForDate(date);
    const loggedTypes = dayLogs.map(l => l.type);
    const allTypes: Array<'morning' | 'pre-practice' | 'post-practice' | 'before-bed'> = ['morning', 'pre-practice', 'post-practice', 'before-bed'];
    return allTypes.filter(type => !loggedTypes.includes(type));
  };

  // Add log handler
  const handleAddLog = () => {
    if (selectedDate && newLogType && newLogWeight) {
      const weight = parseFloat(newLogWeight);
      if (!isNaN(weight) && weight > 0) {
        if (!validateWeight(weight)) return;

        const logDate = new Date(selectedDate);
        // Set appropriate time based on log type
        if (newLogType === 'morning') logDate.setHours(7, 0, 0, 0);
        else if (newLogType === 'pre-practice') logDate.setHours(15, 0, 0, 0);
        else if (newLogType === 'post-practice') logDate.setHours(17, 0, 0, 0);
        else if (newLogType === 'before-bed') logDate.setHours(22, 0, 0, 0);

        addLog({
          weight,
          date: logDate,
          type: newLogType as any
        });

        // Blur to close keyboard on mobile
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    }
    setIsAddingLog(false);
    setNewLogType('');
    setNewLogWeight('');
  };

  const cancelAddLog = () => {
    setIsAddingLog(false);
    setNewLogType('');
    setNewLogWeight('');
  };

  return (
    <MobileLayout showNav={true}>
      {/* Header */}
      <header className="mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
              Tracking History
            </h2>
            <h1 className="text-2xl font-heading font-bold uppercase italic">
              History
            </h1>
          </div>
          {/* Export/Share Button */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="h-8"
            >
              <Share2 className="w-4 h-4 mr-1" />
              Share
            </Button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 mt-1 w-48 bg-card border border-muted rounded-lg shadow-lg z-50 py-1">
                  <button
                    onClick={shareWithCoach}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4 text-primary" />
                    Share with Coach
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                    Copy Summary
                  </button>
                  <button
                    onClick={exportToCSV}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-muted-foreground" />
                    Export CSV
                  </button>
                  <div className="border-t border-muted my-1" />
                  <button
                    onClick={exportBackup}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-green-500" />
                    Full Backup (JSON)
                  </button>
                  <button
                    onClick={importBackup}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-cyan-500" />
                    Import Backup
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Tab Buttons */}
      <div className="flex gap-1.5 mb-4">
        <Button
          variant={activeTab === 'weight' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('weight')}
          className={cn("flex-1 px-2", activeTab === 'weight' && "bg-primary text-black")}
        >
          <Scale className="w-4 h-4 mr-1" />
          Weight
        </Button>
        <Button
          variant={activeTab === 'hydration' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('hydration')}
          className={cn("flex-1 px-2", activeTab === 'hydration' && "bg-cyan-500 text-black hover:bg-cyan-600")}
        >
          <Droplets className="w-4 h-4 mr-1" />
          Water
        </Button>
        <Button
          variant={activeTab === 'macros' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('macros')}
          className={cn("flex-1 px-2", activeTab === 'macros' && "bg-orange-500 text-black hover:bg-orange-600")}
        >
          <Utensils className="w-4 h-4 mr-1" />
          Macros
        </Button>
      </div>

      {/* Weight Tab Content */}
      {activeTab === 'weight' && (
        <>
      {/* Week Summary Card - Only show with valid data */}
      {descentData.morningWeights.length >= 2 && descentData.totalLost !== null && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold uppercase text-muted-foreground">This Week</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {descentData.daysRemaining} day{descentData.daysRemaining !== 1 ? 's' : ''} to weigh-in
              </span>
            </div>

            {/* Stats Grid - Weight Progress */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <span className="text-[10px] text-muted-foreground block">Start</span>
                <span className="font-mono font-bold text-sm">
                  {descentData.startWeight?.toFixed(1) ?? '-'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Now</span>
                <span className="font-mono font-bold text-sm text-primary">
                  {descentData.currentWeight?.toFixed(1) ?? '-'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Lost</span>
                <span className={cn(
                  "font-mono font-bold text-sm",
                  descentData.totalLost > 0 ? "text-green-500" : "text-red-500"
                )}>
                  {descentData.totalLost > 0 ? `-${descentData.totalLost.toFixed(1)}` : `+${Math.abs(descentData.totalLost).toFixed(1)}`}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Goal</span>
                <span className="font-mono font-bold text-sm text-green-500">
                  {descentData.targetWeight}
                </span>
              </div>
            </div>

            {/* Loss Capacity Breakdown */}
            {(descentData.avgOvernightDrift !== null || descentData.avgPracticeLoss !== null) && (
              <div className="grid grid-cols-3 gap-2 text-center pt-2 mt-2 border-t border-muted">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Drift</span>
                  <span className={cn("font-mono font-bold text-xs", descentData.avgOvernightDrift !== null ? "text-cyan-500" : "")}>
                    {descentData.avgOvernightDrift !== null ? `-${descentData.avgOvernightDrift.toFixed(1)}` : '-'} lbs
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Practice</span>
                  <span className={cn("font-mono font-bold text-xs", descentData.avgPracticeLoss !== null ? "text-orange-500" : "")}>
                    {descentData.avgPracticeLoss !== null ? `-${descentData.avgPracticeLoss.toFixed(1)}` : '-'} lbs
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Projected</span>
                  <span className={cn(
                    "font-mono font-bold text-xs",
                    descentData.projectedSaturday !== null && descentData.projectedSaturday <= descentData.targetWeight
                      ? "text-green-500"
                      : descentData.projectedSaturday !== null && descentData.projectedSaturday <= descentData.targetWeight + 2
                        ? "text-orange-500"
                        : "text-red-500"
                  )}>
                    {descentData.projectedSaturday !== null ? `${descentData.projectedSaturday.toFixed(1)}` : '-'} lbs
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="font-bold text-lg">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card className="mb-4">
        <CardContent className="p-2">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const dayHasLogs = hasLogs(day);

              return (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedDate(day);
                    setIsAddingLog(false);
                    setEditingId(null);
                  }}
                  className={cn(
                    "aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all relative",
                    !isCurrentMonth && "text-muted-foreground/30",
                    isCurrentMonth && !dayHasLogs && "text-muted-foreground",
                    isCurrentMonth && dayHasLogs && "text-foreground font-bold",
                    isToday && "ring-2 ring-primary",
                    isSelected && "bg-primary text-black",
                    !isSelected && dayHasLogs && "bg-primary/10"
                  )}
                >
                  <span>{format(day, 'd')}</span>
                  {dayHasLogs && !isSelected && (
                    <div className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Details */}
      {selectedDate && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase text-muted-foreground">
              {format(selectedDate, 'EEEE, MMMM d')}
            </h3>
            {getMissingLogTypes(selectedDate).length > 0 && !isAddingLog && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAddingLog(true)}
                className="h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Log
              </Button>
            )}
          </div>

          {/* Add New Log Form */}
          {isAddingLog && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  <Plus className="w-4 h-4" />
                  Add Log
                </div>
                <div className="flex items-center gap-2">
                  <Select value={newLogType} onValueChange={setNewLogType}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMissingLogTypes(selectedDate).map(type => (
                        <SelectItem key={type} value={type}>
                          {getLogTypeLabel(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Weight"
                    value={newLogWeight}
                    onChange={(e) => setNewLogWeight(e.target.value)}
                    className="w-20 h-9 font-mono"
                  />
                  <span className="text-sm text-muted-foreground">lbs</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddLog} disabled={!newLogType || !newLogWeight} className="h-8">
                    <Check className="w-3 h-3 mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelAddLog} className="h-8">
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Day Summary */}
          {selectedDateLogs.length > 0 && (() => {
            const range = getWeightRange(selectedDate);
            const dailyChange = getDailyChange(selectedDate);
            if (!range) return null;

            return (
              <Card className="border-muted bg-muted/20">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Day Summary</span>
                    {dailyChange !== null && (
                      <span className={cn(
                        "text-xs font-mono font-bold",
                        dailyChange < 0 ? "text-green-500" : "text-yellow-500"
                      )}>
                        {dailyChange > 0 ? '+' : ''}{dailyChange.toFixed(1)} lbs
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1">
                    {range.morning && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">AM: </span>
                        <span className="font-mono font-bold">{range.morning}</span>
                      </div>
                    )}
                    {range.beforeBed && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">PM: </span>
                        <span className="font-mono font-bold">{range.beforeBed}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Individual Logs */}
          {selectedDateLogs.length === 0 && !isAddingLog ? (
            <Card className="border-dashed border-muted">
              <CardContent className="p-4 text-center">
                <p className="text-muted-foreground text-sm mb-2">No logs for this day</p>
                <Button size="sm" variant="outline" onClick={() => setIsAddingLog(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add First Log
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {selectedDateLogs.map((log) => (
                <Card key={log.id} className="border-muted">
                  <CardContent className="p-3">
                    {editingId === log.id ? (
                      // Edit mode
                      <div className="flex items-center gap-2">
                        {getLogTypeIcon(log.type)}
                        <span className="text-sm font-bold">{getLogTypeLabel(log.type)}</span>
                        <Input
                          type="number"
                          step="0.1"
                          value={editWeight}
                          onChange={(e) => setEditWeight(e.target.value)}
                          className="w-20 h-8 font-mono ml-auto"
                          autoFocus
                        />
                        <span className="text-sm text-muted-foreground">lbs</span>
                        <Button size="icon" variant="ghost" onClick={saveEdit} className="h-8 w-8">
                          <Check className="w-4 h-4 text-green-500" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-8 w-8">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : deletingId === log.id ? (
                      // Delete confirmation mode
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getLogTypeIcon(log.type)}
                          <span className="text-sm font-bold text-destructive">Delete this log?</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => confirmDelete(log.id)}
                            className="h-7 text-xs"
                          >
                            <Check className="w-3 h-3 mr-1" /> Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletingId(null)}
                            className="h-7 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getLogTypeIcon(log.type)}
                          <div>
                            <span className="font-bold text-sm">{getLogTypeLabel(log.type)}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {format(new Date(log.date), 'h:mm a')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-lg">{log.weight} lbs</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEdit(log)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeletingId(log.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No date selected */}
      {!selectedDate && (
        <Card className="border-muted">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Select a date to view or edit logs</p>
          </CardContent>
        </Card>
      )}
        </>
      )}

      {/* Hydration Tab Content */}
      {activeTab === 'hydration' && (
        <HydrationHistory dailyTracking={dailyTracking} targetOz={hydrationTarget.targetOz} />
      )}

      {/* Macros Tab Content */}
      {activeTab === 'macros' && (
        <MacroHistory dailyTracking={dailyTracking} macroTargets={macroTargets} />
      )}

      {/* Bottom Spacing */}
      <div className="h-20" />
    </MobileLayout>
  );
}

// Hydration History Component
interface HydrationHistoryProps {
  dailyTracking: Array<{ date: string; waterConsumed: number; carbsConsumed: number; proteinConsumed: number }>;
  targetOz: number;
}

function HydrationHistory({ dailyTracking, targetOz }: HydrationHistoryProps) {
  const today = new Date();

  // Get last 14 days of data
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const date = subDays(today, 13 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const tracking = dailyTracking.find(t => t.date === dateStr);
    return {
      date,
      dateStr,
      waterConsumed: tracking?.waterConsumed || 0,
      dayLabel: format(date, 'EEE'),
      dayNum: format(date, 'd'),
      isToday: isSameDay(date, today)
    };
  });

  // Calculate stats
  const daysWithData = last14Days.filter(d => d.waterConsumed > 0);
  const totalConsumed = daysWithData.reduce((sum, d) => sum + d.waterConsumed, 0);
  const avgDaily = daysWithData.length > 0 ? totalConsumed / daysWithData.length : 0;
  const daysHitTarget = daysWithData.filter(d => d.waterConsumed >= targetOz).length;
  const maxWater = Math.max(...last14Days.map(d => d.waterConsumed), targetOz);

  // Get last 7 days for weekly summary
  const last7Days = last14Days.slice(-7);
  const weeklyTotal = last7Days.reduce((sum, d) => sum + d.waterConsumed, 0);
  const weeklyAvg = weeklyTotal / 7;

  return (
    <div className="space-y-4">
      {/* Weekly Summary */}
      <Card className="border-cyan-500/30 bg-cyan-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Droplets className="w-4 h-4 text-cyan-500" />
            <span className="text-xs font-bold uppercase text-muted-foreground">This Week</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <span className="text-[10px] text-muted-foreground block">Total</span>
              <span className="font-mono font-bold text-lg text-cyan-500">{weeklyTotal}</span>
              <span className="text-[10px] text-muted-foreground"> oz</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Daily Avg</span>
              <span className="font-mono font-bold text-lg">{weeklyAvg.toFixed(0)}</span>
              <span className="text-[10px] text-muted-foreground"> oz</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Target</span>
              <span className="font-mono font-bold text-lg text-primary">{targetOz}</span>
              <span className="text-[10px] text-muted-foreground"> oz</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Stats */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-muted-foreground">14-Day Performance</span>
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded",
              daysHitTarget >= 10 ? "bg-green-500/20 text-green-500" :
              daysHitTarget >= 7 ? "bg-cyan-500/20 text-cyan-500" :
              daysHitTarget >= 4 ? "bg-yellow-500/20 text-yellow-500" :
              "bg-red-500/20 text-red-500"
            )}>
              {daysHitTarget}/14 days on target
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <span className="text-[10px] text-muted-foreground block">Avg Daily Intake</span>
              <span className={cn(
                "font-mono font-bold text-xl",
                avgDaily >= targetOz ? "text-green-500" : avgDaily >= targetOz * 0.75 ? "text-cyan-500" : "text-yellow-500"
              )}>
                {avgDaily.toFixed(0)}
              </span>
              <span className="text-[10px] text-muted-foreground"> oz</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Target Hit Rate</span>
              <span className={cn(
                "font-mono font-bold text-xl",
                daysHitTarget / 14 >= 0.7 ? "text-green-500" : daysHitTarget / 14 >= 0.5 ? "text-cyan-500" : "text-yellow-500"
              )}>
                {((daysHitTarget / 14) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Chart */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <span className="text-xs font-bold uppercase text-muted-foreground block mb-3">Daily Intake (Last 14 Days)</span>

          {/* Bar Chart */}
          <div className="flex items-end gap-1 h-32 mb-2">
            {last14Days.map((day, i) => {
              const heightPercent = maxWater > 0 ? (day.waterConsumed / maxWater) * 100 : 0;
              const hitTarget = day.waterConsumed >= targetOz;
              const targetHeightPercent = maxWater > 0 ? (targetOz / maxWater) * 100 : 0;

              return (
                <div key={i} className="flex-1 flex flex-col items-center relative h-full">
                  {/* Target line marker */}
                  {i === 0 && (
                    <div
                      className="absolute w-[calc(1400%+13*4px)] left-0 border-t-2 border-dashed border-primary/40 z-10"
                      style={{ bottom: `${targetHeightPercent}%` }}
                    />
                  )}
                  {/* Bar */}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        day.isToday ? "bg-cyan-500" : hitTarget ? "bg-cyan-500/70" : day.waterConsumed > 0 ? "bg-cyan-500/40" : "bg-muted/30"
                      )}
                      style={{ height: `${Math.max(heightPercent, day.waterConsumed > 0 ? 5 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day Labels */}
          <div className="flex gap-1">
            {last14Days.map((day, i) => (
              <div key={i} className="flex-1 text-center">
                <span className={cn(
                  "text-[8px]",
                  day.isToday ? "text-cyan-500 font-bold" : "text-muted-foreground"
                )}>
                  {day.dayNum}
                </span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-muted">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-cyan-500" />
              <span className="text-[10px] text-muted-foreground">Today</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-cyan-500/70" />
              <span className="text-[10px] text-muted-foreground">Hit Target</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-cyan-500/40" />
              <span className="text-[10px] text-muted-foreground">Under Target</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Details */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <span className="text-xs font-bold uppercase text-muted-foreground block mb-3">Daily Details</span>
          <div className="space-y-2">
            {[...last14Days].reverse().map((day, i) => (
              <div key={i} className={cn(
                "flex items-center justify-between py-2 border-b border-muted last:border-0",
                day.isToday && "bg-cyan-500/5 -mx-2 px-2 rounded"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-medium",
                    day.isToday ? "text-cyan-500" : "text-foreground"
                  )}>
                    {day.isToday ? 'Today' : format(day.date, 'EEE, MMM d')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-mono font-bold",
                    day.waterConsumed >= targetOz ? "text-green-500" :
                    day.waterConsumed >= targetOz * 0.75 ? "text-cyan-500" :
                    day.waterConsumed > 0 ? "text-yellow-500" : "text-muted-foreground"
                  )}>
                    {day.waterConsumed > 0 ? `${day.waterConsumed} oz` : '—'}
                  </span>
                  {day.waterConsumed >= targetOz && (
                    <Check className="w-4 h-4 text-green-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {daysWithData.length === 0 && (
        <Card className="border-dashed border-muted">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Droplets className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No hydration data yet</p>
            <p className="text-xs mt-1">Start tracking water on the dashboard</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Macro History Component
interface MacroHistoryProps {
  dailyTracking: Array<{ date: string; waterConsumed: number; carbsConsumed: number; proteinConsumed: number }>;
  macroTargets: { carbs: { min: number; max: number }; protein: { min: number; max: number }; ratio: string };
}

function MacroHistory({ dailyTracking, macroTargets }: MacroHistoryProps) {
  const today = new Date();

  // Get last 14 days of data
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const date = subDays(today, 13 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const tracking = dailyTracking.find(t => t.date === dateStr);
    return {
      date,
      dateStr,
      carbsConsumed: tracking?.carbsConsumed || 0,
      proteinConsumed: tracking?.proteinConsumed || 0,
      dayLabel: format(date, 'EEE'),
      dayNum: format(date, 'd'),
      isToday: isSameDay(date, today)
    };
  });

  // Calculate stats
  const daysWithCarbData = last14Days.filter(d => d.carbsConsumed > 0);
  const daysWithProteinData = last14Days.filter(d => d.proteinConsumed > 0);

  const totalCarbs = daysWithCarbData.reduce((sum, d) => sum + d.carbsConsumed, 0);
  const totalProtein = daysWithProteinData.reduce((sum, d) => sum + d.proteinConsumed, 0);

  const avgDailyCarbs = daysWithCarbData.length > 0 ? totalCarbs / daysWithCarbData.length : 0;
  const avgDailyProtein = daysWithProteinData.length > 0 ? totalProtein / daysWithProteinData.length : 0;

  const carbTargetMid = (macroTargets.carbs.min + macroTargets.carbs.max) / 2;
  const proteinTargetMid = (macroTargets.protein.min + macroTargets.protein.max) / 2;

  const daysHitCarbTarget = daysWithCarbData.filter(d =>
    d.carbsConsumed >= macroTargets.carbs.min && d.carbsConsumed <= macroTargets.carbs.max * 1.1
  ).length;
  const daysHitProteinTarget = daysWithProteinData.filter(d =>
    d.proteinConsumed >= macroTargets.protein.min && d.proteinConsumed <= macroTargets.protein.max * 1.1
  ).length;

  const maxCarbs = Math.max(...last14Days.map(d => d.carbsConsumed), macroTargets.carbs.max);
  const maxProtein = Math.max(...last14Days.map(d => d.proteinConsumed), macroTargets.protein.max);

  // Last 7 days summary
  const last7Days = last14Days.slice(-7);
  const weeklyCarbs = last7Days.reduce((sum, d) => sum + d.carbsConsumed, 0);
  const weeklyProtein = last7Days.reduce((sum, d) => sum + d.proteinConsumed, 0);

  const hasData = daysWithCarbData.length > 0 || daysWithProteinData.length > 0;

  return (
    <div className="space-y-4">
      {/* Weekly Summary */}
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Utensils className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-bold uppercase text-muted-foreground">This Week</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <span className="text-[10px] text-muted-foreground block">Total Carbs</span>
              <span className="font-mono font-bold text-lg text-primary">{weeklyCarbs}g</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-muted-foreground block">Total Protein</span>
              <span className="font-mono font-bold text-lg text-orange-500">{weeklyProtein}g</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Averages */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <span className="text-xs font-bold uppercase text-muted-foreground block mb-3">14-Day Averages</span>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <span className="text-[10px] text-muted-foreground block">Avg Daily Carbs</span>
              <span className={cn(
                "font-mono font-bold text-xl",
                avgDailyCarbs >= macroTargets.carbs.min ? "text-green-500" : avgDailyCarbs >= macroTargets.carbs.min * 0.75 ? "text-primary" : "text-yellow-500"
              )}>
                {avgDailyCarbs.toFixed(0)}g
              </span>
              <span className="text-[9px] text-muted-foreground block">
                Target: {macroTargets.carbs.min}-{macroTargets.carbs.max}g
              </span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-muted-foreground block">Avg Daily Protein</span>
              <span className={cn(
                "font-mono font-bold text-xl",
                avgDailyProtein >= macroTargets.protein.min ? "text-green-500" : avgDailyProtein >= macroTargets.protein.min * 0.75 ? "text-orange-500" : "text-yellow-500"
              )}>
                {avgDailyProtein.toFixed(0)}g
              </span>
              <span className="text-[9px] text-muted-foreground block">
                Target: {macroTargets.protein.min}-{macroTargets.protein.max}g
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Carbs Chart */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-muted-foreground">Daily Carbs (Last 14 Days)</span>
            <span className="text-[10px] text-primary font-mono">Target: {macroTargets.carbs.min}-{macroTargets.carbs.max}g</span>
          </div>

          {/* Bar Chart */}
          <div className="flex items-end gap-1 h-24 mb-2">
            {last14Days.map((day, i) => {
              const heightPercent = maxCarbs > 0 ? (day.carbsConsumed / maxCarbs) * 100 : 0;
              const inRange = day.carbsConsumed >= macroTargets.carbs.min && day.carbsConsumed <= macroTargets.carbs.max * 1.1;
              const targetHeightPercent = maxCarbs > 0 ? (carbTargetMid / maxCarbs) * 100 : 0;

              return (
                <div key={i} className="flex-1 flex flex-col items-center relative h-full">
                  {i === 0 && (
                    <div
                      className="absolute w-[calc(1400%+13*4px)] left-0 border-t-2 border-dashed border-primary/40 z-10"
                      style={{ bottom: `${targetHeightPercent}%` }}
                    />
                  )}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        day.isToday ? "bg-primary" : inRange ? "bg-primary/70" : day.carbsConsumed > 0 ? "bg-primary/40" : "bg-muted/30"
                      )}
                      style={{ height: `${Math.max(heightPercent, day.carbsConsumed > 0 ? 5 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day Labels */}
          <div className="flex gap-1">
            {last14Days.map((day, i) => (
              <div key={i} className="flex-1 text-center">
                <span className={cn("text-[8px]", day.isToday ? "text-primary font-bold" : "text-muted-foreground")}>
                  {day.dayNum}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Protein Chart */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-muted-foreground">Daily Protein (Last 14 Days)</span>
            <span className="text-[10px] text-orange-500 font-mono">Target: {macroTargets.protein.min}-{macroTargets.protein.max}g</span>
          </div>

          {/* Bar Chart */}
          <div className="flex items-end gap-1 h-24 mb-2">
            {last14Days.map((day, i) => {
              const heightPercent = maxProtein > 0 ? (day.proteinConsumed / maxProtein) * 100 : 0;
              const inRange = day.proteinConsumed >= macroTargets.protein.min && day.proteinConsumed <= macroTargets.protein.max * 1.1;
              const targetHeightPercent = maxProtein > 0 ? (proteinTargetMid / maxProtein) * 100 : 0;

              return (
                <div key={i} className="flex-1 flex flex-col items-center relative h-full">
                  {i === 0 && (
                    <div
                      className="absolute w-[calc(1400%+13*4px)] left-0 border-t-2 border-dashed border-orange-500/40 z-10"
                      style={{ bottom: `${targetHeightPercent}%` }}
                    />
                  )}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={cn(
                        "w-full rounded-t transition-all",
                        day.isToday ? "bg-orange-500" : inRange ? "bg-orange-500/70" : day.proteinConsumed > 0 ? "bg-orange-500/40" : "bg-muted/30"
                      )}
                      style={{ height: `${Math.max(heightPercent, day.proteinConsumed > 0 ? 5 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day Labels */}
          <div className="flex gap-1">
            {last14Days.map((day, i) => (
              <div key={i} className="flex-1 text-center">
                <span className={cn("text-[8px]", day.isToday ? "text-orange-500 font-bold" : "text-muted-foreground")}>
                  {day.dayNum}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily Details */}
      <Card className="border-muted">
        <CardContent className="p-4">
          <span className="text-xs font-bold uppercase text-muted-foreground block mb-3">Daily Details</span>
          <div className="space-y-2">
            {[...last14Days].reverse().map((day, i) => (
              <div key={i} className={cn(
                "flex items-center justify-between py-2 border-b border-muted last:border-0",
                day.isToday && "bg-orange-500/5 -mx-2 px-2 rounded"
              )}>
                <span className={cn(
                  "text-sm font-medium",
                  day.isToday ? "text-orange-500" : "text-foreground"
                )}>
                  {day.isToday ? 'Today' : format(day.date, 'EEE, MMM d')}
                </span>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <span className={cn(
                      "font-mono font-bold",
                      day.carbsConsumed > 0 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {day.carbsConsumed > 0 ? `${day.carbsConsumed}g` : '—'}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-1">carbs</span>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "font-mono font-bold",
                      day.proteinConsumed > 0 ? "text-orange-500" : "text-muted-foreground"
                    )}>
                      {day.proteinConsumed > 0 ? `${day.proteinConsumed}g` : '—'}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-1">protein</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {!hasData && (
        <Card className="border-dashed border-muted">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Utensils className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No macro data yet</p>
            <p className="text-xs mt-1">Start tracking on the dashboard</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
