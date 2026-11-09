import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Area, ReferenceLine, ReferenceDot, ComposedChart } from 'recharts';
import { useStore } from '@/lib/store';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks, startOfMonth, endOfMonth, eachWeekOfInterval, differenceInDays, startOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, TrendingDown, TrendingUp, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { waterLoadingActive } from "@/lib/constants";
import { useTeam } from "@/hooks/use-team";
import { dayTarget, knownWeighIns, morningWeightsByDay } from "@/lib/weight-chart";

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

  // Same morning weights and daily targets as the chart on Today, over a longer window.
  const team = useTeam();
  const targetInput = {
    today,
    weighInDate: new Date(profile.weighInDate),
    weightClass: profile.targetWeightClass,
    protocol: profile.protocol,
    waterLoading: waterLoadingActive(profile),
    knownWeighIns: knownWeighIns(logs, team.membership),
  };
  const shouldWeigh = (day: Date) => (profile.weighInCleared ? undefined : dayTarget(day, targetInput) ?? undefined);

  const dailyMorningData = (days: number, label: (d: Date) => string) => {
    const data = [];
    const morningWeights = morningWeightsByDay(logs);
    for (let i = days - 1; i >= 0; i--) {
      const day = subDays(today, i);
      const dateStr = format(day, 'yyyy-MM-dd');
      data.push({
        date: label(day),
        fullDate: dateStr,
        weight: morningWeights.get(dateStr) ?? null,
        target: profile.targetWeightClass,
        projected: shouldWeigh(day),
        isToday: i === 0,
      });
    }
    return data;
  };

  const getWeekData = () => dailyMorningData(7, d => format(d, 'EEE'));

  const get4WeekData = () => dailyMorningData(28, d => format(d, 'M/d'));

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
          format(new Date(l.date), 'yyyy-MM-dd') === dateStr && (l.type === 'morning' || l.type === 'weigh-in')
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
        projected: undefined as number | undefined, // A weekly average has no single target
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
  const targets = data.map(d => d.projected).filter((t): t is number => t !== undefined);
  const allNumbers = [...validWeights, ...targets];
  const lowest = allNumbers.length > 0 ? Math.min(...allNumbers) : profile.targetWeightClass;
  // Like Today's chart: a class far below the numbers would flatten them.
  const showClass = lowest - profile.targetWeightClass <= 8;
  const minWeight = Math.floor(Math.min(lowest, showClass ? profile.targetWeightClass : lowest)) - 1;
  const maxWeight = Math.ceil(Math.max(lowest, ...allNumbers)) + 1;

  return (
    <Card className="border-muted bg-card">
      <CardHeader className="pb-2 pt-4 py-3 border-b border-muted/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Weight Trend
            {trend !== null && (
              <span className={cn(
                "ml-2 flex items-center gap-1 text-xs font-bold",
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
                className="h-6 px-2 text-xs"
              >
                {mode === 'week' ? '7d' : mode === '4week' ? '28d' : '4wk'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-[200px] mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 18, left: -20, bottom: 0 }}>
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
              interval={viewMode === '4week' ? 6 : 0}
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
                      fontSize={12}
                      fontWeight={item?.isToday ? 600 : 400}
                    >
                      {payload.value}
                    </text>
                  </g>
                );
              }}
              height={25}
            />
            <YAxis
              domain={[minWeight, maxWeight]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
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
                if (name === 'projected') return [`${value} lbs`, 'Should weigh'];
                if (name === 'weight') return [`${value} lbs`, 'Weighed'];
                if (name === 'target') return [`${value} lbs`, 'Class'];
                return [`${value} lbs`, ''];
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '0.25rem', fontWeight: 600 }}
            />
            {/* What they should weigh each day */}
            <Line
              type="linear"
              dataKey="projected"
              connectNulls={false}
              isAnimationActive={false}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              name="projected"
            />
            {/* Weight class */}
            {showClass && (
              <Line
                type="linear"
                dataKey="target"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                name="target"
              />
            )}
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
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>

      {/* Legend */}
      <div className="px-4 py-2 flex items-center justify-center gap-4 text-xs border-t border-muted/30">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-primary rounded" />
          <span className="text-muted-foreground">Weighed</span>
        </div>
        {targets.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 border-t-2 border-dashed border-muted-foreground" />
            <span className="text-muted-foreground">Should weigh</span>
          </div>
        )}
        {showClass ? (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-primary rounded" />
            <span className="text-muted-foreground">{profile.targetWeightClass} class</span>
          </div>
        ) : <span className="text-muted-foreground">{profile.targetWeightClass} class is below this chart</span>}
      </div>

      {/* Stats Row */}
      {validWeights.length >= 2 && (
        <div className="px-4 pb-3 flex justify-between text-xs text-muted-foreground border-t border-muted/30 pt-2 mt-2">
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
