import type { PeerParticipant, PeerStat } from '../types';
import type { Bucket } from './quality';

export const LOCAL_ID = 'local';

export interface MeshLink {
  a: string;
  b: string;
  bucket: Bucket | null;
  rtt: number | null;
  loss: number | null;
  relayed: boolean;
  firstHand: boolean;
}

const EMPTY = { bucket: null, rtt: null, loss: null, relayed: false, firstHand: false };

function reported(stats: PeerStat[] | undefined, about: string): PeerStat | undefined {
  return stats?.find((entry) => entry.peerId === about);
}

export function buildLinks(
  participants: PeerParticipant[],
  remoteStats: Record<string, PeerStat[]>,
): MeshLink[] {
  const ids = [LOCAL_ID, ...participants.map((participant) => participant.socketId)];
  const quality = new Map(
    participants.map((participant) => [participant.socketId, participant.quality]),
  );
  const links: MeshLink[] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] ?? LOCAL_ID;
      const b = ids[j] ?? LOCAL_ID;

      if (a === LOCAL_ID) {
        const own = quality.get(b) ?? null;
        links.push(
          own === null
            ? { a, b, ...EMPTY }
            : {
                a,
                b,
                bucket: own.bucket,
                rtt: own.rtt,
                loss: own.loss,
                relayed: own.relayed,
                firstHand: true,
              },
        );
        continue;
      }

      // Both ends report the same link; the lower socketId wins so the figure cannot alternate.
      const preferred = a < b ? a : b;
      const other = a < b ? b : a;
      const chosen =
        reported(remoteStats[preferred], other) ?? reported(remoteStats[other], preferred);

      links.push(
        chosen === undefined
          ? { a, b, ...EMPTY }
          : {
              a,
              b,
              bucket: chosen.bucket,
              rtt: chosen.rtt,
              loss: chosen.loss,
              relayed: chosen.relayed,
              firstHand: false,
            },
      );
    }
  }

  return links;
}
