import { pool } from './db.js';

const MAX_ANALYTICS_MESSAGES = 100_000;
const MAX_ANALYTICS_CONTACTS = 100_000;
const MAX_ANALYTICS_CONVERSATIONS = 100_000;

export type OperationalDashboard = {
  period: { days: number; from: string; to: string };
  contacts: {
    total: number;
    consentGranted: number;
    consentUnknown: number;
    consentRevoked: number;
    doNotContact: number;
    byCommercialStatus: Record<string, number>;
    topEntities: Array<{ entity: string; count: number }>;
  };
  conversations: {
    total: number;
    activeInPeriod: number;
    assigned: number;
    unassigned: number;
    botPausedNow: number;
  };
  messages: {
    totalInPeriod: number;
    inbound: number;
    outbound: number;
    failed: number;
    unknown: number;
    pending: number;
    deliveredOrRead: number;
    deliveryRatePercent: number | null;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  responseTime: {
    measuredConversations: number;
    measuredResponses: number;
    averageMinutes: number | null;
    medianMinutes: number | null;
  };
  daily: Array<{ date: string; inbound: number; outbound: number; failed: number }>;
  campaigns: {
    total: number;
    drafts: number;
    previewed: number;
    approved: number;
    running: number;
    completed: number;
    completedWithErrors: number;
    cancelled: number;
  };
  alerts: { open: number; criticalOpen: number };
  limits: {
    messagesTruncated: boolean;
    contactsTruncated: boolean;
    conversationsTruncated: boolean;
  };
};

type ContactRow = {
  entity: string | null;
  commercial_status: string;
  consent_status: string;
  opt_out_at: string | null;
};
type ConversationRow = {
  assigned_user_id: string | null;
  bot_paused_until: string | null;
  last_message_at: string;
};
type MessageRow = {
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  type: string;
  created_at: string;
};
type StatusRow = { status: string };
type AlertRow = { severity: string };

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function utcDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function buildDaily(days: number, from: Date, messages: MessageRow[]) {
  const result: OperationalDashboard['daily'] = [];
  const index = new Map<string, OperationalDashboard['daily'][number]>();
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(from.getTime() + offset * 86_400_000);
    const key = utcDateKey(date);
    const row = { date: key, inbound: 0, outbound: 0, failed: 0 };
    result.push(row);
    index.set(key, row);
  }
  for (const message of messages) {
    const row = index.get(utcDateKey(message.created_at));
    if (!row) continue;
    if (message.direction === 'INBOUND') row.inbound += 1;
    else row.outbound += 1;
    if (message.status === 'FAILED') row.failed += 1;
  }
  return result;
}

function calculateResponseTimes(messages: MessageRow[]): OperationalDashboard['responseTime'] {
  const byConversation = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const current = byConversation.get(message.conversation_id) ?? [];
    current.push(message);
    byConversation.set(message.conversation_id, current);
  }

  const responseMinutes: number[] = [];
  let measuredConversations = 0;
  for (const conversationMessages of byConversation.values()) {
    conversationMessages.sort((left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    );
    let pendingInboundAt: number | null = null;
    let measuredThisConversation = false;
    for (const message of conversationMessages) {
      const timestamp = new Date(message.created_at).getTime();
      if (message.direction === 'INBOUND') {
        if (pendingInboundAt === null) pendingInboundAt = timestamp;
        continue;
      }
      if (pendingInboundAt !== null && timestamp >= pendingInboundAt) {
        responseMinutes.push((timestamp - pendingInboundAt) / 60_000);
        pendingInboundAt = null;
        measuredThisConversation = true;
      }
    }
    if (measuredThisConversation) measuredConversations += 1;
  }

  const average = responseMinutes.length
    ? responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length
    : null;
  const medianValue = median(responseMinutes);
  return {
    measuredConversations,
    measuredResponses: responseMinutes.length,
    averageMinutes: average === null ? null : round(average),
    medianMinutes: medianValue === null ? null : round(medianValue)
  };
}

