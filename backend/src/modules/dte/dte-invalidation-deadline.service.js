'use strict';

const { FISCAL_TIME_ZONE, DAY_MS, parseFiscalDateTime, getFiscalDateTimeParts,
  parseFiscalDateOnly, addCalendarMonths, endOfFiscalDay } = require('../../utils/fiscal-dates');
const { getOriginalDocumentContext } = require('./dte-original-document.service');
const LONG_TYPES = new Set(['01', '11', '14']);
const NEXT_MONTH_TYPES = new Set(['03', '04', '05', '06', '07', '08', '09', '15', '17', '18']);
// Anexo V: FE/FEX de actividades farmacéuticas con plazo de dos años.
const PHARMACEUTICAL_ACTIVITIES = new Set(['21001', '21008', '46482', '46484', '46491', '47721']);
const FIXED_NON_WORKING_DAYS = new Set(['05-01', '05-10', '06-17', '09-15', '11-02']);
const fail = message => { const error = new Error(message); error.statusCode = 400; throw error; };

const easterSunday = year => {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return parseFiscalDateOnly(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
};

const getExtraNonWorkingDates = options => {
  const configured = options?.extraNonWorkingDates ?? process.env.MH_INVALIDATION_EXTRA_NON_WORKING_DATES ?? '';
  const values = Array.isArray(configured) ? configured : String(configured).split(/[\s,;]+/);
  const dates = new Set();
  for (const value of values.filter(Boolean)) {
    const key = String(value).trim();
    parseFiscalDateOnly(key, 'La fecha de asueto adicional de Hacienda');
    dates.add(key);
  }
  return dates;
};

const isBusinessDay = (date, extraDates = new Set()) => {
  const key = getFiscalDateTimeParts(date)?.date;
  if (!key) return false;
  const midnight = parseFiscalDateOnly(key);
  if ([0, 6].includes(midnight.getUTCDay()) || extraDates.has(key)) return false;
  const monthDay = key.slice(5);
  if (FIXED_NON_WORKING_DAYS.has(monthDay)) return false;
  // Vacaciones públicas: Navidad, fiestas agostinas y lunes Santo a lunes de Pascua.
  if (monthDay >= '12-24' || monthDay <= '01-02' || (monthDay >= '08-01' && monthDay <= '08-06')) return false;
  const easter = easterSunday(Number(key.slice(0, 4))).getTime();
  return midnight.getTime() < easter - 6 * DAY_MS || midnight.getTime() > easter + DAY_MS;
};

const getTenthBusinessDayOfNextMonth = (date, options = {}) => {
  const baseKey = getFiscalDateTimeParts(date)?.date;
  if (!baseKey) fail('No se pudo interpretar la fecha del Sello de Recepción.');
  const nextMonth = addCalendarMonths(`${baseKey.slice(0, 7)}-01`, 1);
  const extraDates = getExtraNonWorkingDates(options);
  let cursor = parseFiscalDateOnly(nextMonth), count = 0;
  for (let day = 0; day < 62; day += 1) {
    if (isBusinessDay(cursor, extraDates)) count += 1;
    if (count === 10) return getFiscalDateTimeParts(cursor).date;
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return fail('Revise el calendario de días inhábiles configurado para Hacienda.');
};

const readProcessingDate = (node, invoice, depth = 0, seen = new Set()) => {
  if (typeof node === 'string') {
    try { node = JSON.parse(node); } catch { return null; }
  }
  if (!node || typeof node !== 'object' || depth > 5 || seen.has(node)) return null;
  seen.add(node);
  const normalize = value => String(value || '').trim().toUpperCase();
  if (node.codigoGeneracion && normalize(node.codigoGeneracion) !== normalize(invoice.generationCode)) return null;
  if (node.selloRecibido && invoice.receptionSeal && normalize(node.selloRecibido) !== normalize(invoice.receptionSeal)) return null;
  if (node.estado && !['PROCESADO', 'ACEPTADO', 'RECIBIDO', 'VALIDADO'].includes(normalize(node.estado))) return null;
  for (const value of [node.fhProcesamiento, node.fechaProcesamiento]) {
    const date = parseFiscalDateTime(value);
    if (date) return date;
  }
  for (const key of ['response', 'body', 'data', 'respuestaHacienda', 'mhResponse', 'resultado', 'datos']) {
    const date = readProcessingDate(node[key], invoice, depth + 1, seen);
    if (date) return date;
  }
  return null;
};

const getReceptionDate = (invoice, options = {}) => {
  const context = getOriginalDocumentContext(invoice, options.originalDte);
  const date = readProcessingDate(invoice.mhResponseJson, invoice)
    || readProcessingDate(context.original, invoice) || parseFiscalDateTime(invoice.acceptedAt);
  if (!date) fail('No se conoce la fecha del Sello de Recepción de este DTE. Sincronice su estado con Hacienda antes de anularlo; la emisión no sustituye la recepción.');
  return date;
};const getInvalidationRule = (invoice, options = {}) => {
  const context = getOriginalDocumentContext(invoice, options.originalDte);
  const code = context.documentTypeCode;
  if (LONG_TYPES.has(code)) {
    const activity = String(context.original?.emisor?.codActividad || '');
    const pharmaceutical = ['01', '11'].includes(code) && PHARMACEUTICAL_ACTIVITIES.has(activity);
    return { ...context, months: pharmaceutical ? 24 : 3,
      rule: pharmaceutical ? 'DOS_ANIOS_FARMACEUTICOS' : 'TRES_MESES' };
  }
  if (NEXT_MONTH_TYPES.has(code)) return { ...context, months: null, rule: 'DIEZ_HABILES_MES_SIGUIENTE' };
  return fail(`No se encontró una regla de invalidación aplicable al tipo ${code}.`);
};

const getInvalidationDeadline = (invoice, options = {}) => {
  const rule = getInvalidationRule(invoice, options);
  const receptionDate = getReceptionDate(invoice, options);
  const deadlineKey = rule.months ? addCalendarMonths(getFiscalDateTimeParts(receptionDate).date, rule.months)
    : getTenthBusinessDayOfNextMonth(receptionDate, options);
  return endOfFiscalDay(deadlineKey);
};

const validateInvalidationDeadline = (invoice, now = new Date(), options = {}) => {
  const instant = parseFiscalDateTime(now);
  if (!instant) fail('No se pudo interpretar la fecha actual para validar el plazo de anulación.');
  const deadlineAt = getInvalidationDeadline(invoice, options);
  if (instant.getTime() > deadlineAt.getTime()) {
    const error = new Error(`Este DTE ya no puede ser invalidado porque venció el plazo permitido. Fecha límite en El Salvador: ${deadlineAt.toLocaleString('es-SV', { timeZone: FISCAL_TIME_ZONE })}`);
    error.statusCode = 400; error.deadlineAt = deadlineAt; throw error;
  }
  return { canInvalidate: true, deadlineAt, rule: getInvalidationRule(invoice, options).rule };
};

module.exports = { getInvalidationDeadline, validateInvalidationDeadline, getReceptionDate,
  getInvalidationRule, getTenthBusinessDayOfNextMonth, isBusinessDay };
