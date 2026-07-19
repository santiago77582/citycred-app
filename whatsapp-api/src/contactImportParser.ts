import { readSheet } from 'read-excel-file/node';
import { AppError } from './errors/AppError.js';
import { normalizePhone } from './utils/phone.js';

export const MAX_CONTACT_IMPORT_ROWS = 5_000;
export const MAX_CONTACT_IMPORT_BYTES = 5 * 1024 * 1024;

const commercialStatuses = new Set([
  'NEW', 'PENDING', 'INTERESTED', 'DOCUMENTATION_PENDING', 'UNDER_REVIEW',
  'APPROVED', 'REJECTED', 'FINALIZED', 'DO_NOT_CONTACT'
]);

const headerAliases: Record<string, string> = {
  telefono: 'phone', phone: 'phone', celular: 'phone', whatsapp: 'phone', waid: 'phone',
  nombre: 'profileName', name: 'profileName', client: 'profileName', cliente: 'profileName',
  entidad: 'entity', entity: 'entity',
  dni: 'documentNumber', documento: 'documentNumber', document: 'documentNumber', documentnumber: 'documentNumber',
  antiguedad: 'seniorityRange', seniority: 'seniorityRange', seniorityrange: 'seniorityRange',
  cupo: 'availableQuota', cupodisponible: 'availableQuota', availablequota: 'availableQuota',
  estado: 'commercialStatus', estadocomercial: 'commercialStatus', commercialstatus: 'commercialStatus', status: 'commercialStatus',
  notas: 'notes', observaciones: 'notes', notes: 'notes',
  consentimiento: 'consentStatus', consent: 'consentStatus', consentstatus: 'consentStatus',
  fechaconsentimiento: 'consentAt', consentat: 'consentAt',
  baja: 'optOut', nocontactar: 'optOut', optout: 'optOut'
};

const statusAliases: Record<string, string> = {
  NUEVO: 'NEW', PENDIENTE: 'PENDING', INTERESADO: 'INTERESTED',
  FALTADOCUMENTACION: 'DOCUMENTATION_PENDING', DOCUMENTACIONPENDIENTE: 'DOCUMENTATION_PENDING',
  ENANALISIS: 'UNDER_REVIEW', APROBADO: 'APPROVED', RECHAZADO: 'REJECTED',
  FINALIZADO: 'FINALIZED', NOCONTACTAR: 'DO_NOT_CONTACT'
};

export type ContactImportPayload = {
  phone: string;
  profileName: string | null;
  entity: string | null;
  documentNumber: string | null;
  seniorityRange: string | null;
  availableQuota: number | null;
  commercialStatus: string;
  notes: string | null;
  consentStatus: 'UNKNOWN' | 'GRANTED' | 'REVOKED';
  consentAt: string | null;
};

export type ParsedContactImportRow = {
  rowNumber: number;
  normalizedPhone: string | null;
  status: 'VALID' | 'INVALID' | 'DUPLICATE';
  error: string | null;
  payload: ContactImportPayload | Record<string, never>;
};

export type ParsedContactImport = {
  format: 'CSV' | 'XLSX';
  rows: ParsedContactImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
};