export async function getOperationalDashboard(days: number): Promise<OperationalDashboard> {
  const to = new Date();
  const from = new Date(Date.UTC(
    to.getUTCFullYear(),
    to.getUTCMonth(),
    to.getUTCDate() - (days - 1),
    0, 0, 0, 0
  ));

  const [contactsResult, conversationsResult, messagesResult, campaignsResult, alertsResult] =
    await Promise.all([
      pool.query<ContactRow>(
        `SELECT entity, commercial_status, consent_status, opt_out_at
         FROM contacts
         WHERE archived_at IS NULL
         ORDER BY updated_at DESC
         LIMIT $1`,
        [MAX_ANALYTICS_CONTACTS]
      ),
      pool.query<ConversationRow>(
        `SELECT assigned_user_id, bot_paused_until, last_message_at
         FROM conversations
         ORDER BY updated_at DESC
         LIMIT $1`,
        [MAX_ANALYTICS_CONVERSATIONS]
      ),
      pool.query<MessageRow>(
        `SELECT conversation_id, direction, status, type, created_at
         FROM messages
         WHERE created_at >= $1
         ORDER BY conversation_id ASC, created_at ASC
         LIMIT $2`,
        [from.toISOString(), MAX_ANALYTICS_MESSAGES]
      ),
      pool.query<StatusRow>(`SELECT status FROM campaigns`),
      pool.query<AlertRow>(
        `SELECT severity
         FROM system_alerts
         WHERE resolved_at IS NULL`
      )
    ]);

  const byCommercialStatus: Record<string, number> = {};
  const entityCounts: Record<string, number> = {};
  let consentGranted = 0;
  let consentUnknown = 0;
  let consentRevoked = 0;
  let doNotContact = 0;
  for (const contact of contactsResult.rows) {
    increment(byCommercialStatus, contact.commercial_status);
    if (contact.entity?.trim()) increment(entityCounts, contact.entity.trim());
    if (contact.consent_status === 'GRANTED') consentGranted += 1;
    else if (contact.consent_status === 'REVOKED') consentRevoked += 1;
    else consentUnknown += 1;
    if (
      contact.commercial_status === 'DO_NOT_CONTACT'
      || contact.opt_out_at !== null
      || contact.consent_status === 'REVOKED'
    ) doNotContact += 1;
  }

  const topEntities = Object.entries(entityCounts)
    .map(([entity, count]) => ({ entity, count }))
    .sort((left, right) => right.count - left.count || left.entity.localeCompare(right.entity))
    .slice(0, 10);

  let assigned = 0;
  let activeInPeriod = 0;
  let botPausedNow = 0;
  const now = to.getTime();
  for (const conversation of conversationsResult.rows) {
    if (conversation.assigned_user_id) assigned += 1;
    if (new Date(conversation.last_message_at).getTime() >= from.getTime()) activeInPeriod += 1;
    if (
      conversation.bot_paused_until
      && new Date(conversation.bot_paused_until).getTime() > now
    ) botPausedNow += 1;
  }

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let inbound = 0;
  let outbound = 0;
  let failed = 0;
  let unknown = 0;
  let pending = 0;
  let deliveredOrRead = 0;
  for (const message of messagesResult.rows) {
    increment(byStatus, message.status);
    increment(byType, message.type);
    if (message.direction === 'INBOUND') inbound += 1;
    else outbound += 1;
    if (message.status === 'FAILED') failed += 1;
    if (message.status === 'UNKNOWN') unknown += 1;
    if (message.status === 'PENDING' || message.status === 'SENT') pending += 1;
    if (message.status === 'DELIVERED' || message.status === 'READ') deliveredOrRead += 1;
  }

  const campaignCounts: Record<string, number> = {};
  for (const campaign of campaignsResult.rows) increment(campaignCounts, campaign.status);
  const criticalOpen = alertsResult.rows.filter((alert) => alert.severity === 'CRITICAL').length;

  return {
    period: { days, from: from.toISOString(), to: to.toISOString() },
    contacts: {
      total: contactsResult.rows.length,
      consentGranted,
      consentUnknown,
      consentRevoked,
      doNotContact,
      byCommercialStatus,
      topEntities
    },
    conversations: {
      total: conversationsResult.rows.length,
      activeInPeriod,
      assigned,
      unassigned: conversationsResult.rows.length - assigned,
      botPausedNow
    },
    messages: {
      totalInPeriod: messagesResult.rows.length,
      inbound,
      outbound,
      failed,
      unknown,
      pending,
      deliveredOrRead,
      deliveryRatePercent: outbound > 0 ? round((deliveredOrRead / outbound) * 100) : null,
      byStatus,
      byType
    },
    responseTime: calculateResponseTimes(messagesResult.rows),
    daily: buildDaily(days, from, messagesResult.rows),
    campaigns: {
      total: campaignsResult.rows.length,
      drafts: campaignCounts.DRAFT ?? 0,
      previewed: campaignCounts.PREVIEWED ?? 0,
      approved: campaignCounts.APPROVED ?? 0,
      running: campaignCounts.RUNNING ?? 0,
      completed: campaignCounts.COMPLETED ?? 0,
      completedWithErrors: campaignCounts.COMPLETED_WITH_ERRORS ?? 0,
      cancelled: campaignCounts.CANCELLED ?? 0
    },
    alerts: { open: alertsResult.rows.length, criticalOpen },
    limits: {
      messagesTruncated: messagesResult.rows.length >= MAX_ANALYTICS_MESSAGES,
      contactsTruncated: contactsResult.rows.length >= MAX_ANALYTICS_CONTACTS,
      conversationsTruncated: conversationsResult.rows.length >= MAX_ANALYTICS_CONVERSATIONS
    }
  };
}
