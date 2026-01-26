import { MobileLayout } from "@/components/mobile-layout";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, addMonths, startOfWeek, endOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Sun, Dumbbell, Moon, Scale, Calendar, TrendingDown, Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { useState } from "react";

export default function History() {
  const { logs, profile, updateLog, deleteLog, addLog, getWeekDescentData } = useStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newLogType, setNewLogType] = useState('');
  const [newLogWeight, setNewLogWeight] = useState('');
  const descentData = getWeekDescentData();

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
      updateLog(editingId, { weight: parseFloat(editWeight) });
      setEditingId(null);
      setEditWeight('');
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
      <header className="mb-6">
        <h2 className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-1">
          Weight Log
        </h2>
        <h1 className="text-2xl font-heading font-bold uppercase italic">
          History
        </h1>
      </header>

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

            {/* Stats Grid */}
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

      {/* Bottom Spacing */}
      <div className="h-20" />
    </MobileLayout>
  );
}
