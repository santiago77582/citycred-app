import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const {
  getWhatsappTemplateById,
  listWhatsappTemplates,
  syncWhatsappTemplates
} = await import('../templateRepository.js');

test.afterEach(() => base.reiniciar());

test('sincroniza, actualiza y marca como ausentes las plantillas que Meta dejó de devolver', async () => {
  const first = await syncWhatsappTemplates([
    {
      metaTemplateId: 'meta-1',
      name: 'bienvenida',
      languageCode: 'es_AR',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola' }],
      rejectionReason: null
    },
    {
      metaTemplateId: 'meta-2',
      name: 'recordatorio',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'PENDING',
      components: [],
      rejectionReason: null
    }
  ]);
  assert.equal(first.synced, 2);
  assert.equal(first.markedMissing, 0);

  const approved = await listWhatsappTemplates({ limit: 20, status: 'APPROVED' });
  assert.equal(approved.length, 1);
  assert.equal(approved[0]?.name, 'bienvenida');
  assert.ok(approved[0]?.lastSyncedAt);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await syncWhatsappTemplates([
    {
      metaTemplateId: 'meta-1-nuevo',
      name: 'bienvenida',
      languageCode: 'es_AR',
      category: 'UTILITY',
      status: 'PAUSED',
      components: [{ type: 'BODY', text: 'Hola actualizado' }],
      rejectionReason: null
    }
  ]);
  assert.equal(second.synced, 1);
  assert.equal(second.markedMissing, 1);

  const all = await listWhatsappTemplates({ limit: 20 });
  assert.equal(all.length, 2);
  const welcome = all.find((item) => item.name === 'bienvenida');
  const reminder = all.find((item) => item.name === 'recordatorio');
  assert.equal(welcome?.status, 'PAUSED');
  assert.equal(welcome?.metaTemplateId, 'meta-1-nuevo');
  assert.equal(reminder?.status, 'NOT_FOUND');

  const detail = await getWhatsappTemplateById(String(welcome?.id));
  assert.equal(detail.components[0] && typeof detail.components[0] === 'object', true);
});

test('la sincronización revierte todo si falla una escritura', async () => {
  base.simularFalloDeBase((sql) => sql.includes('INSERT INTO whatsapp_templates'));
  await assert.rejects(
    () => syncWhatsappTemplates([
      {
        metaTemplateId: 'meta-error',
        name: 'fallida',
        languageCode: 'es_AR',
        category: 'UTILITY',
        status: 'APPROVED',
        components: [],
        rejectionReason: null
      }
    ]),
    /Fallo de base de datos simulado/
  );
  base.restaurarBase();
  const count = await base.consultar('SELECT COUNT(*)::int AS total FROM whatsapp_templates');
  assert.equal(Number(count.rows[0]?.total), 0);
});
