'use strict';

/*
  Seed controlada para emitir y transmitir EXACTAMENTE 49 Notas de Remisión
  Electrónicas (DTE 04) de forma secuencial en ambiente TEST.

  Seguridad:
  - Solo permite MH_ENV=TEST y empresa en ambiente TEST.
  - Exige CONFIRM_SEED_NRE_BATCH=true.
  - Exige SEED_NRE_BATCH_KEY: la clave hace al lote idempotente. Si el
    proceso se interrumpe, una nueva ejecución continúa sin duplicar los
    DTE ya aceptados.
  - Se detiene en el primer error o resultado ambiguo para no crear una
    cadena de documentos rechazados ni retransmitir DTE no confirmados.
  - Verifica antes de transmitir que el JSON oficial NRE no incluya
    resumen.ivaPerci1, campo que Hacienda no permite para DTE 04.
*/

const {
  Invoice,
  CUSTOMER_KEYS,
  initializeModelsAndDatabase,
  closeDatabase,
  assertConfirmed,
  assertTestEnvironment,
  getTodayInAppTimezone,
  resolveOperationalContext,
  ensureCompanyDocumentTypes,
  ensureSeedCustomers,
  createSeedInvoice
} = require('./lib/seed-dte-dinamico.helpers');

const invoicesService = require('../src/modules/invoices/invoices.service');
const InvoiceItem = require('../src/modules/invoices/invoice-item.model');
const dteJsonService = require('../src/modules/dte/dte-json.service');

const DOCUMENT_TYPE_CODE = '04';
const TARGET_COUNT = 49;
const CONFIRMATION_VARIABLE = 'CONFIRM_SEED_NRE_BATCH';

const normalizeKey = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '-')
  .replace(/[^A-Z0-9_-]/g, '');

const getRequiredEnv = (name) => {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`Falta la variable obligatoria ${name}.`);
  }

  return value;
};

const getPositiveNumberEnv = (name, defaultValue) => {
  const value = Number(process.env[name] ?? defaultValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} debe ser un número mayor que cero.`);
  }

  return value;
};

const getNonNegativeIntegerEnv = (name, defaultValue) => {
  const value = Number.parseInt(process.env[name] ?? defaultValue, 10);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} debe ser un entero mayor o igual a cero.`);
  }

  return value;
};

const getBatchConfig = () => {
  const batchKey = normalizeKey(getRequiredEnv('SEED_NRE_BATCH_KEY'));

  if (!/^[A-Z0-9_-]{3,40}$/.test(batchKey)) {
    throw new Error(
      'SEED_NRE_BATCH_KEY solo admite letras, números, guion y guion bajo; longitud de 3 a 40 caracteres.'
    );
  }

  const description = String(
    process.env.SEED_NRE_ITEM_DESCRIPTION ||
    'Mercadería de prueba para Nota de Remisión Electrónica'
  ).trim();

  if (description.length < 3 || description.length > 500) {
    throw new Error('SEED_NRE_ITEM_DESCRIPTION debe tener entre 3 y 500 caracteres.');
  }

  return {
    batchKey,
    description,
    quantity: getPositiveNumberEnv('SEED_NRE_QUANTITY', 1),
    unitPrice: getPositiveNumberEnv('SEED_NRE_UNIT_PRICE', 100),
    delayMs: getNonNegativeIntegerEnv('SEED_NRE_TRANSMIT_DELAY_MS', 1500)
  };
};

const padOrdinal = (ordinal) => String(ordinal).padStart(3, '0');

const buildNotes = ({ generalBatchKey, nreBatchKey, ordinal }) => (
  `SEED-NRE-LOTE-${generalBatchKey}-${nreBatchKey}-${padOrdinal(ordinal)} | SOLO PRUEBAS`
);

/*
  Para DTE 04 Hacienda rechaza códigos largos o con caracteres que no
  cumplen el esquema. Se usa un código corto, alfanumérico y determinista.
  Ejemplo: NRE00101 (lote ordinal 001, línea 01).
*/
const NRE_ITEM_CODE_PATTERN = /^[A-Z0-9]{1,25}$/;

const buildNreItemCode = (ordinal, lineNumber = 1) => (
  `NRE${padOrdinal(ordinal)}${String(lineNumber).padStart(2, '0')}`
);

