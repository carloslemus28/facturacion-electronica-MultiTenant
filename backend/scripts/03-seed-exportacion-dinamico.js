'use strict';

const {
  TARGETS,
  CUSTOMER_KEYS,
  runSingleDocumentSeed,
  closeDatabase
} = require('./lib/seed-dte-dinamico.helpers');

runSingleDocumentSeed({
  confirmationVariable: 'CONFIRM_SEED_EXPORTACION',
  documentTypeCode: '11',
  label: 'Facturas de Exportación',
  target: TARGETS['11'],
  customerKey: CUSTOMER_KEYS.CARLOS
})
  .catch((error) => {
    console.error('\n✗ Error en seed de exportación:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
