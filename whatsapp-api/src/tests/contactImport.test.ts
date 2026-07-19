import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const { parseContactImport } = await import('../contactImportParser.js');
const {
  commitContactImport,
  previewContactImport
} = await import('../contactImportRepository.js');
const { createUser } = await import('../crm/teamRepository.js');

test.afterEach(() => base.reiniciar());

async function actorId(): Promise<string> {
  const actor = await createUser({
    email: 'importador@citycred.test',
    displayName: 'Importador',
    password: 'ClaveImportador123!',
    role: 'SUPERVISOR'
  });
  return actor.id;
}

function xlsxFixture(): Buffer {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      </Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <fonts count="1"><font/></fonts><fills count="1"><fill/></fills>
        <borders count="1"><border/></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
      </styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Teléfono</t></is></c><c r="B1" t="inlineStr"><is><t>Nombre</t></is></c><c r="C1" t="inlineStr"><is><t>Consentimiento</t></is></c><c r="D1" t="inlineStr"><is><t>Fecha consentimiento</t></is></c></row>
          <row r="2"><c r="A2" t="inlineStr"><is><t>0291 555-7788</t></is></c><c r="B2" t="inlineStr"><is><t>Cliente Excel</t></is></c><c r="C2" t="inlineStr"><is><t>OTORGADO</t></is></c><c r="D2" t="inlineStr"><is><t>2026-07-01</t></is></c></row>
        </sheetData>
      </worksheet>`)
  };
  return Buffer.from(zipSync(files));
}

test('lee CSV, normaliza teléfonos y no infiere consentimiento', async () => {
  const csv = Buffer.from([
    'Teléfono;Nombre;Entidad;Cupo;Consentimiento;Fecha consentimiento',
    '0291 555-1111;Cliente Uno;Educación RN;1.234,56;OTORGADO;01/07/2026',
    '0291 555-1111;Duplicado;Educación RN;;;',
    '0291 555-2222;Sin fecha;Educación RN;;OTORGADO;',
    '0291 555-3333;Sin registrar;Educación RN;;;'
  ].join('\n'));
  const parsed = await parseContactImport(csv, 'clientes.csv');
  assert.equal(parsed.format, 'CSV');
  assert.equal(parsed.totalRows, 4);
  assert.equal(parsed.validRows, 2);
  assert.equal(parsed.duplicateRows, 1);
  assert.equal(parsed.invalidRows, 1);
  assert.equal(parsed.rows[0]?.normalizedPhone, '5492915551111');
  assert.equal(parsed.rows[0]?.payload.availableQuota, 1234.56);
  assert.equal(parsed.rows[2]?.error, 'El consentimiento otorgado exige una fecha válida no futura');
  assert.equal(parsed.rows[3]?.payload.consentStatus, 'UNKNOWN');
});

test('lee una planilla XLSX real y usa la primera hoja', async () => {
  const parsed = await parseContactImport(xlsxFixture(), 'clientes.xlsx');
  assert.equal(parsed.format, 'XLSX');
  assert.equal(parsed.validRows, 1);
  assert.equal(parsed.rows[0]?.normalizedPhone, '5492915557788');
  assert.equal(parsed.rows[0]?.payload.profileName, 'Cliente Excel');
  assert.equal(parsed.rows[0]?.payload.consentStatus, 'GRANTED');
});

test('rechaza un XLSX que declara contenido descomprimido excesivo', async () => {
  const fixture = xlsxFixture();
  const centralSignature = 0x02014b50;
  let centralOffset = -1;
  for (let offset = 0; offset <= fixture.length - 4; offset += 1) {
    if (fixture.readUInt32LE(offset) === centralSignature) {
      centralOffset = offset;
      break;
    }
  }
  assert.ok(centralOffset >= 0);
  fixture.writeUInt32LE(11 * 1024 * 1024, centralOffset + 24);
  await assert.rejects(
    () => parseContactImport(fixture, 'bomba.xlsx'),
    /descomprimido.*demasiado grande/i
  );
});

test('la vista previa no modifica contactos y el commit explícito sí', async () => {
  const actor = await actorId();
  const csv = Buffer.from([
    'telefono,nombre,estado,consentimiento,fecha consentimiento',
    '0291 555-4444,Cliente Importado,INTERESTED,OTORGADO,2026-07-01',
    '0291 555-5555,Cliente Baja,INTERESTED,REVOCADO,'
  ].join('\n'));
  const preview = await previewContactImport({
    bytes: csv,
    filename: 'clientes.csv',
    actorUserId: actor
  });
  assert.equal(preview.batch.status, 'PREVIEWED');
  assert.equal(preview.batch.validRows, 2);
  assert.equal(Number((await base.consultar('SELECT COUNT(*) AS total FROM contacts')).rows[0]?.total), 0);

  const committed = await commitContactImport(preview.batch.id, actor);
  assert.equal(committed.status, 'IMPORTED');
  assert.deepEqual(
    { created: committed.summary.created, updated: committed.summary.updated, skipped: committed.summary.skipped },
    { created: 2, updated: 0, skipped: 0 }
  );
  const contacts = await base.consultar(
    `SELECT wa_id, commercial_status, consent_status, consent_source, opt_out_at
     FROM contacts ORDER BY wa_id`
  );
  assert.equal(contacts.rows[0]?.consent_status, 'GRANTED');
  assert.match(String(contacts.rows[0]?.consent_source), /^IMPORT:/);
  assert.equal(contacts.rows[1]?.commercial_status, 'DO_NOT_CONTACT');
  assert.equal(contacts.rows[1]?.consent_status, 'REVOKED');
  assert.ok(contacts.rows[1]?.opt_out_at);

  await assert.rejects(() => commitContactImport(preview.batch.id, actor), /ya fue procesada/i);
});

test('una importación nunca reactiva una baja existente', async () => {
  const actor = await actorId();
  await base.consultar(
    `INSERT INTO contacts (
       id, wa_id, phone, profile_name, commercial_status,
       consent_status, consent_source, opt_out_at
     ) VALUES ($1, '5492915556666', '5492915556666', 'Baja previa',
       'DO_NOT_CONTACT', 'REVOKED', 'MANUAL_PREVIO', NOW())`,
    ['10000000-0000-4000-8000-000000000001']
  );
  const csv = Buffer.from([
    'telefono,nombre,estado,consentimiento,fecha consentimiento',
    '5492915556666,Intento de reactivar,INTERESTED,OTORGADO,2026-07-01'
  ].join('\n'));
  const preview = await previewContactImport({
    bytes: csv,
    filename: 'reactivacion.csv',
    actorUserId: actor
  });
  await commitContactImport(preview.batch.id, actor);
  const contact = await base.consultar(
    `SELECT commercial_status, consent_status, consent_source, opt_out_at FROM contacts
     WHERE wa_id = '5492915556666'`
  );
  assert.equal(contact.rows[0]?.commercial_status, 'DO_NOT_CONTACT');
  assert.equal(contact.rows[0]?.consent_status, 'REVOKED');
  assert.equal(contact.rows[0]?.consent_source, 'MANUAL_PREVIO');
  assert.ok(contact.rows[0]?.opt_out_at);
});
