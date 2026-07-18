import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getOperationalDashboard } from '../analyticsRepository.js';

export const analyticsRouter = Router();

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(366).default(30)
});

const analyticsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas de estadísticas. Esperá un minuto.' }
});

analyticsRouter.get('/dashboard', analyticsLimiter, async (req, res) => {
  const { days } = querySchema.parse(req.query);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ dashboard: await getOperationalDashboard(days) });
});
