'use strict';
const getInvalidationEventVersion = () => {
  const raw = String(process.env.MH_INVALIDACION_EVENT_VERSION || '2').trim();
  if (!['2', '3'].includes(raw)) {
    const error = new Error('MH_INVALIDACION_EVENT_VERSION debe ser 2 o 3; revise la configuraciÃ³n del backend.');
    error.statusCode = 500;
    throw error;
  }
  return Number(raw);
};
module.exports = { getInvalidationEventVersion };
