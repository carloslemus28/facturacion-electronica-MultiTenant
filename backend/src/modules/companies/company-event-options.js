'use strict';
const normalizeAllowedEventTypes = value => {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = value.split(','); }
  }
  if (!Array.isArray(value) || value.some(code => !['17', '18'].includes(String(code).trim()))) {
    const error = new Error('Eventos permitidos: 17 (Operaciones especiales) y 18 (Retorno).');
    error.statusCode = 400;
    throw error;
  }
  return [...new Set(value.map(code => String(code).trim()))];
};
module.exports = { normalizeAllowedEventTypes };