function canonical(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

function nullableText(value: unknown, max: number, field: string): string | null {
  const text = cellText(value);
  if (!text) return null;
  if (text.length > max) throw new Error(`${field} supera ${max} caracteres`);
  return text;
}

function parseQuota(value: unknown): number | null {
  let text = cellText(value).replace(/\s/g, '');
  if (!text) return null;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (comma >= 0) {
    text = text.replace(',', '.');
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000_000) {
    throw new Error('Cupo disponible inválido');
  }
  return parsed;
}

function parseBoolean(value: unknown): boolean {
  const normalized = canonical(value);
  return ['1', 'TRUE', 'SI', 'YES', 'X', 'BAJA', 'REVOKED', 'REVOCADO'].includes(normalized);
}

function parseConsent(value: unknown, consentAtValue: unknown): {
  status: 'UNKNOWN' | 'GRANTED' | 'REVOKED';
  at: string | null;
} {
  const normalized = canonical(value);
  if (!normalized || ['UNKNOWN', 'SINREGISTRAR', 'DESCONOCIDO'].includes(normalized)) {
    return { status: 'UNKNOWN', at: null };
  }
  if (['REVOKED', 'REVOCADO', 'BAJA', 'NOCONTACTAR'].includes(normalized)) {
    return { status: 'REVOKED', at: null };
  }
  if (!['GRANTED', 'OTORGADO', 'SI', 'YES'].includes(normalized)) {
    throw new Error('Consentimiento inválido');
  }
  const rawDate = cellText(consentAtValue);
  const localDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(rawDate);
  const date = localDate
    ? new Date(Date.UTC(Number(localDate[3]), Number(localDate[2]) - 1, Number(localDate[1])))
    : rawDate ? new Date(rawDate) : null;
  if (
    localDate
    && date
    && (
      date.getUTCFullYear() !== Number(localDate[3])
      || date.getUTCMonth() !== Number(localDate[2]) - 1
      || date.getUTCDate() !== Number(localDate[1])
    )
  ) {
    throw new Error('Fecha de consentimiento inválida');
  }
  if (!date || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()) {
    throw new Error('El consentimiento otorgado exige una fecha válida no futura');
  }
  return { status: 'GRANTED', at: date.toISOString() };
}

function parseCommercialStatus(value: unknown): string {
  const normalized = canonical(value);
  if (!normalized) return 'NEW';
  const status = statusAliases[normalized] ?? normalized;
  if (!commercialStatuses.has(status)) throw new Error('Estado comercial inválido');
  return status;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'];
  let selected = ',';
  let best = -1;
  for (const delimiter of candidates) {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < firstLine.length; index += 1) {
      const char = firstLine[index];
      if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count += 1;
    }
    if (count > best) {
      best = count;
      selected = delimiter;
    }
  }
  return selected;
}

function parseCsv(buffer: Buffer): unknown[][] {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new AppError('El CSV tiene una celda entre comillas sin cerrar.', 400);
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function assertSafeXlsxArchive(buffer: Buffer): void {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new AppError('El archivo XLSX no tiene una estructura ZIP válida.', 400);
  }
  const searchStart = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new AppError('El archivo XLSX está incompleto.', 400);
  const entries = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entries > 1_000 || centralOffset + centralSize > buffer.length) {
    throw new AppError('El archivo XLSX supera los límites internos permitidos.', 413);
  }
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new AppError('El directorio interno del XLSX es inválido.', 400);
    }
    const compression = buffer.readUInt16LE(offset + 10);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if (![0, 8].includes(compression) || uncompressed === 0xffffffff) {
      throw new AppError('El XLSX usa una compresión no admitida.', 400);
    }
    totalUncompressed += uncompressed;
    if (uncompressed > 10 * 1024 * 1024 || totalUncompressed > 25 * 1024 * 1024) {
      throw new AppError('El contenido descomprimido del XLSX es demasiado grande.', 413);
    }
    offset += 46 + filenameLength + extraLength + commentLength;
  }
}

function headerMap(header: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((value, index) => {
    const alias = headerAliases[canonical(value).toLowerCase()];
    if (alias && !map.has(alias)) map.set(alias, index);
  });
  if (!map.has('phone')) {
    throw new AppError('El archivo necesita una columna Teléfono, phone o wa_id.', 400);
  }
  return map;
}

function valueAt(row: unknown[], headers: Map<string, number>, key: string): unknown {
  const index = headers.get(key);
  return index === undefined ? undefined : row[index];
}

