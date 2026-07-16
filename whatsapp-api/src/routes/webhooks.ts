import { Router } from 'express';
import { config } from '../config.js';
import { isValidMetaSignature } from '../middleware/metaSignature.js';
import { processWebhook } from '../services/webhookProcessor.js';
import type { MetaWebhookPayload } from '../types/whatsapp.js';
import { logger } from '../utils/logger.js';

export const webhooksRouter = Router();

webhooksRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    config.WHATSAPP_VERIFY_TOKEN &&
    typeof token === 'string' &&
    token === config.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === 'string'
  ) {
    res.status(200).type('text/plain').send(challenge);
    return;
  }

  res.status(403).json({ error: 'Verificación rechazada.' });
});

webhooksRouter.post('/whatsapp', async (req, res) => {
  if (!config.META_APP_SECRET) {
    res.status(503).json({ error: 'Webhook no configurado: falta META_APP_SECRET.' });
    return;
  }

  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const signature = req.header('x-hub-signature-256');
  if (!isValidMetaSignature(rawBody, signature, config.META_APP_SECRET)) {
    res.status(401).json({ error: 'Firma de Meta inválida.' });
    return;
  }

  try {
    await processWebhook(req.body as MetaWebhookPayload);
  } catch (error) {
    // El evento ya quedó guardado con su error en webhook_events; se responde 200
    // para que Meta no reintente indefinidamente.
    logger.error({ err: error }, 'El webhook se recibió pero falló su procesamiento');
  }

  res.status(200).json({ received: true });
});
