import { LOCAL_ID } from './mesh-links';

export interface StageClaimant {
  socketId: string;
  sharing: string | null;
  lost: boolean;
}

function claimants(participants: StageClaimant[]): string[] {
  return participants
    .filter((participant) => participant.sharing !== null && !participant.lost)
    .map((participant) => participant.socketId);
}

export function stageHolder(
  participants: StageClaimant[],
  localSocketId: string,
  localSharing: string | null,
): string | null {
  const claims = claimants(participants);
  if (localSharing !== null) claims.push(localSocketId);

  // Two people can press within one presence round trip, so the winner has to be the same on
  // every client. Lowest socket id, as in peers.ts and mesh-links.ts.
  const winner = claims.sort()[0];
  if (winner === undefined) return null;
  return winner === localSocketId && localSharing !== null ? LOCAL_ID : winner;
}

export function lostContest(
  participants: StageClaimant[],
  localSocketId: string,
  localSharing: string | null,
): boolean {
  if (localSharing === null) return false;
  return claimants(participants).some((socketId) => socketId < localSocketId);
}
