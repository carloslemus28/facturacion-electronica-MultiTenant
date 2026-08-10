'use strict';

const {
  TARGETS,
  CUSTOMER_KEYS,
  runSingleDocumentSeed,
  closeDatabase
} = require('./lib/seed-dte-dinamico.helpers');

runSingleDocumentSeed({
  confirmationVariable: 'CONFIRM_SEED_FCF',
  documentTypeCode: '01',
  label: 'Facturas de Consumidor Final',
  target: TARGETS['01'],
  customerKey: CUSTOMER_KEYS.CONSUMER_FINAL
})
  .catch((error) => {
    console.error('\n✗ Error en seed FCF:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
