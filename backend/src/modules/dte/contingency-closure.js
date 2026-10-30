'use strict';
const HOUR = 60 * 60 * 1000;
const fail = (message, statusCode = 400) => { const error = new Error(message); error.statusCode = statusCode; throw error; };
const normalizeReturnIds = (value = []) => {
  if (!Array.isArray(value) || value.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    fail('returnEventIds debe contener identificadores válidos de retornos');
  }
  return [...new Set(value.map(Number))];
};
const validatePeriod = (start, end, now = new Date()) => {
  const from = new Date(start).getTime(), to = new Date(end).getTime(), current = new Date(now).getTime();
  if (!start || !end || !Number.isFinite(from) || !Number.isFinite(to) || from > to || to > current) {
    fail('Indique el inicio y fin reales de la contingencia; no pueden estar en el futuro ni en orden inverso');
  }
  if (current - to > 24 * HOUR) fail('Han transcurrido más de 24 horas desde el fin de la contingencia. Revise el caso con Hacienda; no cambie las fechas para eludir el plazo');
};
const validateReturn = (event, user, start, end) => {
  if (Number(event.companyId) !== Number(user.company.id) || Number(event.pointOfSaleId) !== Number(user.pointOfSale.id)) {
    fail('El retorno debe pertenecer al contribuyente y punto de venta seleccionados', 403);
  }
  if (String(event.eventTypeCode) !== '18' || event.status !== 'GENERADO' || event.signedJws || event.signedAt || event.transmittedAt || event.receptionSeal || Number(event.tipoOperacion) === 2) {
    fail('Solo se pueden incorporar retornos generados, sin firma, sin transmisión previa y sin otra contingencia');
  }
  const issued = new Date(event.issuedAt).getTime();
  if (!Number.isFinite(issued) || issued < new Date(start).getTime() || issued > new Date(end).getTime()) {
    fail('La fecha de emisión del retorno debe estar dentro del período de contingencia');
  }
};
const validateRelease = (contingency, now = new Date()) => {
  if (!contingency || contingency.status !== 'ACEPTADO' || !contingency.receptionSeal) {
    fail('Primero transmita el evento de contingencia y obtenga su sello de recepción');
  }
  const accepted = new Date(contingency.acceptedAt).getTime();
  if (!contingency.acceptedAt || !Number.isFinite(accepted) || new Date(now).getTime() < accepted || new Date(now).getTime() - accepted > 72 * HOUR) {
    fail('No se puede verificar el plazo de 72 horas desde la aceptación de la contingencia o ya venció. Revise el caso con Hacienda');
  }
};
module.exports = { normalizeReturnIds, validatePeriod, validateReturn, validateRelease };
