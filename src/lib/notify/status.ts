import type { AgentState, NotificationRecord, OpportunityKind } from "../agent/types";
import { describeTransport, maskAddress, readNotifyConfig } from "./config";
import { selectMatches } from "./index";

export interface NotifyStatus {
  configured: boolean;
  transport: string;
  transportLabel: string;
  recipients: string[];
  kinds: OpportunityKind[];
  /** How many matches would go out on the next scan as things stand. */
  pending: number;
  alreadySent: number;
  lastNotification: NotificationRecord | null;
}

export function notifyStatus(state: AgentState): NotifyStatus {
  const config = readNotifyConfig();
  return {
    configured: config.to.length > 0,
    transport: config.transport,
    transportLabel: describeTransport(config),
    recipients: config.to.map(maskAddress),
    kinds: config.kinds,
    pending: selectMatches(state.opportunities, state.notifiedAt, config).length,
    alreadySent: Object.keys(state.notifiedAt).length,
    lastNotification: state.lastNotification ?? null,
  };
}
