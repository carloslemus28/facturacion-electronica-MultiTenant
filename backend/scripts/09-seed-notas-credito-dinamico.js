'use strict';

const {
  Op,
  Invoice,
  InvoiceItem,
  TARGETS,
  CREDIT_NOTE_DOCUMENT_TYPE,
  CUSTOMER_KEYS,
  initializeModelsAndDatabase,
  closeDatabase,
  assertConfirmed,
  assertTestEnvironment,
  getTodayInAppTimezone,
  resolveOperationalContext,
  ensureCompanyDocumentTypes,
  ensureSeedCustomers,
  buildCreditNoteItems,
  createSeedInvoice,
  processSeedInvoices,
  getSeedMarker,
  getSeedNote,
  getSeedInvoicesByMarker
} = require('./lib/seed-dte-dinamico.helpers');

const SOURCE_DOCUMENT_TYPE = '03';
const TARGET = TARGETS[CREDIT_NOTE_DOCUMENT_TYPE];
const REQUIRED_ACCEPTED_CCF = TARGETS[SOURCE_DOCUMENT_TYPE];

const run = async () => {
  assertConfirmed('CONFIRM_SEED_NC');
  assertTestEnvironment();
  await initializeModelsAndDatabase();

  const issuedAtDate = getTodayInAppTimezone();
  const context = await resolveOperationalContext();
  const { config, user, company, establishment, roleCodes } = context;

  await ensureCompanyDocumentTypes({
    company,
    documentTypes: [CREDIT_NOTE_DOCUMENT_TYPE]
  });

  const { [CUSTOMER_KEYS.CARLOS]: carlos } = await ensureSeedCustomers({
    establishmentId: establishment.id,
    only: CUSTOMER_KEYS.CARLOS,
    config
  });

  const sourceMarker = getSeedMarker({
    batchKey: config.batchKey,
    documentTypeCode: SOURCE_DOCUMENT_TYPE
  });

  const acceptedCcf = await Invoice.findAll({
    where: {
      companyId: company.id,
      customerId: carlos.id,
      documentTypeCode: SOURCE_DOCUMENT_TYPE,
      status: 'ACEPTADO',
      receptionSeal: {
        [Op.ne]: null
      },
      notes: {
        [Op.like]: `${sourceMarker}-%`
      }
    },
    include: [
      {
        model: InvoiceItem,
        as: 'items'
      }
    ],
    order: [['id', 'ASC']]
  });

  if (acceptedCcf.length < REQUIRED_ACCEPTED_CCF) {
    throw new Error(
      `Se requieren los ${REQUIRED_ACCEPTED_CCF} CCF de la batch ${config.batchKey} aceptados por Hacienda. Actualmente hay ${acceptedCcf.length}.`
    );
  }

  const sourceCcf = acceptedCcf.slice(0, TARGET);
  const sourceIds = sourceCcf.map((invoice) => Number(invoice.id));

  const existingCreditNotes = await Invoice.findAll({
    where: {
      companyId: company.id,
      documentTypeCode: CREDIT_NOTE_DOCUMENT_TYPE,
      relatedInvoiceId: {
        [Op.in]: sourceIds
      },
      status: {
        [Op.ne]: 'ANULADO'
      }
    },
    attributes: ['id', 'relatedInvoiceId', 'status', 'controlNumber', 'notes']
  });

  const sourceIdsWithCreditNote = new Set(
    existingCreditNotes.map((invoice) => Number(invoice.relatedInvoiceId))
  );

  const pendingCcf = sourceCcf.filter(
    (invoice) => !sourceIdsWithCreditNote.has(Number(invoice.id))
  );

  if (existingCreditNotes.length > TARGET) {
    throw new Error(
      `Se encontraron ${existingCreditNotes.length} NC activas para los primeros ${TARGET} CCF; corrija la duplicidad antes de continuar.`
    );
  }

  if (pendingCcf.length === 0) {
    console.log(`No se creó nada: los primeros ${TARGET} CCF aceptados ya poseen Nota de Crédito activa.`);
    return;
  }

  console.log(`Empresa: ${company.legalName} | NIT: ${company.nit}`);
  console.log(`Batch de origen: ${config.batchKey}`);
  console.log(`CCF aceptados encontrados: ${acceptedCcf.length}/${REQUIRED_ACCEPTED_CCF}`);
  console.log(`Generando ${pendingCcf.length} Notas de Crédito por reversión total.`);

  for (let index = 0; index < pendingCcf.length; index += 1) {
    const sourceInvoice = pendingCcf[index];
    const ordinal = sourceCcf.findIndex((invoice) => Number(invoice.id) === Number(sourceInvoice.id)) + 1;

    await createSeedInvoice({
      user,
      roleCodes,
      documentTypeCode: CREDIT_NOTE_DOCUMENT_TYPE,
      relatedInvoice: sourceInvoice,
      issuedAtDate,
      notes: getSeedNote({
        batchKey: config.batchKey,
        documentTypeCode: CREDIT_NOTE_DOCUMENT_TYPE,
        ordinal
      }),
      ordinal,
      items: buildCreditNoteItems(
        [...(sourceInvoice.items || [])].sort((a, b) => Number(a.id) - Number(b.id))
      )
    });

    const progress = index + 1;
    if (progress % 10 === 0 || progress === pendingCcf.length) {
      console.log(`  Notas de Crédito: ${progress}/${pendingCcf.length}`);
    }
  }

  const finalCreditNotes = await Invoice.findAll({
    where: {
      companyId: company.id,
      documentTypeCode: CREDIT_NOTE_DOCUMENT_TYPE,
      relatedInvoiceId: {
        [Op.in]: sourceIds
      },
      status: {
        [Op.ne]: 'ANULADO'
      }
    },
    attributes: ['id', 'relatedInvoiceId']
  });

  if (finalCreditNotes.length !== TARGET) {
    throw new Error(
      `Verificación final falló. Se esperaban ${TARGET} NC activas relacionadas con los CCF seleccionados y se encontraron ${finalCreditNotes.length}.`
    );
  }

  if (!config.autoTransmit) {
    console.log(`✓ Seed NC completada: ${finalCreditNotes.length}/${TARGET}.`);
    console.log('  Las NC quedan en GENERADO, sin firma ni transmisión.');
    return;
  }

  const creditNotesForProcessing = await getSeedInvoicesByMarker({
    companyId: company.id,
    documentTypeCode: CREDIT_NOTE_DOCUMENT_TYPE,
    batchKey: config.batchKey
  });

  const processingSummary = await processSeedInvoices({
    invoices: creditNotesForProcessing,
    user,
    roleCodes,
    config,
    customerKey: CUSTOMER_KEYS.CARLOS,
    label: 'Notas de Crédito'
  });

  if (processingSummary.accepted !== TARGET) {
    throw new Error(
      `La transmisión automática de Notas de Crédito no completó todos los DTE. Aceptados: ${processingSummary.accepted}/${TARGET}.`
    );
  }

  console.log(
    `✓ Seed NC completada: ${finalCreditNotes.length}/${TARGET} | aceptadas: ${processingSummary.accepted}/${TARGET} | correos enviados: ${processingSummary.emailed}${config.autoEmail ? ` | correos ya existentes: ${processingSummary.emailsSkipped}` : ''}.`
  );
};

run()
  .catch((error) => {
    console.error('\n✗ Error en seed de Notas de Crédito:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
