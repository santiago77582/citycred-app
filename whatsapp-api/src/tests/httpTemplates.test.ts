import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTestEnv,
  TEST_API_KEY
} from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-plantillas-http',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321'
});
const base = await prepararBaseEnMemoria();
const { syncWhatsappTemplates } = await import('../templateRepository.js');
const server = await iniciarServidorDePruebas();

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function seedTemplates() {
  await syncWhatsappTemplates([
    {
      metaTemplateId: 'meta-approved',
      name: 'bienvenida_aprobada',
      languageCode: 'es_AR',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola {{1}}' }],
      rejectionReason: null
    },
    {
      metaTemplateId: 'meta-image',
      name: 'promocion_con_imagen',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Oferta vigente' }
      ],
      rejectionReason: null
    },
    {
      metaTemplateId: 'meta-pending',
      name: 'pendiente_revision',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'PENDING',
      components: [],
      rejectionReason: null
    }
  ]);
  const result = await base.consultar(
    'SELECT id, name FROM whatsapp_templates ORDER BY name'
  );
  return Object.fromEntries(result.rows.map((row) => [String(row.name), String(row.id)]));
}

test('la lista de plantillas requiere clave de API', async () => {
  const response = await fetch(`${server.baseUrl}/api/v1/templates`);
  assert.equal(response.status, 401);
});

test('rechaza el envío de una plantilla que no está aprobada sin llamar a Meta', async () => {
  const ids = await seedTemplates();
  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    metaCalls += 1;
    throw new Error('No debía llamar a Meta');
  };

  try {
    const response = await fetch(
      `${server.baseUrl}/api/v1/templates/${ids.pendiente_revision}/send`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({ to: '5492915550000' })
      }
    );
    assert.equal(response.status, 409);
    assert.equal(metaCalls, 0);
    const body = await response.json() as { error?: string };
    assert.match(body.error ?? '', /no está aprobada/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rechaza un tipo de archivo que no coincide con el encabezado de la plantilla', async () => {
  const ids = await seedTemplates();
  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    metaCalls += 1;
    throw new Error('No debía llamar a Meta');
  };

  try {
    const response = await fetch(
      `${server.baseUrl}/api/v1/templates/${ids.promocion_con_imagen}/header-media`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'content-length': '4',
          'x-citycred-filename': encodeURIComponent('archivo.pdf'),
          'x-api-key': TEST_API_KEY
        },
        body: new Uint8Array([1, 2, 3, 4])
      }
    );
    assert.equal(response.status, 415);
    assert.equal(metaCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sube una imagen válida y devuelve el media_id para el encabezado', async () => {
  const ids = await seedTemplates();
  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    metaCalls += 1;
    assert.match(url, /\/v23\.0\/123456789\/media$/);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer token-plantillas-http');
    const form = init?.body as FormData;
    assert.equal(form.get('messaging_product'), 'whatsapp');
    assert.ok(form.get('file') instanceof Blob);
    return new Response(JSON.stringify({ id: 'media-header-image-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const response = await fetch(
      `${server.baseUrl}/api/v1/templates/${ids.promocion_con_imagen}/header-media`,
      {
        method: 'POST',
        headers: {
          'content-type': 'image/jpeg',
          'content-length': '4',
          'x-citycred-filename': encodeURIComponent('promocion.jpg'),
          'x-api-key': TEST_API_KEY
        },
        body: new Uint8Array([255, 216, 255, 217])
      }
    );
    assert.equal(response.status, 201);
    assert.equal(metaCalls, 1);
    const body = await response.json() as {
      mediaId?: string;
      kind?: string;
      filename?: string;
      sizeBytes?: number;
    };
    assert.equal(body.mediaId, 'media-header-image-1');
    assert.equal(body.kind, 'image');
    assert.equal(body.filename, 'promocion.jpg');
    assert.equal(body.sizeBytes, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('envía una plantilla aprobada usando el nombre e idioma sincronizados', async () => {
  const ids = await seedTemplates();
  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  const sentPayloads: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    metaCalls += 1;
    sentPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.template.approved' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const response = await fetch(
      `${server.baseUrl}/api/v1/templates/${ids.bienvenida_aprobada}/send`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          to: '5492915550000',
          components: [{
            type: 'body',
            parameters: [{ type: 'text', text: 'Santiago' }]
          }]
        })
      }
    );
    assert.equal(response.status, 201);
    assert.equal(metaCalls, 1);
    const template = sentPayloads[0]?.template as {
      name?: string;
      language?: { code?: string };
    } | undefined;
    assert.equal(template?.name, 'bienvenida_aprobada');
    assert.equal(template?.language?.code, 'es_AR');

    const body = await response.json() as {
      status?: string;
      wamid?: string;
      botPausedUntil?: string;
    };
    assert.equal(body.status, 'PENDING');
    assert.equal(body.wamid, 'wamid.template.approved');
    assert.ok(body.botPausedUntil);

    const persisted = await base.consultar(
      `SELECT type, status, text FROM messages WHERE wamid = $1`,
      ['wamid.template.approved']
    );
    assert.equal(persisted.rows[0]?.type, 'template');
    assert.equal(persisted.rows[0]?.status, 'PENDING');
    assert.equal(persisted.rows[0]?.text, 'plantilla:bienvenida_aprobada');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
