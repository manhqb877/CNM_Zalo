import { Registry, collectDefaultMetrics } from 'prom-client';

type MetricsGlobal = typeof globalThis & {
  __zyncMetricsRegistry?: Registry;
  __zyncMetricsInitDone?: boolean;
};

const metricsGlobal = globalThis as MetricsGlobal;

const registry = metricsGlobal.__zyncMetricsRegistry ?? new Registry();
if (!metricsGlobal.__zyncMetricsRegistry) {
  metricsGlobal.__zyncMetricsRegistry = registry;
}

if (!metricsGlobal.__zyncMetricsInitDone) {
  collectDefaultMetrics({ register: registry });
  metricsGlobal.__zyncMetricsInitDone = true;
}

export function getMetricsRegistry(): Registry {
  return registry;
}

export async function renderMetrics(): Promise<{ contentType: string; body: string }> {
  return {
    contentType: registry.contentType,
    body: await registry.metrics(),
  };
}
