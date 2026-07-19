import { z } from 'zod';
import { FlowEndpointError } from './flowCrypto.js';
import {
  applyCompletedFlowToContact,
  completeFlowToken,
  findUsableFlowToken
} from './flowEndpointRepository.js';
import { saveFlowSessionSafely } from './flowSessionRepository.js';

const screenSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/);
const requestSchema = z.object({
  action: z.string().min(1).max(50),
  screen: screenSchema.optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  flow_token: z.string().min(1).max(500).optional()
}).strip();

function nextScreen(current: string | undefined, initial: string): string {
  const sequence: Record<string, string> = {
    INICIO: 'DATOS_LABORALES',
    DATOS_LABORALES: 'CUPO',
    CUPO: 'DOCUMENTACION',
    DOCUMENTACION: 'CONFIRMACION',
    CONFIRMACION: 'SUCCESS'
  };
  return current ? sequence[current] ?? current : initial;
}

function previousScreen(current: string | undefined, initial: string): string {
  const sequence: Record<string, string> = {
    DATOS_LABORALES: 'INICIO',
    CUPO: 'DATOS_LABORALES',
    DOCUMENTACION: 'CUPO',
    CONFIRMACION: 'DOCUMENTACION',
    SUCCESS: 'CONFIRMACION'
  };
  return current ? sequence[current] ?? initial : initial;
}

export async function handleCitycredFlowV2(params: {
  body: Record<string, unknown>;
  storageMaterial: string;
  initialScreen: string;
}) {
  const request = requestSchema.parse(params.body);
  if (request.action === 'ping') {
    return { statusCode: 200, response: { data: { status: 'active' } }, tokenId: null };
  }
  if (request.data.error) {
    return { statusCode: 200, response: { data: { acknowledged: true } }, tokenId: null };
  }
  if (!request.flow_token) throw new FlowEndpointError(400, 'Falta flow_token.');
  const token = await findUsableFlowToken(request.flow_token);
  if (!token) {
    return {
      statusCode: 427,
      response: { error_msg: 'Este formulario ya no está disponible.' },
      tokenId: null
    };
  }

  if (request.action === 'INIT') {
    await saveFlowSessionSafely({
      token,
      screen: params.initialScreen,
      data: request.data,
      storageMaterial: params.storageMaterial
    });
    return {
      statusCode: 200,
      response: { screen: params.initialScreen, data: { initialized: true } },
      tokenId: token.id
    };
  }

  if (request.action !== 'data_exchange' && request.action !== 'BACK') {
    throw new FlowEndpointError(400, 'Acción no soportada.');
  }

  const next = request.action === 'BACK'
    ? previousScreen(request.screen, params.initialScreen)
    : nextScreen(request.screen, params.initialScreen);
  const complete = request.action !== 'BACK' && (
    request.data.complete === true
    || request.data.finalize === true
    || request.screen === 'CONFIRMACION'
    || next === 'SUCCESS'
  );
  const merged = await saveFlowSessionSafely({
    token,
    screen: complete ? 'SUCCESS' : next,
    data: request.data,
    storageMaterial: params.storageMaterial,
    complete
  });

  if (complete) {
    await applyCompletedFlowToContact({ token, data: merged });
    // El token se cierra al final: si falla la actualización comercial,
    // WhatsApp puede reintentar sin perder el formulario completado.
    await completeFlowToken(token);
    return {
      statusCode: 200,
      response: {
        screen: 'SUCCESS',
        data: {
          extension_message_response: {
            params: { flow_token: request.flow_token }
          }
        }
      },
      tokenId: token.id
    };
  }

  return {
    statusCode: 200,
    response: { screen: next, data: { saved: true } },
    tokenId: token.id
  };
}
