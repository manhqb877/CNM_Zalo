import { Counter, Histogram } from 'prom-client';
import { getMetricsRegistry } from '../../shared/metrics';

const registry = getMetricsRegistry();

function getOrCreateCounter<TLabelName extends string>(
  name: string,
  help: string,
  labelNames?: readonly TLabelName[],
): Counter<TLabelName> {
  const existing = registry.getSingleMetric(name);
  if (existing) {
    return existing as Counter<TLabelName>;
  }

  return new Counter<TLabelName>({
    name,
    help,
    labelNames: (labelNames ?? []) as readonly TLabelName[],
    registers: [registry],
  });
}

function getOrCreateHistogram<TLabelName extends string>(
  name: string,
  help: string,
  buckets: number[],
  labelNames?: readonly TLabelName[],
): Histogram<TLabelName> {
  const existing = registry.getSingleMetric(name);
  if (existing) {
    return existing as Histogram<TLabelName>;
  }

  return new Histogram<TLabelName>({
    name,
    help,
    buckets,
    labelNames: (labelNames ?? []) as readonly TLabelName[],
    registers: [registry],
  });
}

const callInviteTotal = getOrCreateCounter('call_invite_total', 'Tong so luot tao session goi 1-1');

const callConnectedTotal = getOrCreateCounter('call_connected_total', 'Tong so luot ket noi call thanh cong');

const callRejectedTotal = getOrCreateCounter(
  'call_rejected_total',
  'Tong so luot call bi tu choi',
  ['reason'] as const,
);

const callMissedTotal = getOrCreateCounter('call_missed_total', 'Tong so luot call bi missed do timeout');

const callEndedTotal = getOrCreateCounter(
  'call_ended_total',
  'Tong so luot call ket thuc theo ly do',
  ['reason'] as const,
);

const callReconnectOfferTotal = getOrCreateCounter(
  'call_reconnect_offer_total',
  'Tong so luot thu reconnect bang webrtc_offer khi session dang connected',
);

const callDropTotal = getOrCreateCounter(
  'call_drop_total',
  'Tong so luot call bi drop do loi mang/disconnect',
);

const callSetupDurationSeconds = getOrCreateHistogram(
  'call_setup_duration_seconds',
  'Thoi gian setup call tu luc invite den connected',
  [0.5, 1, 2, 3, 5, 8, 12],
);

const callDurationSeconds = getOrCreateHistogram(
  'call_duration_seconds',
  'Thoi luong call da ket noi',
  [5, 10, 20, 30, 60, 120, 300, 600, 1200],
);

export function recordCallInvite(): void {
  callInviteTotal.inc();
}

export function recordCallConnected(setupSeconds: number): void {
  callConnectedTotal.inc();
  if (Number.isFinite(setupSeconds) && setupSeconds >= 0) {
    callSetupDurationSeconds.observe(setupSeconds);
  }
}

export function recordCallRejected(reason: 'rejected' | 'busy'): void {
  callRejectedTotal.inc({ reason });
}

export function recordCallMissed(): void {
  callMissedTotal.inc();
}

export function recordCallEnded(reason: string, durationSeconds?: number): void {
  const normalizedReason = reason.trim().length > 0 ? reason : 'ended';
  callEndedTotal.inc({ reason: normalizedReason });
  if (Number.isFinite(durationSeconds) && (durationSeconds as number) >= 0) {
    callDurationSeconds.observe(durationSeconds as number);
  }

  const reasonLower = normalizedReason.toLowerCase();
  if (reasonLower.includes('network') || reasonLower.includes('disconnect') || reasonLower.includes('drop')) {
    callDropTotal.inc();
  }
}

export function recordReconnectOfferAttempt(): void {
  callReconnectOfferTotal.inc();
}
