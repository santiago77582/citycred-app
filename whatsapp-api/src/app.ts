import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { requireApiKey } from './middleware/apiKey.js';
import { errorHandler } from './middleware/errorHandler.js';
import { conversationsRouter } from './routes/conversations.js';
import { healthRouter } from './routes/health.js';
import { messagesRouter } from './routes/messages.js';
import { webhooksRouter } from './routes/webhooks.js';
import { logger, sanitizeRequestUrl } from './utils/logger.js';

export function createApp(): express.Express {
  const app = express();

  // Detrás de Render/Cloudflare hay exactamente un proxy de confianza.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            ...req,
            url: typeof req.url === 'string' ? sanitizeRequestUrl(req.url) : req.url
          };
        }
      }
    })
  );
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        // Meta firma el cuerpo crudo; se guarda para validar X-Hub-Signature-256.
        (req as { rawBody?: Buffer }).rawBody = buf;
      }
    })
  );

  app.use(healthRouter);
  app.use('/webhooks', webhooksRouter);

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

  app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });
  app.use(errorHandler);

  return app;
}
