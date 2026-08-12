export type Bucket = 'good' | 'fair' | 'poor';

export interface QualitySample {
  at: number;
  rtt: number | null;
  packetsLost: number;
  packetsReceived: number;
  bytesReceived: number;
  relayed: boolean;
}

export interface LinkQuality {
  rtt: number | null;
  loss: number | null;
  bitrate: number | null;
  bucket: Bucket;
  relayed: boolean;
}

export interface SettledBucket {
  bucket: Bucket;
  streak: number;
}

const GOOD = { rtt: 150, loss: 0.02 };
const FAIR = { rtt: 300, loss: 0.05 };
const SAMPLES_TO_SETTLE = 2;

const BUCKET_HEALTH: Record<Bucket, number> = { good: 1, fair: 0.6, poor: 0.3 };

interface CandidatePairStats {
  type: string;
  state?: string;
  currentRoundTripTime?: number;
  localCandidateId?: string;
}

interface InboundStats {
  type: string;
  packetsLost?: number;
  packetsReceived?: number;
  bytesReceived?: number;
}

export function readSample(report: RTCStatsReport, at: number): QualitySample | null {
  let pair: CandidatePairStats | null = null;
  const inbound: InboundStats[] = [];
  const candidateTypes = new Map<string, string>();

  report.forEach((entry) => {
    const stats = entry as CandidatePairStats & InboundStats & { id?: string; candidateType?: string };

    if (stats.type === 'candidate-pair' && stats.state === 'succeeded') pair = stats;
    if (stats.type === 'inbound-rtp') inbound.push(stats);
    if (stats.type === 'local-candidate' && stats.id !== undefined) {
      candidateTypes.set(stats.id, stats.candidateType ?? '');
    }
  });

  if (pair === null || inbound.length === 0) return null;

  const succeeded: CandidatePairStats = pair;
  const localType = candidateTypes.get(succeeded.localCandidateId ?? '') ?? '';

  return {
    at,
    rtt:
      succeeded.currentRoundTripTime === undefined
        ? null
        : Math.round(succeeded.currentRoundTripTime * 1000),
    packetsLost: inbound.reduce((total, entry) => total + (entry.packetsLost ?? 0), 0),
    packetsReceived: inbound.reduce((total, entry) => total + (entry.packetsReceived ?? 0), 0),
    bytesReceived: inbound.reduce((total, entry) => total + (entry.bytesReceived ?? 0), 0),
    relayed: localType === 'relay',
  };
}

function bucketFor(rtt: number | null, loss: number | null): Bucket {
  const observedRtt = rtt ?? 0;
  const observedLoss = loss ?? 0;
  if (observedRtt < GOOD.rtt && observedLoss < GOOD.loss) return 'good';
  if (observedRtt < FAIR.rtt && observedLoss < FAIR.loss) return 'fair';
  return 'poor';
}

export function deriveLink(previous: QualitySample | null, next: QualitySample): LinkQuality {
  const elapsed = previous === null ? 0 : (next.at - previous.at) / 1000;

  const lostDelta = previous === null ? 0 : next.packetsLost - previous.packetsLost;
  const receivedDelta = previous === null ? 0 : next.packetsReceived - previous.packetsReceived;
  const expected = lostDelta + receivedDelta;

  const loss = previous === null || expected <= 0 ? null : lostDelta / expected;
  const bitrate =
    previous === null || elapsed <= 0
      ? null
      : Math.round(((next.bytesReceived - previous.bytesReceived) * 8) / elapsed);

  return {
    rtt: next.rtt,
    loss,
    bitrate,
    bucket: bucketFor(next.rtt, loss),
    relayed: next.relayed,
  };
}

export function settleBucket(current: Bucket, incoming: Bucket, streak: number): SettledBucket {
  if (incoming === current) return { bucket: current, streak: 0 };
  if (streak + 1 < SAMPLES_TO_SETTLE) return { bucket: current, streak: streak + 1 };
  return { bucket: incoming, streak: 0 };
}

export function healthFor(bucket: Bucket): number {
  return BUCKET_HEALTH[bucket];
}

export function formatFields(link: LinkQuality): string[] {
  const fields = [link.relayed ? 'Turn' : 'Direct'];

  if (link.rtt !== null) fields.push(link.rtt === 0 ? '<1ms' : `${link.rtt}ms`);

  if (link.loss !== null) fields.push(`${(link.loss * 100).toFixed(1)}%`);
  if (link.bitrate !== null) fields.push(`${Math.round(link.bitrate / 1000)}k`);

  return fields;
}
