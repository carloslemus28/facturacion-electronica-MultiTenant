const SALES_DOCUMENT_TYPES = ['01', '03', '04', '05', '06', '11'];
const SALES_EVENT_TYPES = ['18'];
const filterTypes = (values, allowed) => {
  if (typeof values === 'string') { try { values = JSON.parse(values); } catch { values = []; } }
  return Array.isArray(values) ? values.map(String).filter(code => allowed.includes(code)) : [];
};
const assertSalesType = code => {
  if (!SALES_DOCUMENT_TYPES.includes(String(code))) {
    const error = new Error('Este documento requiere operaciones que no están disponibles en el módulo de ventas');
    error.statusCode = 403; throw error;
  }
};
module.exports = { SALES_DOCUMENT_TYPES, SALES_EVENT_TYPES, filterTypes, assertSalesType };
