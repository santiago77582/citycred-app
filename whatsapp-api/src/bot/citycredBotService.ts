import { sendAdvancedAndPersist } from '../services/outboundAdvanced.js';
import { enriquecerEntrada } from '../ai/enriquecerEntrada.js';
import { analizarBlindaje, bloqueaEnvioAutomatico } from '../domain/blindaje.js';
import { logger } from '../utils/logger.js';
import { messageText } from '../services/webhookMessage.js';
import {
  applyBotDecision,
  getBotRuntimeSettings,
  getBotStateByWaId,
  markBotOutbound
} from './botStateRepository.js';
import {
  cancelPendingFollowups,
  scheduleCitycredFollowups
} from './followupRepository.js';
import {
  decideCitycredBot,
  extractInteractiveId,
  type BotResponse
} from './citycredBotEngineV2.js';

function outboundMessage(response: BotResponse): Record<string, unknown> {
  if (response.kind === 'text') {
    return { type: 'text', text: { body: response.body, preview_url: false } };
  }
  if (response.kind === 'buttons') {
    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: response.body },
        action: {
          buttons: response.buttons.map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: button.title }
          }))
        }
      }
    };
  }
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: response.body },
      action: {
        button: response.button,
        sections: response.sections.map((section) => ({
          title: section.title,
          rows: section.rows
        }))
      }
    }
  };
}

export async function processCitycredBotInbound(params: {
  waId: string;
  inboundMessageId: string;
  message: Record<string, unknown>;
}): Promise<{
  processed: boolean;
  reason: string;
  nextStage?: string;
  outboundMessageId?: string | null;
  followupsScheduled?: number;
}> {
  const current = await getBotStateByWaId(params.waId);
  await cancelPendingFollowups(current.conversationId, 'customer_replied');
  const settings = await getBotRuntimeSettings();
  if (!settings.botEnabled) return { processed: false, reason: 'bot_disabled' };
  if (current.paused) return { processed: false, reason: 'conversation_paused' };
  if (current.state.commercialStatus === 'DO_NOT_CONTACT') {
    return { processed: false, reason: 'do_not_contact' };
  }

  const type = typeof params.message.type === 'string' ? params.message.type : null;

  // La IA transcribe los audios antes de que el bot los lea. Si está apagada o
  // falla, `enriquecerEntrada` devuelve el texto de siempre: nunca rompe nada.
  const enriquecida = await enriquecerEntrada(params.message);

  // Un audio que no se pudo transcribir NO se responde a ciegas: se pide que lo
  // repita o lo escriba, sin inventar lo que dijo.
  if (enriquecida.audioIlegible) {
    const outcome = await sendAdvancedAndPersist({
      to: params.waId,
      type: 'bot_text',
      text: 'Perdón, no llegué a escuchar bien el audio. ¿Me lo repetís o me lo escribís?',
      message: { type: 'text', text: { body: 'audio_ilegible' } }
    });
    return {
      processed: true,
      reason: 'audio_ilegible',
      nextStage: current.state.stage,
      outboundMessageId: outcome.payload.messageId
    };
  }

  const decision = decideCitycredBot(current.state, {
    text: enriquecida.text,
    interactiveId: extractInteractiveId(params.message),
    messageType: type,
    hasMedia: ['image', 'audio', 'video', 'document', 'sticker'].includes(type ?? '')
  });
  // BLINDAJE: red de seguridad final. Los textos del bot ya están revisados,
  // pero si alguna vez se edita uno y queda con una frase que pone en riesgo la
  // cuenta, no sale solo: se corta y lo atiende una persona. Antes de guardar el
  // avance, así la conversación no queda descolgada en una etapa que no contestó.
  if (decision.response) {
    const blindaje = analizarBlindaje(decision.response.body);
    if (bloqueaEnvioAutomatico(blindaje)) {
      logger.error(
        { waId: params.waId, puntaje: blindaje.puntaje, hallazgos: blindaje.hallazgos.map((h) => h.regla) },
        'Blindaje frenó una respuesta automática del bot'
      );
      return { processed: false, reason: 'blindaje_bloqueo', nextStage: current.state.stage };
    }
  }

  await applyBotDecision({
    contactId: current.contactId,
    conversationId: current.conversationId,
    inboundMessageId: params.inboundMessageId,
    previousStage: current.state.stage,
    decision
  });

  if (!decision.response) {
    return { processed: true, reason: decision.reason, nextStage: decision.nextStage };
  }
  const outcome = await sendAdvancedAndPersist({
    to: params.waId,
    type: decision.response.kind === 'text' ? 'bot_text' : 'bot_interactive',
    text: decision.response.body,
    message: outboundMessage(decision.response)
  });
  await markBotOutbound(current.contactId);

  let followupsScheduled = 0;
  if (
    settings.followupsEnabled
    && decision.scheduleFollowups
    && outcome.statusCode === 201
  ) {
    followupsScheduled = await scheduleCitycredFollowups({
      contactId: current.contactId,
      conversationId: current.conversationId,
      outboundMessageId: outcome.payload.messageId,
      profileName: decision.patch.profileName ?? current.state.profileName
    });
  }
  return {
    processed: true,
    reason: decision.reason,
    nextStage: decision.nextStage,
    outboundMessageId: outcome.payload.messageId,
    followupsScheduled
  };
}
