import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import {
  FLOW_METRIC_NAMES,
  getOfficialConversationAnalytics,
  getOfficialFlowMetric,
  getOfficialMessageAnalytics,
  getWabaOfficialStatus
} from '../services/metaOfficialAnalytics.js';

export const metaAnalyticsRouter = Router();

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const phoneNumberSchema = z.string().regex(/^[0-9]{8,20}$/);
const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
const directionSchema = z.enum(['business_initiated', 'user_initiated']);
const dimensionSchema = z.enum([
  'conversation_type',
  'conversation_direction',
  'country',
  'phone'
]);

const dateRangeSchema = z.object({
  start: isoDateTime,
  end: isoDateTime
}).superRefine((value, ctx) => {
  const start = new Date(value.start);
  const end = new Date(value.end);
  if (start.getTime() >= end.getTime()) {
    ctx.addIssue({ code: 'custom', path: ['end'], message: 'La fecha final debe ser posterior a la inicial.' });
  }
  if (end.getTime() - start.getTime() > 366 * 86_400_000) {
    ctx.addIssue({ code: 'custom', path: ['end'], message: 'El período máximo es de 366 días.' });
  }
});

const messageQuerySchema = z.object({
  start: isoDateTime,
  end: isoDateTime,
  phoneNumbers: z.string().max(500).optional(),
  countryCodes: z.string().max(200).optional()
});

const conversationQuerySchema = z.object({
  start: isoDateTime,
  end: isoDateTime,
  directions: z.string().max(200).optional(),
  dimensions: z.string().max(300).optional()
});

const flowMetricParamsSchema = z.object({
  flowId: z.string().trim().min(1).max(200)
});
const flowMetricQuerySchema = z.object({
  name: z.enum(FLOW_METRIC_NAMES),
  since: isoDate,
  until: isoDate
});

function commaValues(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const values = value.split(',').map((item) => item.trim()).filter(Boolean);
  return values.length ? [...new Set(values)] : undefined;
}

function validatedRange(startRaw: string, endRaw: string): { start: Date; end: Date } {
  const parsed = dateRangeSchema.parse({ start: startRaw, end: endRaw });
  return { start: new Date(parsed.start), end: new Date(parsed.end) };
}

function validateFlowDateRange(since: string, until: string): void {
  const start = new Date(`${since}T00:00:00.000Z`);
  const end = new Date(`${until}T00:00:00.000Z`);
  if (start.getTime() >= end.getTime()) {
    throw new AppError('La fecha until debe ser posterior a since.', 400);
  }
  if (end.getTime() - start.getTime() > 366 * 86_400_000) {
    throw new AppError('El período máximo de métricas de Flow es de 366 días.', 400);
  }
}

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas oficiales de Meta. Esperá un minuto.' }
});

metaAnalyticsRouter.use(limiter);

metaAnalyticsRouter.get('/capabilities', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    source: 'META_OFFICIAL',
    messageAnalytics: true,
    conversationAnalytics: true,
    flowMetrics: true,
    accountCurrency: true,
    paymentReference: true,
    costPolicy: {
      estimatesGenerated: false,
      valuesReturnedOnlyWhenProvidedByMeta: true
    }
  });
});

metaAnalyticsRouter.get('/waba', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ waba: await getWabaOfficialStatus() });
});

metaAnalyticsRouter.get('/messages', async (req, res) => {
  const query = messageQuerySchema.parse(req.query);
  const range = validatedRange(query.start, query.end);
  const phoneNumbers = commaValues(query.phoneNumbers);
  const countryCodes = commaValues(query.countryCodes);
  const parsedPhones = phoneNumbers?.map((value) => phoneNumberSchema.parse(value));
  const parsedCountries = countryCodes?.map((value) => countryCodeSchema.parse(value.toUpperCase()));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    analytics: await getOfficialMessageAnalytics({
      ...range,
      phoneNumbers: parsedPhones,
      countryCodes: parsedCountries
    })
  });
});

metaAnalyticsRouter.get('/conversations', async (req, res) => {
  const query = conversationQuerySchema.parse(req.query);
  const range = validatedRange(query.start, query.end);
  const directions = commaValues(query.directions)?.map((value) => directionSchema.parse(value));
  const dimensions = commaValues(query.dimensions)?.map((value) => dimensionSchema.parse(value));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    analytics: await getOfficialConversationAnalytics({
      ...range,
      directions,
      dimensions
    })
  });
});

metaAnalyticsRouter.get('/flows/:flowId/metric', async (req, res) => {
  const { flowId } = flowMetricParamsSchema.parse(req.params);
  const query = flowMetricQuerySchema.parse(req.query);
  validateFlowDateRange(query.since, query.until);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    metric: await getOfficialFlowMetric({
      flowId,
      metric: query.name,
      since: query.since,
      until: query.until
    })
  });
});
