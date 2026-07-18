import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-comercio-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789'
});

const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const {
  buildCatalogMessage,
  buildProductListMessage,
  buildProductMessage
} = await import('../routes/commerce.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function api(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${server.baseUrl}/api/v1${path}`, {
    ...options,
    headers: {
      'x-api-key': TEST_API_KEY,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {})
    }
  });
}

test('envía un producto oficial y persiste el mensaje', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ messages: [{ id: 'wamid-producto-1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const response = await api('/commerce/product', {
      method: 'POST',
      body: JSON.stringify({
        to: '5492911111111',
        catalogId: 'catalogo-1',
        productRetailerId: 'producto-1',
        body: 'Conocé este producto',
        footer: 'CityCred'
      })
    });
    assert.equal(response.status, 201);
    assert.equal(bodies.length, 1);
    const body = bodies[0];
    assert.ok(body);
    assert.equal(body.type, 'interactive');
    const interactive = body.interactive as Record<string, unknown>;
    assert.equal(interactive.type, 'product');
    assert.deepEqual(interactive.action, {
      catalog_id: 'catalogo-1',
      product_retailer_id: 'producto-1'
    });

    const saved = await base.consultar(
      `SELECT type, status FROM messages WHERE wamid = 'wamid-producto-1'`
    );
    assert.equal(saved.rows[0]?.type, 'commerce_product');
    assert.equal(saved.rows[0]?.status, 'PENDING');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('construye producto múltiple y catálogo con los campos oficiales', () => {
  const product = buildProductMessage({
    to: '5492911111111',
    catalogId: 'cat-1',
    productRetailerId: 'sku-1',
    replyToMessageId: 'wamid-previo'
  });
  assert.deepEqual(product.context, { message_id: 'wamid-previo' });

  const list = buildProductListMessage({
    to: '5492911111111',
    catalogId: 'cat-1',
    header: 'Productos',
    body: 'Elegí',
    sections: [{
      title: 'Opciones',
      productItems: [
        { productRetailerId: 'sku-1' },
        { productRetailerId: 'sku-2' }
      ]
    }]
  });
  const interactive = list.interactive as Record<string, unknown>;
  assert.equal(interactive.type, 'product_list');

  const catalog = buildCatalogMessage({
    to: '5492911111111',
    body: 'Abrí nuestro catálogo',
    thumbnailProductRetailerId: 'sku-portada'
  });
  const catalogInteractive = catalog.interactive as Record<string, unknown>;
  assert.equal(catalogInteractive.type, 'catalog_message');
  assert.deepEqual(catalogInteractive.action, {
    name: 'catalog_message',
    parameters: { thumbnail_product_retailer_id: 'sku-portada' }
  });
});

test('consulta perfil, número y comercio mediante endpoints oficiales', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    urls.push(url);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer token-comercio-pruebas');
    if (url.includes('whatsapp_business_profile')) {
      return new Response(JSON.stringify({ data: [{ about: 'CityCred' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (url.includes('whatsapp_commerce_settings')) {
      return new Response(JSON.stringify({
        data: [{ id: 'commerce-1', is_cart_enabled: true, is_catalog_visible: true }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      id: '123456789',
      verified_name: 'CityCred',
      display_phone_number: '5492914717121',
      quality_rating: 'GREEN',
      code_verification_status: 'VERIFIED'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    assert.equal((await api('/account/profile')).status, 200);
    assert.equal((await api('/account/phone-number')).status, 200);
    assert.equal((await api('/account/commerce-settings')).status, 200);
    assert.equal(urls.length, 3);
    assert.ok(urls.some((url) => url.includes('/123456789/whatsapp_business_profile')));
    assert.ok(urls.some((url) => url.includes('/123456789/whatsapp_commerce_settings')));
    assert.ok(urls.some((url) => url.includes('/123456789?fields=')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('exige confirmación explícita antes de modificar el perfil', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const denied = await api('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ about: 'CityCred' })
    });
    assert.equal(denied.status, 400);
    assert.equal(externalCalls, 0);

    const accepted = await api('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ confirm: true, about: 'Créditos personales CityCred' })
    });
    assert.equal(accepted.status, 200);
    assert.equal(externalCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
