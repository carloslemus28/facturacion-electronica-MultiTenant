'use strict';

/*
  Seed controlada para emitir UNA Nota de Remisión Electrónica (DTE 04)
  y transmitirla inmediatamente a Hacienda en ambiente TEST.

  Seguridad:
  - Solo permite MH_ENV=TEST y empresa en ambiente TEST.
  - Exige CONFIRM_SEED_NRE=true.
  - Exige SEED_NRE_KEY para que sea idempotente: una reejecución no crea
    un segundo DTE para la misma clave.
  - Si la respuesta de Hacienda es ambigua, conserva el DTE FIRMADO y se
    detiene para evitar retransmitirlo a ciegas.
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

const DOCUMENT_TYPE_CODE = '04';
const CONFIRMATION_VARIABLE = 'CONFIRM_SEED_NRE';
const DELIVERY_PURPOSE_CODES = new Set(['01', '02', '03', '04', '05']);

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
  const rawValue = process.env[name] ?? defaultValue;
  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} debe ser un número mayor que cero.`);
  }

  return value;
};

const getNreConfig = () => {
  const seedKey = normalizeKey(getRequiredEnv('SEED_NRE_KEY'));

  if (!/^[A-Z0-9_-]{3,50}$/.test(seedKey)) {
    throw new Error(
      'SEED_NRE_KEY solo admite letras, números, guion y guion bajo; longitud de 3 a 50 caracteres.'
    );
  }

  const description = String(
    process.env.SEED_NRE_ITEM_DESCRIPTION ||
    'Mercadería de prueba para Nota de Remisión Electrónica'
  ).trim();

  if (description.length < 3 || description.length > 500) {
    throw new Error('SEED_NRE_ITEM_DESCRIPTION debe tener entre 3 y 500 caracteres.');
  }

  const quantity = getPositiveNumberEnv('SEED_NRE_QUANTITY', 1);
  const unitPrice = getPositiveNumberEnv('SEED_NRE_UNIT_PRICE', 100);
  const deliveryPurposeCode = String(process.env.SEED_NRE_TITLE_CODE || '04').trim();

  if (!DELIVERY_PURPOSE_CODES.has(deliveryPurposeCode)) {
    throw new Error(
      'SEED_NRE_TITLE_CODE debe ser 01 (Depósito), 02 (Propiedad), 03 (Consignación), 04 (Traslado) o 05 (Otros).'
    );
  }

  return {
    seedKey,
    description,
    quantity,
    unitPrice,
    deliveryPurposeCode
  };
};

const buildNotes = ({ batchKey, seedKey, deliveryPurposeCode }) => (
  `SEED-NRE-${batchKey}-${seedKey} | NRE-TITULO-${deliveryPurposeCode} | SOLO PRUEBAS`
);

const buildLegacyNotes = ({ batchKey, seedKey }) => (
  `SEED-NRE-${batchKey}-${seedKey} | SOLO PRUEBAS`
);

const buildItems = ({ seedKey, description, quantity, unitPrice }) => ([
  {
    // Se usa un ítem independiente para no alterar existencias reales.
    productId: null,
    itemType: 'PRODUCTO',
    code: `SEED-NRE-${seedKey}`.slice(0, 50),
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

const findExistingNre = async ({ companyId, notes, legacyNotes }) => {
  const findByNotes = (notesValue) => Invoice.findOne({
    where: {
      companyId,
      documentTypeCode: DOCUMENT_TYPE_CODE,
      notes: notesValue
    },
    order: [['id', 'DESC']]
  });

  const currentInvoice = await findByNotes(notes);

  if (currentInvoice || !legacyNotes || legacyNotes === notes) {
    return currentInvoice;
  }

  return findByNotes(legacyNotes);
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
      `La NRE ${invoice.controlNumber} está ANULADA. Use una nueva SEED_NRE_KEY para emitir otra Nota de Remisión.`
    );
  }

  if (!['GENERADO', 'RECHAZADO'].includes(status)) {
    throw new Error(`La NRE ${invoice.controlNumber} tiene un estado no permitido: ${status}.`);
  }

  return true;
};

const run = async () => {
  assertConfirmed(CONFIRMATION_VARIABLE);
  assertTestEnvironment();
  await initializeModelsAndDatabase();

  const nreConfig = getNreConfig();
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

  const notes = buildNotes({
    batchKey: config.batchKey,
    seedKey: nreConfig.seedKey,
    deliveryPurposeCode: nreConfig.deliveryPurposeCode
  });
  const legacyNotes = buildLegacyNotes({
    batchKey: config.batchKey,
    seedKey: nreConfig.seedKey
  });

  let invoice = await findExistingNre({
    companyId: company.id,
    notes,
    legacyNotes
  });

  if (!invoice) {
    invoice = await createSeedInvoice({
      user,
      roleCodes,
      documentTypeCode: DOCUMENT_TYPE_CODE,
      customerId: customers[CUSTOMER_KEYS.CARLOS].id,
      issuedAtDate,
      notes,
      ordinal: 1,
      items: buildItems(nreConfig)
    });

    console.log(`✓ NRE creada: ${invoice.controlNumber}`);
  } else {
    console.log(`✓ NRE existente localizada: ${invoice.controlNumber} (${invoice.status})`);
  }

  if (!assertSafeToTransmit(invoice)) {
    console.log(`✓ La NRE ya fue aceptada por Hacienda. Sello: ${invoice.receptionSeal || 'no registrado'}`);
    return;
  }

  console.log(`→ Firmando y transmitiendo NRE ${invoice.controlNumber} a Hacienda TEST...`);

  const transmittedInvoice = await invoicesService.transmitInvoiceToHaciendaReal({
    id: invoice.id,
    user: {
      id: user.id,
      roles: roleCodes
    }
  });

  if (String(transmittedInvoice.status).toUpperCase() !== 'ACEPTADO') {
    throw new Error(
      `La NRE ${transmittedInvoice.controlNumber} terminó en estado ${transmittedInvoice.status}, no ACEPTADO.`
    );
  }

  console.log('\n✓ Nota de Remisión Electrónica aceptada por Hacienda TEST.');
  console.log(`  Número de control: ${transmittedInvoice.controlNumber}`);
  console.log(`  Código de generación: ${transmittedInvoice.generationCode}`);
  console.log(`  Sello de recepción: ${transmittedInvoice.receptionSeal}`);
};

run()
  .catch((error) => {
    console.error('\n✗ Error en seed NRE:', error.message);
    if (error.mhResponse) {
      console.error('Respuesta de Hacienda:', JSON.stringify(error.mhResponse));
    }
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
