'use strict';

const FISCAL_TIME_ZONE = 'America/El_Salvador';
const OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = value => String(value).padStart(2, '0');

const parseFiscalDateTime = value => {
  if (value === null || value === undefined || value === '') return null;
  let normalized = value;
  if (typeof value === 'string') {
    normalized = value.trim();
    const mh = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})[:.](\d{2}))?$/.exec(normalized);
    if (mh) normalized = `${mh[3]}-${mh[2]}-${mh[1]}T${mh[4] || '00'}:${mh[5] || '00'}:${mh[6] || '00'}-06:00`;
    const day = /^(\d{4}-\d{2}-\d{2})(?:$|[ T])/.exec(normalized);
    if (day) {
      const check = new Date(`${day[1]}T00:00:00Z`);
      if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== day[1]) return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += 'T00:00:00-06:00';
    else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(normalized)) {
      normalized = `${normalized.replace(' ', 'T')}-06:00`;
    }
  }
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
};

const getFiscalDateTimeParts = value => {
  const date = parseFiscalDateTime(value);
  if (!date) return null;
  const clock = new Date(date.getTime() - OFFSET_MS);
  return { date: `${clock.getUTCFullYear()}-${pad(clock.getUTCMonth() + 1)}-${pad(clock.getUTCDate())}`,
    time: `${pad(clock.getUTCHours())}:${pad(clock.getUTCMinutes())}:${pad(clock.getUTCSeconds())}` };
};

const parseFiscalDateOnly = (value, label = 'La fecha') => {
  const text = String(value || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? parseFiscalDateTime(text) : null;
  if (!date) {
    const error = new Error(`${label} debe ser una fecha válida con formato AAAA-MM-DD`);
    error.statusCode = 400;
    throw error;
  }
  return date;
};

const addCalendarMonths = (dateKey, months) => {
  parseFiscalDateOnly(dateKey);
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
};

const endOfFiscalDay = dateKey => new Date(parseFiscalDateOnly(dateKey).getTime() + DAY_MS - 1);

module.exports = { FISCAL_TIME_ZONE, DAY_MS, parseFiscalDateTime, getFiscalDateTimeParts,
  parseFiscalDateOnly, addCalendarMonths, endOfFiscalDay };
