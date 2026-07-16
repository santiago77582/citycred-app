import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';

export type ServidorDePruebas = {
  baseUrl: string;
  cerrar: () => Promise<void>;
};

/**
 * Levanta la app Express real en un puerto efímero de loopback para que las
 * pruebas ejerciten la API por HTTP de verdad (middlewares incluidos).
 */
export async function iniciarServidorDePruebas(): Promise<ServidorDePruebas> {
  const { createApp } = await import('../../app.js');
  const app = createApp();

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('El servidor de pruebas no expuso un puerto TCP');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    cerrar: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

/** Firma un cuerpo igual que Meta: HMAC SHA-256 del cuerpo crudo con el App Secret. */
export function firmaDeMeta(cuerpoCrudo: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(cuerpoCrudo).digest('hex')}`;
}

/** POST al webhook con el encabezado de firma indicado (o sin él). */
export async function postWebhook(
  baseUrl: string,
  cuerpoCrudo: string,
  firma?: string
): Promise<Response> {
  return fetch(`${baseUrl}/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(firma !== undefined ? { 'x-hub-signature-256': firma } : {})
    },
    body: cuerpoCrudo
  });
}

/** Payload realista de Meta con un mensaje de texto entrante. */
export function payloadMensajeEntrante(params: {
  wamid: string;
  de: string;
  texto: string;
  nombre?: string;
}): Record<string, unknown> {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '747167224527947-pruebas',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5490000000000', phone_number_id: 'pruebas' },
              contacts: [{ wa_id: params.de, profile: { name: params.nombre ?? 'Cliente Prueba' } }],
              messages: [
                {
                  id: params.wamid,
                  from: params.de,
                  timestamp: '1760000000',
                  type: 'text',
                  text: { body: params.texto }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

/** Payload realista de Meta con un evento de estado (sent/delivered/read/failed). */
export function payloadEstado(params: {
  wamid: string;
  estado: 'sent' | 'delivered' | 'read' | 'failed';
  destinatario?: string;
  errores?: Array<{ code: number; title: string }>;
}): Record<string, unknown> {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '747167224527947-pruebas',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5490000000000', phone_number_id: 'pruebas' },
              statuses: [
                {
                  id: params.wamid,
                  status: params.estado,
                  timestamp: '1760000001',
                  recipient_id: params.destinatario ?? '5492900000001',
                  ...(params.errores ? { errors: params.errores } : {})
                }
              ]
            }
          }
        ]
      }
    ]
  };
}
