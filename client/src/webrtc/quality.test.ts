import { describe, expect, it } from 'vitest';
import { deriveLink, formatFields, readSample, settleBucket } from './quality';

function report(entries: Record<string, unknown>[]): RTCStatsReport {
  const map = new Map(entries.map((entry, index) => [`id-${index}`, entry]));
  return map as unknown as RTCStatsReport;
}

const succeededPair = {
  type: 'candidate-pair',
  state: 'succeeded',
  currentRoundTripTime: 0.018,
  localCandidateId: 'local-host',
};

const inbound = {
  type: 'inbound-rtp',
  kind: 'video',
  packetsLost: 4,
  packetsReceived: 996,
  bytesReceived: 200_000,
};

describe('readSample', () => {
  it('reads the succeeded candidate pair and ignores the failed ones', () => {
    const sample = readSample(
      report([
        { type: 'candidate-pair', state: 'failed', currentRoundTripTime: 9, localCandidateId: 'x' },
        succeededPair,
        { type: 'local-candidate', id: 'local-host', candidateType: 'host' },
        inbound,
      ]),
      1_000,
    );

    expect(sample).toEqual({
      at: 1_000,
      rtt: 18,
      packetsLost: 4,
      packetsReceived: 996,
      bytesReceived: 200_000,
      relayed: false,
    });
  });

  it('reports a relayed link from the local candidate type', () => {
    const sample = readSample(
      report([
        succeededPair,
        { type: 'local-candidate', id: 'local-host', candidateType: 'relay' },
        inbound,
      ]),
      1_000,
    );

    expect(sample?.relayed).toBe(true);
  });

  it('returns null until the connection produces usable stats', () => {
    expect(readSample(report([{ type: 'transport' }]), 1_000)).toBeNull();
  });

  it('separates an unreported round trip time from a measured zero', () => {
    const unreported = readSample(
      report([
        { type: 'candidate-pair', state: 'succeeded', localCandidateId: 'local-host' },
        { type: 'local-candidate', id: 'local-host', candidateType: 'host' },
        inbound,
      ]),
      1_000,
    );
    const measuredZero = readSample(
      report([
        { ...succeededPair, currentRoundTripTime: 0 },
        { type: 'local-candidate', id: 'local-host', candidateType: 'host' },
        inbound,
      ]),
      1_000,
    );

    expect(unreported?.rtt).toBeNull();
    expect(measuredZero?.rtt).toBe(0);
  });
});

describe('deriveLink', () => {
  it('measures bitrate and loss over the interval, not since the call began', () => {
    const previous = {
      at: 1_000,
      rtt: 18,
      packetsLost: 4,
      packetsReceived: 996,
      bytesReceived: 200_000,
      relayed: false,
    };
    const next = { ...previous, at: 3_000, packetsLost: 5, packetsReceived: 1_996, bytesReceived: 360_000 };

    const link = deriveLink(previous, next);

    expect(link.bitrate).toBe(640_000);
    expect(link.loss).toBeCloseTo(1 / 1_001, 6);
    expect(formatFields(link)).toContain('0.1%');
    expect(link.rtt).toBe(18);
    expect(link.bucket).toBe('good');
  });

  it('holds off on figures it cannot compute from a single sample', () => {
    const link = deriveLink(null, {
      at: 1_000,
      rtt: 18,
      packetsLost: 0,
      packetsReceived: 100,
      bytesReceived: 50_000,
      relayed: false,
    });

    expect(link.bitrate).toBeNull();
    expect(link.loss).toBeNull();
    expect(link.rtt).toBe(18);
  });

  it('buckets on the agreed thresholds', () => {
    const at = (rtt: number, loss: number) =>
      deriveLink(
        { at: 0, rtt, packetsLost: 0, packetsReceived: 0, bytesReceived: 0, relayed: false },
        {
          at: 1_000,
          rtt,
          packetsLost: Math.round(loss * 1_000),
          packetsReceived: Math.round((1 - loss) * 1_000),
          bytesReceived: 0,
          relayed: false,
        },
      ).bucket;

    expect(at(149, 0)).toBe('good');
    expect(at(150, 0)).toBe('fair');
    expect(at(299, 0)).toBe('fair');
    expect(at(300, 0)).toBe('poor');
    expect(at(10, 0.019)).toBe('good');
    expect(at(10, 0.02)).toBe('fair');
    expect(at(10, 0.05)).toBe('poor');
  });
});

describe('settleBucket', () => {
  it('waits for two consecutive samples before changing', () => {
    const first = settleBucket('good', 'poor', 0);
    expect(first).toEqual({ bucket: 'good', streak: 1 });

    const second = settleBucket('good', 'poor', first.streak);
    expect(second).toEqual({ bucket: 'poor', streak: 0 });
  });

  it('forgets a lone bad sample', () => {
    const bad = settleBucket('good', 'poor', 0);
    expect(settleBucket('good', 'good', bad.streak)).toEqual({ bucket: 'good', streak: 0 });
  });

  it('needs two good samples to clear a poor link', () => {
    const first = settleBucket('poor', 'good', 0);
    expect(first.bucket).toBe('poor');
    expect(settleBucket('poor', 'good', first.streak).bucket).toBe('good');
  });
});

describe('formatFields', () => {
  it('orders the readout so the narrow-tile rule drops bitrate first', () => {
    const fields = formatFields({
      rtt: 18,
      loss: 0,
      bitrate: 640_000,
      bucket: 'good',
      relayed: false,
    });

    expect(fields).toEqual(['Direct', '18ms', '0.0%', '640k']);
  });

  it('names the transport TURN when the link is relayed', () => {
    const fields = formatFields({
      rtt: 61,
      loss: 0.014,
      bitrate: 310_000,
      bucket: 'fair',
      relayed: true,
    });

    expect(fields).toEqual(['Turn', '61ms', '1.4%', '310k']);
  });

  it('leaves out figures it has not measured yet', () => {
    const fields = formatFields({
      rtt: 18,
      loss: null,
      bitrate: null,
      bucket: 'good',
      relayed: false,
    });

    expect(fields).toEqual(['Direct', '18ms']);
  });

  it('does not pass a sub-millisecond round trip off as zero', () => {
    const loopback = formatFields({
      rtt: 0,
      loss: 0,
      bitrate: 655_000,
      bucket: 'good',
      relayed: false,
    });
    const unreported = formatFields({
      rtt: null,
      loss: 0,
      bitrate: 655_000,
      bucket: 'good',
      relayed: false,
    });

    expect(loopback).toEqual(['Direct', '<1ms', '0.0%', '655k']);
    expect(unreported).toEqual(['Direct', '0.0%', '655k']);
  });
});
