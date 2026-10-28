'use strict';
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schemaFiles = {"01": "fe-f-v2", "03": "fe-ccf-v4", "04": "fe-nr-v4", "05": "fe-nc-v4", "06": "fe-nd-v4", "07": "fe-cr-v2", "08": "fe-cl-v2", "09": "fe-dcl-v2", "11": "fe-fex-v3", "14": "fe-fse-v2", "15": "fe-cd-v2", "17": "fe-eop-v1", "18": "fe-eret-v1", "19": "contingencia-schema-v4", "invalidation": "invalidacion-schema-v3"};
const documentNames = {"01": "Factura de Consumidor Final", "03": "Comprobante de Crédito Fiscal", "04": "Nota de Remisión", "05": "Nota de Crédito", "06": "Nota de Débito", "07": "Comprobante de Retención", "08": "Comprobante de Liquidación", "09": "Documento Contable de Liquidación", "11": "Factura de Exportación", "14": "Factura de Sujeto Excluido", "15": "Comprobante de Donación"};
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
require('./decimal-multiple').installDecimalMultiple(ajv);
addFormats(ajv);
const schemas = Object.fromEntries(Object.entries(schemaFiles).map(([code, file]) => [code, require(`./schemas/${file}.json`)]));
const validators = Object.fromEntries(Object.entries(schemas).map(([code, schema]) => [code, ajv.compile(schema)]));
const invalidationV2Validator = ajv.compile(require('./schemas/invalidacion-compat-v2.json'));
const inferType = data => data?.motivo?.tipoAnulacion !== undefined ? 'invalidation'
  : data?.detalleDTE ? '19' : String(data?.identificacion?.tipoDte || data?.identificacion?.tipoEvento || '');
const validateFiscalJson = (data, type = inferType(data)) => {
  const validator = type === 'invalidation' && data?.identificacion?.version === 2
    ? invalidationV2Validator : validators[type];
  if (!validator) { const e = new Error('Tipo de documento o evento no soportado'); e.statusCode = 400; throw e; }
  if (!validator(data)) {
    const issues = validator.errors.map(e => ({ campo: e.instancePath || '/', regla: e.keyword, detalle: e.message, parametros: e.params }));
    const error = new Error('Revise los datos del documento: ' + issues.slice(0, 8).map(e => `${e.campo}: ${e.detalle}${e.parametros.missingProperty ? ' (' + e.parametros.missingProperty + ')' : ''}`).join('; '));
    error.statusCode = 422; error.validationErrors = issues; throw error;
  }
  return data;
};
const getVersion = code => schemas[code]?.properties?.identificacion?.properties?.version?.const
  ?? schemas[code]?.properties?.identificacion?.properties?.version?.enum?.[0];
const assertEnabled = (company, code) => {
  if (code === '19' || code === 'invalidation') return;
  let values = ['17', '18'].includes(String(code)) ? company?.allowedEventTypes : company?.allowedDocumentTypes;
  if (typeof values === 'string') { try { values = JSON.parse(values); } catch { values = []; } }
  if (!Array.isArray(values) || !values.map(String).includes(String(code))) {
    const e = new Error('Este documento o evento está deshabilitado para el contribuyente. El administrador programador debe habilitarlo.'); e.statusCode = 403; throw e;
  }
};
module.exports = { schemas, schemaFiles, documentNames, validateFiscalJson, getVersion, inferType, assertEnabled };
