import { z } from 'zod';
import { FlowEndpointError } from './flowCrypto.js';
import {
  applyCompletedFlowToContact,
  completeFlowToken,
  findUsableFlowToken,
  saveFlowSession
} from './flowEndpointRepository.js';

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

export async function handleCitycredFlow(params: {
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
    await saveFlowSession({
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

  const requested = screenSchema.safeParse(
    request.action === 'BACK'
      ? request.data.previous_screen
      : request.data.next_screen
  );
  const next = requested.success
    ? requested.data
    : request.action === 'BACK'
      ? params.initialScreen
      : nextScreen(request.screen, params.initialScreen);
  const complete = request.data.complete === true
    || request.data.finalize === true
    || request.screen === 'CONFIRMACION'
    || next === 'SUCCESS';
  const merged = await saveFlowSession({
    token,
    screen: complete ? 'SUCCESS' : next,
    data: request.data,
    storageMaterial: params.storageMaterial,
    complete
  });

  if (complete) {
    await completeFlowToken(token);
    await applyCompletedFlowToContact({ token, data: merged });
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