function parseDataRow(
  row: unknown[],
  rowNumber: number,
  headers: Map<string, number>
): ParsedContactImportRow {
  try {
    const phone = normalizePhone(cellText(valueAt(row, headers, 'phone')));
    const optOut = parseBoolean(valueAt(row, headers, 'optOut'));
    const consent = optOut
      ? { status: 'REVOKED' as const, at: null }
      : parseConsent(
          valueAt(row, headers, 'consentStatus'),
          valueAt(row, headers, 'consentAt')
        );
    let commercialStatus = parseCommercialStatus(valueAt(row, headers, 'commercialStatus'));
    if (consent.status === 'REVOKED') commercialStatus = 'DO_NOT_CONTACT';
    return {
      rowNumber,
      normalizedPhone: phone,
      status: 'VALID',
      error: null,
      payload: {
        phone,
        profileName: nullableText(valueAt(row, headers, 'profileName'), 150, 'Nombre'),
        entity: nullableText(valueAt(row, headers, 'entity'), 100, 'Entidad'),
        documentNumber: nullableText(valueAt(row, headers, 'documentNumber'), 30, 'Documento'),
        seniorityRange: nullableText(valueAt(row, headers, 'seniorityRange'), 50, 'Antigüedad'),
        availableQuota: parseQuota(valueAt(row, headers, 'availableQuota')),
        commercialStatus,
        notes: nullableText(valueAt(row, headers, 'notes'), 5_000, 'Notas'),
        consentStatus: consent.status,
        consentAt: consent.at
      }
    };
  } catch (error) {
    return {
      rowNumber,
      normalizedPhone: null,
      status: 'INVALID',
      error: error instanceof Error ? error.message : String(error),
      payload: {}
    };
  }
}

export async function parseContactImport(
  buffer: Buffer,
  filename: string
): Promise<ParsedContactImport> {
  if (buffer.length < 1) throw new AppError('El archivo está vacío.', 400);
  if (buffer.length > MAX_CONTACT_IMPORT_BYTES) {
    throw new AppError('El archivo supera el máximo de 5 MB.', 413);
  }
  const extension = filename.trim().toLowerCase().split('.').pop();
  const format = extension === 'csv' ? 'CSV' : extension === 'xlsx' ? 'XLSX' : null;
  if (!format) throw new AppError('Solo se aceptan archivos .csv o .xlsx.', 400);

  let matrix: unknown[][];
  try {
    if (format === 'XLSX') assertSafeXlsxArchive(buffer);
    matrix = format === 'CSV' ? parseCsv(buffer) : await readSheet(buffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'No se pudo leer el archivo. Verificá que no esté dañado.',
      400,
      {
        parseError: error instanceof Error ? error.message : String(error),
        ...(process.env.NODE_ENV === 'test' && error instanceof Error
          ? { parseStack: error.stack }
          : {})
      }
    );
  }
  if (matrix.length < 2) throw new AppError('El archivo no contiene filas de clientes.', 400);
  if (matrix.length - 1 > MAX_CONTACT_IMPORT_ROWS) {
    throw new AppError(`El archivo supera el máximo de ${MAX_CONTACT_IMPORT_ROWS} filas.`, 413);
  }
  if (matrix.some((row) => row.length > 100)) {
    throw new AppError('El archivo supera el máximo de 100 columnas.', 413);
  }
  const headers = headerMap(matrix[0] ?? []);
  const rows = matrix.slice(1).map((row, index) => parseDataRow(row, index + 2, headers));
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.status !== 'VALID' || !row.normalizedPhone) continue;
    if (seen.has(row.normalizedPhone)) {
      row.status = 'DUPLICATE';
      row.error = 'Teléfono repetido dentro del archivo';
      continue;
    }
    seen.add(row.normalizedPhone);
  }
  return {
    format,
    rows,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'VALID').length,
    invalidRows: rows.filter((row) => row.status === 'INVALID').length,
    duplicateRows: rows.filter((row) => row.status === 'DUPLICATE').length
  };
}
