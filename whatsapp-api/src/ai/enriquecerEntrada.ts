import { isAiEnabled } from '../config.js';
import { openMetaMediaDownload } from '../services/metaMedia.js';
import { messageText } from '../services/webhookMessage.js';
import { logger } from '../utils/logger.js';
import { transcribeAudio } from './openaiClient.js';

/**
 * Convierte un mensaje entrante en el TEXTO que va a leer el bot.
 *
 * - Texto normal: se devuelve tal cual.
 * - Audio: si la IA está encendida, se descarga y se transcribe; el bot recibe
 *   lo que la persona dijo. Si la IA está apagada o falla, se cae al texto de
 *   siempre ("[audio]") y el bot sigue funcionando sin romperse.
 *
 * Las funciones de descarga y transcripción son inyectables para poder probar
 * sin llamar a Meta ni a OpenAI.
 */

type UnknownRecord = Record<string, unknown>;

export type EntradaEnriquecida = {
  /** Texto que el bot debe interpretar. */
  text: string | null;
  /** Transcripción del audio, para guardar en el CRM (uso interno). */
  transcripcion?: string;
  /** Si hubo un audio que no se pudo transcribir con confianza. */
  audioIlegible?: boolean;
};

export type EnriquecerDeps = {
  descargarAudio?: (mediaId: string) => Promise<{ bytes: Buffer; mimeType: string } | null>;
  transcribir?: typeof transcribeAudio;
};

async function descargarAudioDeMeta(
  mediaId: string
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    const abierto = await openMetaMediaDownload(mediaId);
    const buffer = Buffer.from(await abierto.response.arrayBuffer());
    const mimeType = abierto.response.headers.get('content-type')
      ?? abierto.info.mime_type
      ?? 'audio/ogg';
    return { bytes: buffer, mimeType };
  } catch (error) {
    logger.error({ err: error }, 'No se pudo descargar el audio para transcribir');
    return null;
  }
}

export async function enriquecerEntrada(
  message: UnknownRecord,
  deps: EnriquecerDeps = {}
): Promise<EntradaEnriquecida> {
  const tipo = String(message.type ?? '');
  const textoBase = messageText(message);

  // Solo los audios se transcriben. El resto pasa como está.
  const esAudio = tipo === 'audio' || tipo === 'voice';
  if (!esAudio || !isAiEnabled()) {
    return { text: textoBase };
  }

  const media = (message.audio ?? message.voice) as UnknownRecord | undefined;
  const mediaId = typeof media?.id === 'string' ? media.id : null;
  if (!mediaId) return { text: textoBase };

  const descargar = deps.descargarAudio ?? descargarAudioDeMeta;
  const transcribir = deps.transcribir ?? transcribeAudio;

  const audio = await descargar(mediaId);
  if (!audio) return { text: textoBase };

  const resultado = await transcribir({ audio: audio.bytes, mimeType: audio.mimeType });
  if (!resultado.ok) {
    // No se pudo transcribir: el bot pedirá que lo repita o lo escriba.
    return { text: textoBase, audioIlegible: true };
  }

  return { text: resultado.value, transcripcion: resultado.value };
}
