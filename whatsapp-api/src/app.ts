import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { requireApiKey } from './middleware/apiKey.js';
import { errorHandler } from './middleware/errorHandler.js';
import { adminRouter } from './routes/admin.js';
import { conversationsRouter } from './routes/conversations.js';
import { crmRouter } from './routes/crm.js';
import { healthRouter } from './routes/health.js';
import { mediaRouter } from './routes/media.js';
import { messagesRouter } from './routes/messages.js';
import { templatesRouter } from './routes/templates.js';
import { webhooksRouter } from './routes/webhooks.js';
import { logger, sanitizeRequestUrl } from './utils/logger.js';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          ...req,
          url: typeof req.url === 'string' ? sanitizeRequestUrl(req.url) : req.url
        };
      }
    }
  }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as { rawBody?: Buffer }).rawBody = buf;
    }
  }));

  app.use(healthRouter);
  app.use('/webhooks', webhooksRouter);
  app.use('/admin', adminRouter);

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes, probá de nuevo en un minuto.' }
  });

  app.use('/api/v1', apiLimiter, requireApiKey);
  app.use('/api/v1/messages', messagesRouter);
  app.use('/api/v1/conversations', conversationsRouter);
  app.use('/api/v1/crm', crmRouter);
  app.use('/api/v1/media', mediaRouter);
  app.use('/api/v1/templates', templatesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });
  app.use(errorHandler);
  return app;
}