const buildItems = ({ description, quantity, unitPrice, ordinal }) => ([
  {
    // Ítem independiente: no modifica existencias ni catálogo real.
    productId: null,
    itemType: 'PRODUCTO',
    code: buildNreItemCode(ordinal),
    description,
    unitOfMeasure: '59',
    unitOfMeasureName: 'Unidad',
    saleType: 'GRAVADA',
    quantity,
    unitPrice,
    retention1: 0,
    fovial: 0,
    cotrans: 0
  }
]);

const findExistingNre = async ({ companyId, notes }) => {
  return Invoice.findOne({
    where: {
      companyId,
      documentTypeCode: DOCUMENT_TYPE_CODE,
      notes
    },
    include: [
      {
        model: InvoiceItem,
        as: 'items'
      }
    ],
    order: [['id', 'DESC']]
  });
};

const normalizeRejectedNreItemCodes = async ({ invoice, ordinal }) => {
  const status = String(invoice.status || '').toUpperCase();

  // Nunca se modifica una NRE aceptada, firmada o transmitida.
  if (!['GENERADO', 'RECHAZADO'].includes(status)) {
    return;
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];

  if (!items.length) {
    throw new Error(
      `La NRE ${invoice.controlNumber} no tiene ítems para validar el código de producto.`
    );
  }

  let updatedCount = 0;

  for (const [index, item] of items.entries()) {
    const expectedCode = buildNreItemCode(ordinal, index + 1);

    if (String(item.code || '') !== expectedCode) {
      await item.update({ code: expectedCode });
      updatedCount += 1;
    }
  }

  if (updatedCount > 0) {
    console.log(
      `  ${padOrdinal(ordinal)}/${TARGET_COUNT} ↺ Código de ítem corregido para reintento: ` +
      `${items.map((_, index) => buildNreItemCode(ordinal, index + 1)).join(', ')}`
    );
  }
};

const assertNreOfficialJson = (invoice) => {
  const officialJson = dteJsonService.buildOfficialStandardDteJson(invoice);
  const identification = officialJson.identificacion || {};
  const summary = officialJson.resumen || {};
  const receiver = officialJson.receptor || {};

  if (String(identification.tipoDte) !== DOCUMENT_TYPE_CODE) {
    throw new Error(
      `Prevalidación NRE falló: tipoDte esperado ${DOCUMENT_TYPE_CODE}, recibido ${identification.tipoDte || 'vacío'}.`
    );
  }

  if (Number(identification.version) !== 3) {
    throw new Error(
      `Prevalidación NRE falló: la Nota de Remisión debe generarse con versión 3; se recibió ${identification.version || 'vacía'}.`
    );
  }

  if (Object.prototype.hasOwnProperty.call(summary, 'ivaPerci1')) {
    throw new Error(
      'Prevalidación NRE falló: resumen.ivaPerci1 no está permitido para Nota de Remisión. Aplique primero la corrección de NRE antes de ejecutar el lote.'
    );
  }

  const body = Array.isArray(officialJson.cuerpoDocumento)
    ? officialJson.cuerpoDocumento
    : [];

  if (!body.length) {
    throw new Error('Prevalidación NRE falló: cuerpoDocumento no contiene ítems.');
  }

  for (const [index, item] of body.entries()) {
    const code = String(item.codigo || '');

    if (!NRE_ITEM_CODE_PATTERN.test(code)) {
      throw new Error(
        `Prevalidación NRE falló: cuerpoDocumento/${index}/codigo debe ser alfanumérico ` +
        `de 1 a 25 caracteres; recibido "${code || 'vacío'}".`
      );
    }
  }

  if (!['01', '02', '03', '04', '05'].includes(String(receiver.bienTitulo || ''))) {
    throw new Error(
      'Prevalidación NRE falló: receptor.bienTitulo debe contener un código válido de 01 a 05.'
    );
  }

  return officialJson;
};

