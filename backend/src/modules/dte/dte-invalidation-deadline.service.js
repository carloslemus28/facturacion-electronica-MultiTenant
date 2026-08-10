const LONG_INVALIDATION_DOCUMENT_TYPES = ['01', '11', '14'];

const endOfDay = (date) => {
  const next = new Date(date);

  next.setHours(23, 59, 59, 999);

  return next;
};

const addCalendarMonths = (date, months) => {
  const next = new Date(date);
  const originalDay = next.getDate();

  next.setMonth(next.getMonth() + months);

  if (next.getDate() < originalDay) {
    next.setDate(0);
  }

  return next;
};

const getReceptionDate = (invoice) => {
  return invoice.acceptedAt || invoice.transmittedAt || invoice.issuedAt;
};

const getInvalidationDeadline = (invoice) => {
  const receptionDate = getReceptionDate(invoice);

  if (!receptionDate) {
    const error = new Error('No se encontró fecha de recepción o emisión para validar plazo de anulación');
    error.statusCode = 400;
    throw error;
  }

  const baseDate = new Date(receptionDate);

  if (LONG_INVALIDATION_DOCUMENT_TYPES.includes(String(invoice.documentTypeCode))) {
    return endOfDay(addCalendarMonths(baseDate, 3));
  }

  const nextDay = new Date(baseDate);
  nextDay.setDate(nextDay.getDate() + 1);

  return endOfDay(nextDay);
};

const validateInvalidationDeadline = (invoice, now = new Date()) => {
  const deadlineAt = getInvalidationDeadline(invoice);
  const canInvalidate = now.getTime() <= deadlineAt.getTime();

  if (!canInvalidate) {
    const error = new Error(
      `Este DTE ya no puede ser invalidado porque venció el plazo permitido. Fecha límite: ${deadlineAt.toLocaleString('es-SV')}`
    );

    error.statusCode = 400;
    error.deadlineAt = deadlineAt;
    throw error;
  }

  return {
    canInvalidate: true,
    deadlineAt
  };
};

module.exports = {
  getInvalidationDeadline,
  validateInvalidationDeadline
};