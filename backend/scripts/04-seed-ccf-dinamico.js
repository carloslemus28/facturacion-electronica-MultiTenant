'use strict';

const {
  TARGETS,
  CUSTOMER_KEYS,
  runSingleDocumentSeed,
  closeDatabase
} = require('./lib/seed-dte-dinamico.helpers');

runSingleDocumentSeed({
  confirmationVariable: 'CONFIRM_SEED_CCF',
  documentTypeCode: '03',
  label: 'Comprobantes de Crédito Fiscal',
  target: TARGETS['03'],
  customerKey: CUSTOMER_KEYS.CARLOS
})
  .catch((error) => {
    console.error('\n✗ Error en seed CCF:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
