import { createHash } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { handleCitycredFlowV2 } from '../flows/citycredFlowHandlerV2.js';
import { endpointOptions } from '../flows/endpointOptions.js';
import {
  decryptFlowRequest,
  encryptedFlowEnvelopeSchema,
  encryptFlowResponse,
  FlowEndpointError,
  isFlowSignatureValid
} from '../flows/flowCrypto.js';
import {
  findFlowEventResponse,
  recordFlowEndpointEvent
} from '../flows/flowEndpointRepository.js';
import { logger } from '../utils/logger.js';

export const flowDataEndpointRouter = Router();

flowDataEndpointRouter.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: ''
}));

flowDataEndpointRouter.get('/', (_req, res) => {
  const options = endpointOptions();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    active: Boolean(
      options.enabled
      && options.material
      && options.storage
      && options.signatureSecret
    )
  });
});

flowDataEndpointRouter.post('/', async (req, res) => {
  const options = endpointOptions();
  if (!options.enabled || !options.material || !options.storage || !options.signatureSecret) {
    res.status(503).send();
    return;
  }

  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  if (!rawBody || !isFlowSignatureValid({
    rawBody,
    signatureHeader: req.header('x-hub-signature-256'),
    secret: options.signatureSecret
  })) {
    res.status(432).send();
    return;
  }

  const fingerprint = createHash('sha256').update(rawBody).digest('hex');
  try {
    const envelope = encryptedFlowEnvelopeSchema.parse(req.body);
    const decrypted = decryptFlowRequest({
      envelope,
      pem: options.material,
      passphrase: options.passphrase
    });
    const previousResponse = await findFlowEventResponse(fingerprint);
    const result = previousResponse
      ? {
          statusCode: Object.hasOwn(previousResponse, 'error_msg') ? 427 : 200,
          response: previousResponse,
          tokenId: null
        }
      : await handleCitycredFlowV2({
          body: decrypted.body,
          storageMaterial: options.storage,
          initialScreen: options.initialScreen
        });

    if (!previousResponse) {
      await recordFlowEndpointEvent({
        requestFingerprint: fingerprint,
        tokenId: result.tokenId,
        action: typeof decrypted.body.action === 'string' ? decrypted.body.action : 'unknown',
        screen: typeof decrypted.body.screen === 'string' ? decrypted.body.screen : null,
        outcome: result.statusCode === 427 ? 'REJECTED' : 'PROCESSED',
        response: result.response,
        errorCode: result.statusCode === 427 ? 'INVALID_FLOW_TOKEN' : null
      });
    }

    const encryptedResponse = encryptFlowResponse({
      response: result.response,
      aesMaterial: decrypted.aesMaterial,
      initialVector: decrypted.initialVector
    });
    res
      .status(result.statusCode)
      .setHeader('Cache-Control', 'no-store')
      .type('text/plain')
      .send(encryptedResponse);
  } catch (error) {
    const statusCode = error instanceof FlowEndpointError
      ? error.statusCode
      : error instanceof ZodError
        ? 400
        : 500;
    logger.warn(
      {
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
        statusCode,
        fingerprint
      },
      'Solicitud de WhatsApp Flow rechazada'
    );
    res.status(statusCode).send();
  }
});
