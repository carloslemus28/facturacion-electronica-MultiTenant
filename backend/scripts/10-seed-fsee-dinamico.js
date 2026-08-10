'use strict';

const {
  TARGETS,
  CUSTOMER_KEYS,
  runSingleDocumentSeed,
  closeDatabase
} = require('./lib/seed-dte-dinamico.helpers');

runSingleDocumentSeed({
  confirmationVariable: 'CONFIRM_SEED_FSEE',
  documentTypeCode: '14',
  label: 'Facturas de Sujeto Excluido',
  target: TARGETS['14'],
  customerKey: CUSTOMER_KEYS.EXCLUDED_SUBJECT
})
  .catch((error) => {
    console.error('\n✗ Error en seed FSEE:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
