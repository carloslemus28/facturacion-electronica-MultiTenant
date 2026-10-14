'use strict';

const { getFiscalDateTimeParts, parseFiscalDateOnly } = require('../../utils/fiscal-dates');
const normalize = value => String(value || '').trim().toUpperCase();
const digits = value => String(value || '').replace(/\D/g, '');
const fail = message => { const error = new Error(message); error.statusCode = 400; throw error; };

const decodeSignedJson = value => {
  try {
    const parts = String(value || '').trim().split('.');
    if (parts.length !== 3 || !parts[1]) throw new Error('JWS incompleto');
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return fail('No se pudo leer el JSON firmado original. Recupere el DTE original antes de anularlo.');
  }
};

const validateOriginalDocument = (invoice, original) => {
  const identification = original?.identificacion;
  if (!identification?.fecEmi) fail('El JSON original no contiene la fecha oficial de emisión del DTE.');
  parseFiscalDateOnly(identification.fecEmi, 'La fecha oficial de emisión');
  for (const [expected, actual] of [[invoice.generationCode, identification.codigoGeneracion],
    [invoice.controlNumber, identification.numeroControl], [invoice.documentTypeCode, identification.tipoDte]]) {
    if (expected && normalize(expected) !== normalize(actual)) {
      fail('El JSON original no corresponde a este DTE. Revise su código de generación, número de control y tipo.');
    }
  }
  if (invoice.company?.nit && digits(invoice.company.nit) !== digits(original.emisor?.nit || original.emisor?.numDocumento)) {
    fail('El JSON original pertenece a otro emisor. No se puede utilizar para anular este DTE.');
  }
  return original;
};

const getStoredOriginalDocument = (invoice, suppliedOriginal = null) => {
  if (suppliedOriginal) {
    const signed = suppliedOriginal.firmaElectronica;
    return validateOriginalDocument(invoice, signed
      ? { ...suppliedOriginal, ...decodeSignedJson(signed) } : suppliedOriginal);
  }
  if (invoice.signedJws) return validateOriginalDocument(invoice, decodeSignedJson(invoice.signedJws));
  let metadata = invoice.mhResponseJson;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = null; }
  }
  const payload = metadata?.payload?.documento;
  if (typeof payload === 'string' && payload.includes('.')) {
    return validateOriginalDocument(invoice, decodeSignedJson(payload));
  }
  return null;
};

const getOriginalDocumentContext = (invoice, suppliedOriginal = null) => {
  const original = getStoredOriginalDocument(invoice, suppliedOriginal);
  const registered = getFiscalDateTimeParts(invoice.issuedAt);
  const identification = original?.identificacion || {};
  const date = identification.fecEmi || registered?.date;
  if (!date) fail('No se encontró una fecha válida de emisión para el DTE a anular.');
  return { original, date, time: identification.horEmi || registered?.time,
    documentTypeCode: String(identification.tipoDte || invoice.documentTypeCode || invoice.eventTypeCode || '').padStart(2, '0'),
    generationCode: identification.codigoGeneracion || invoice.generationCode,
    controlNumber: identification.numeroControl || invoice.controlNumber };
};

module.exports = { decodeSignedJson, validateOriginalDocument, getStoredOriginalDocument, getOriginalDocumentContext };
