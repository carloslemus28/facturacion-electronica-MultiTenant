const dteJsonService = require('./dte-json.service');

const sanitizeFileName = (value) => {
  return String(value || 'documento')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_');
};

const buildJsonFileName = ({ json, invoiceId, type }) => {
  const isInvalidation = type === 'invalidation';

  if (isInvalidation) {
    const controlNumber = json?.documento?.numeroControl || invoiceId;
    return sanitizeFileName(`ANULACION-${controlNumber}.json`);
  }

  const controlNumber = json?.identificacion?.numeroControl || invoiceId;

  /*
    El numeroControl ya trae el prefijo DTE.
    Ejemplo: DTE-03-M001P001-000000000000001
    Por eso no se antepone otro DTE.
  */
  return sanitizeFileName(`${controlNumber}.json`);
};

const getDteJsonByInvoiceId = async (req, res, next) => {
  try {
    const json = await dteJsonService.getDteJsonByInvoiceId({
      id: req.params.id,
      user: req.user,
      type: req.query.type || 'document'
    });

    res.set('Cache-Control', 'no-store');

    res.status(200).json({
      ok: true,
      json
    });
  } catch (error) {
    next(error);
  }
};

const downloadDteJsonByInvoiceId = async (req, res, next) => {
  try {
    const type = req.query.type || 'document';

    const json = await dteJsonService.getDteJsonByInvoiceId({
      id: req.params.id,
      user: req.user,
      type
    });

    const fileName = buildJsonFileName({
      json,
      invoiceId: req.params.id,
      type
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');

    res.status(200).send(JSON.stringify(json, null, 2));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDteJsonByInvoiceId,
  downloadDteJsonByInvoiceId
};