const assertSafeToTransmit = (invoice) => {
  const status = String(invoice.status || '').toUpperCase();

  if (status === 'ACEPTADO') {
    return false;
  }

  if (['FIRMADO', 'TRANSMITIDO'].includes(status)) {
    throw new Error(
      `La NRE ${invoice.controlNumber} está en estado ${status}. ` +
      'No se retransmitirá automáticamente porque Hacienda podría haberla recibido. Verifique su estado antes de continuar.'
    );
  }

  if (status === 'ANULADO') {
    throw new Error(
      `La NRE ${invoice.controlNumber} está ANULADA. Use otra SEED_NRE_BATCH_KEY para emitir una nueva Nota de Remisión.`
    );
  }

  if (!['GENERADO', 'RECHAZADO'].includes(status)) {
    throw new Error(`La NRE ${invoice.controlNumber} tiene un estado no permitido: ${status}.`);
  }

  return true;
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const run = async () => {
  assertConfirmed(CONFIRMATION_VARIABLE);
  assertTestEnvironment();
  await initializeModelsAndDatabase();

  const batchConfig = getBatchConfig();
  const issuedAtDate = getTodayInAppTimezone();
  const context = await resolveOperationalContext();
  const { config, user, company, establishment, roleCodes } = context;

  await ensureCompanyDocumentTypes({
    company,
    documentTypes: [DOCUMENT_TYPE_CODE]
  });

  const customers = await ensureSeedCustomers({
    establishmentId: establishment.id,
    only: CUSTOMER_KEYS.CARLOS
  });

  const executionUser = {
    id: user.id,
    roles: roleCodes
  };

  const summary = {
    created: 0,
    accepted: 0,
    transmitted: 0,
    alreadyAccepted: 0
  };

  console.log(
    `\n→ Iniciando lote de ${TARGET_COUNT} NRE TEST. Clave: ${batchConfig.batchKey}. ` +
    'La ejecución es secuencial y se detendrá ante el primer error.'
  );

  for (let ordinal = 1; ordinal <= TARGET_COUNT; ordinal += 1) {
    const notes = buildNotes({
      generalBatchKey: config.batchKey,
      nreBatchKey: batchConfig.batchKey,
      ordinal
    });

    let invoice = await findExistingNre({
      companyId: company.id,
      notes
    });

    if (!invoice) {
      invoice = await createSeedInvoice({
        user,
        roleCodes,
        documentTypeCode: DOCUMENT_TYPE_CODE,
        customerId: customers[CUSTOMER_KEYS.CARLOS].id,
        issuedAtDate,
        notes,
        ordinal,
        items: buildItems({
          ...batchConfig,
          ordinal
        })
      });

      summary.created += 1;
      console.log(`  ${padOrdinal(ordinal)}/${TARGET_COUNT} ✓ Creada: ${invoice.controlNumber}`);
    } else {
      console.log(`  ${padOrdinal(ordinal)}/${TARGET_COUNT} ✓ Existente: ${invoice.controlNumber} (${invoice.status})`);
    }

    if (!assertSafeToTransmit(invoice)) {
      summary.accepted += 1;
      summary.alreadyAccepted += 1;
      console.log(`  ${padOrdinal(ordinal)}/${TARGET_COUNT} ✓ Ya aceptada. Sello: ${invoice.receptionSeal || 'no registrado'}`);
      continue;
    }

    await normalizeRejectedNreItemCodes({
      invoice,
      ordinal
    });

    assertNreOfficialJson(invoice);

    console.log(`  ${padOrdinal(ordinal)}/${TARGET_COUNT} → Firmando y transmitiendo ${invoice.controlNumber}...`);

    const transmittedInvoice = await invoicesService.transmitInvoiceToHaciendaReal({
      id: invoice.id,
      user: executionUser
    });

    if (String(transmittedInvoice.status).toUpperCase() !== 'ACEPTADO') {
      throw new Error(
        `La NRE ${transmittedInvoice.controlNumber} terminó en estado ${transmittedInvoice.status}, no ACEPTADO.`
      );
    }

    summary.accepted += 1;
    summary.transmitted += 1;
    console.log(`  ${padOrdinal(ordinal)}/${TARGET_COUNT} ✓ Aceptada. Sello: ${transmittedInvoice.receptionSeal}`);

    if (batchConfig.delayMs > 0 && ordinal < TARGET_COUNT) {
      await sleep(batchConfig.delayMs);
    }
  }

  if (summary.accepted !== TARGET_COUNT) {
    throw new Error(
      `El lote no completó las ${TARGET_COUNT} NRE. Aceptadas: ${summary.accepted}/${TARGET_COUNT}.`
    );
  }

  console.log('\n✓ Lote NRE completado correctamente.');
  console.log(`  Nuevas creadas: ${summary.created}`);
  console.log(`  Nuevas transmitidas y aceptadas: ${summary.transmitted}`);
  console.log(`  Ya aceptadas en una ejecución anterior: ${summary.alreadyAccepted}`);
  console.log(`  Total aceptadas: ${summary.accepted}/${TARGET_COUNT}`);
};

run()
  .catch((error) => {
    console.error('\n✗ Error en lote de NRE:', error.message);
    if (error.mhResponse) {
      console.error('Respuesta de Hacienda:', JSON.stringify(error.mhResponse));
    }
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
