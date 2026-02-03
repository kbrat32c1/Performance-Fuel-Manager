import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Area, AreaChart, ReferenceLine, ReferenceDot } from 'recharts';
import { useStore } from '@/lib/store';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks, startOfMonth, endOfMonth, eachWeekOfInterval, differenceInDays, startOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, TrendingDown, TrendingUp, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateTargetWeight, getPhaseForDaysUntil } from '@/lib/constants';

type ViewMode = 'week' | 'month' | '4week';

export function TrendChart() {
  const { logs, profile } = useStore();
  const [viewMode, setViewMode] = useState<ViewMode>('week');

  const today = profile.simulatedDate || new Date();

  // Build data based on view mode
  const getData = () => {
    if (viewMode === 'week') {
      return getWeekData();
    } else if (viewMode === 'month') {
      return getMonthData();
    } else {
      return get4WeekData();
    }
  };

  const getWeekData = () => {
    const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(today, { weekStartsOn: 1 }); // Sunday
    const days = eachDayOfInterval({ start, end });
    const weighInDate = profile.weighInDate ? startOfDay(new Date(profile.weighInDate)) : null;

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');

      // Find morning log for this day
      const morningLog = logs.find(l =>
        format(new Date(l.date), 'yyyy-MM-dd') === dateStr && l.type === 'morning'
      );
      const anyLog = logs.find(l => format(new Date(l.date), 'yyyy-MM-dd') === dateStr);
      const log = morningLog || anyLog;

      // Calculate days until weigh-in for this day to get projected target
      const daysUntil = weighInDate ? differenceInDays(weighInDate, startOfDay(day)) : 7;
      const projectedTarget = calculateTargetWeight(profile.targetWeightClass, daysUntil, profile.protocol);
      const phase = getPhaseForDaysUntil(daysUntil);

      return {
        date: format(day, 'EEE'),
        shortDate: format(day, 'M/d'),
        fullDate: dateStr,
        weight: log ? log.weight : null,
        target: profile.targetWeightClass,
        projected: projectedTarget.withWaterLoad || projectedTarget.base,
        phase,
        daysUntil,
        isToday: format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
      };
    });
  };

  const get4WeekData = () => {
    // Last 4 weeks of morning weights (one point per day)
    const data = [];
    for (let i = 27; i >= 0; i--) {
      const day = subDays(today, i);
      const dateStr = format(day, 'yyyy-MM-dd');

      const morningLog = logs.find(l =>
        format(new Date(l.date), 'yyyy-MM-dd') === dateStr && l.type === 'morning'
      );

      data.push({
        date: format(day, 'M/d'),
        fullDate: dateStr,
        weight: morningLog ? morningLog.weight : null,
        target: profile.targetWeightClass,
        isToday: i === 0
      });
    }
    return data;
  };

  const getMonthData = () => {
    // Weekly averages for the past month
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

      const weekLogs = weekDays.flatMap(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        return logs.filter(l =>
          format(new Date(l.date), 'yyyy-MM-dd') === dateStr && l.type === 'morning'
        );
      });

      const avgWeight = weekLogs.length > 0
        ? weekLogs.reduce((sum, l) => sum + l.weight, 0) / weekLogs.length
        : null;

      weeks.push({
        date: `Wk ${format(weekStart, 'M/d')}`,
        fullDate: format(weekStart, 'yyyy-MM-dd'),
        weight: avgWeight ? parseFloat(avgWeight.toFixed(1)) : null,
        target: profile.targetWeightClass,
        isToday: i === 0
      });
    }
    return weeks;
  };

  const data = getData();

  // Calculate trend
  const validWeights = data.filter(d => d.weight !== null).map(d => d.weight as number);
  const trend = validWeights.length >= 2
    ? validWeights[validWeights.length - 1] - validWeights[0]
    : null;

  // Calculate min/max for chart domain
  const allWeights = validWeights.length > 0 ? validWeights : [profile.targetWeightClass];
  const minWeight = Math.min(...allWeights, profile.targetWeightClass) - 2;
  const maxWeight = Math.max(...allWeights, profile.targetWeightClass) + 2;

  return (
    <Card className="border-muted bg-card">
      <CardHeader className="pb-2 pt-4 py-3 border-b border-muted/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Weight Trend
            {trend !== null && (
              <span className={cn(
                "ml-2 flex items-center gap-1 text-[10px] font-bold",
                trend < 0 ? "text-green-500" : trend > 0 ? "text-orange-500" : "text-muted-foreground"
              )}>
                {trend < 0 ? <TrendingDown className="w-3 h-3" /> : trend > 0 ? <TrendingUp className="w-3 h-3" /> : null}
                {trend > 0 ? '+' : ''}{trend.toFixed(1)} lbs
              </span>
            )}
          </CardTitle>
          <div className="flex gap-1">
            {(['week', '4week', 'month'] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode(mode)}
                className="h-6 px-2 text-[10px]"
              >
                {mode === 'week' ? '7d' : mode === '4week' ? '28d' : '4wk'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-[200px] mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.4} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={({ x, y, payload }) => {
                const item = data.find(d => d.date === payload.value);
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={12}
                      textAnchor="middle"
                      fill={item?.isToday ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                      fontSize={10}
                      fontWeight={item?.isToday ? 600 : 400}
                    >
                      {payload.value}
                    </text>
                    {viewMode === 'week' && item?.shortDate && (
                      <text
                        x={0}
                        y={0}
                        dy={22}
                        textAnchor="middle"
                        fill="hsl(var(--muted-foreground))"
                        fontSize={8}
                        opacity={0.7}
                      >
                        {item.shortDate}
                      </text>
                    )}
                  </g>
                );
              }}
              height={viewMode === 'week' ? 35 : 25}
            />
            <YAxis
              domain={[minWeight, maxWeight]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderColor: 'hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
              formatter={(value: number, name: string) => {
                if (name === 'projected') return [`${value} lbs`, 'Target'];
                if (name === 'weight') return [`${value} lbs`, 'Actual'];
                return [`${value} lbs`, ''];
              }}
              labelFormatter={(label) => {
                const item = data.find(d => d.date === label);
                if (item?.phase && viewMode === 'week') {
                  return `${label} ${item.shortDate || ''} • ${item.phase}`;
                }
                return label;
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.25rem', fontWeight: 600 }}
            />
            {/* Projected Daily Target Line (only for week view) */}
            {viewMode === 'week' && (
              <Line
                type="monotone"
                dataKey="projected"
                stroke="hsl(var(--chart-5))"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 2, fill: 'hsl(var(--chart-5))', strokeWidth: 0 }}
                opacity={0.7}
                activeDot={false}
                name="projected"
              />
            )}
            {/* Competition Weight Reference Line */}
            <Line
              type="monotone"
              dataKey="target"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="2 2"
              dot={false}
              opacity={0.3}
              activeDot={false}
              name="target"
            />
            {/* Actual Weight Area */}
            <Area
              type="monotone"
              dataKey="weight"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#weightGradient)"
              dot={{ r: 3, fill: 'hsl(var(--background))', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
              connectNulls
              name="weight"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>

      {/* Legend (only for week view with projected line) */}
      {viewMode === 'week' && (
        <div className="px-4 py-2 flex items-center justify-center gap-4 text-[10px] border-t border-muted/30">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-primary rounded" />
            <span className="text-muted-foreground">Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-green-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)' }} />
            <span className="text-muted-foreground">Daily Target</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-muted-foreground/30 rounded" />
            <span className="text-muted-foreground">{profile.targetWeightClass} lbs</span>
          </div>
        </div>
      )}

      {/* Stats Row */}
      {validWeights.length >= 2 && (
        <div className="px-4 pb-3 flex justify-between text-[10px] text-muted-foreground border-t border-muted/30 pt-2 mt-2">
          <div>
            <span className="font-bold">Start:</span> {validWeights[0].toFixed(1)} lbs
          </div>
          <div>
            <span className="font-bold">Current:</span>{' '}
            <span className="text-foreground font-mono">
              {validWeights[validWeights.length - 1].toFixed(1)} lbs
            </span>
          </div>
          <div>
            <span className="font-bold">Target:</span>{' '}
            <span className="text-primary font-mono">{profile.targetWeightClass} lbs</span>
          </div>
        </div>
      )}
    </Card>
  );
}
