type MetricTagValue = string | number | boolean;
type MetricTags = Record<string, MetricTagValue>;

interface CounterMetric {
  name: string;
  value: number;
  tags: Record<string, string>;
}

interface GaugeMetric {
  name: string;
  value: number;
  tags: Record<string, string>;
}

interface TimingMetric {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  tags: Record<string, string>;
}

interface TimingAccumulator {
  name: string;
  count: number;
  totalMs: number;
  maxMs: number;
  tags: Record<string, string>;
}

const counters = new Map<string, CounterMetric>();
const gauges = new Map<string, GaugeMetric>();
const timings = new Map<string, TimingAccumulator>();

function normalizeTags(tags: MetricTags = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags)
      .filter((entry) => entry[1] != null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );
}

function buildMetricKey(name: string, tags: Record<string, string>): string {
  return `${name}:${JSON.stringify(tags)}`;
}

export function incrementCounter(name: string, tags: MetricTags = {}, amount = 1): void {
  const normalizedTags = normalizeTags(tags);
  const key = buildMetricKey(name, normalizedTags);
  const current = counters.get(key);

  if (current) {
    current.value += amount;
    return;
  }

  counters.set(key, {
    name,
    value: amount,
    tags: normalizedTags,
  });
}

export function setGauge(name: string, value: number, tags: MetricTags = {}): void {
  const normalizedTags = normalizeTags(tags);
  gauges.set(buildMetricKey(name, normalizedTags), {
    name,
    value,
    tags: normalizedTags,
  });
}

export function observeDuration(name: string, durationMs: number, tags: MetricTags = {}): void {
  const normalizedTags = normalizeTags(tags);
  const key = buildMetricKey(name, normalizedTags);
  const current = timings.get(key);

  if (current) {
    current.count += 1;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    return;
  }

  timings.set(key, {
    name,
    count: 1,
    totalMs: durationMs,
    maxMs: durationMs,
    tags: normalizedTags,
  });
}

export function snapshotMetrics(): {
  generatedAt: string;
  counters: CounterMetric[];
  gauges: GaugeMetric[];
  timings: TimingMetric[];
  process: {
    uptimeSeconds: number;
    rssMb: number;
    heapUsedMb: number;
  };
} {
  const now = new Date();
  const memory = process.memoryUsage();

  return {
    generatedAt: now.toISOString(),
    counters: [...counters.values()].sort((left, right) => left.name.localeCompare(right.name)),
    gauges: [...gauges.values()].sort((left, right) => left.name.localeCompare(right.name)),
    timings: [...timings.values()]
      .map((metric) => ({
        name: metric.name,
        count: metric.count,
        totalMs: Math.round(metric.totalMs),
        avgMs: Number((metric.totalMs / metric.count).toFixed(2)),
        maxMs: Math.round(metric.maxMs),
        tags: metric.tags,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    process: {
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      rssMb: Number((memory.rss / 1024 / 1024).toFixed(2)),
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
    },
  };
}

export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
  timings.clear();
}
