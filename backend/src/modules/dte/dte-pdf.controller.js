const dtePdfService = require('./dte-pdf.service');

const getDtePdfByInvoiceId = async (req, res, next) => {
  try {
    const result = await dtePdfService.getDtePdfByInvoiceId({
      id: req.params.id,
      user: req.user,
      type: req.query.type || 'document'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${result.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');

    res.status(200).send(result.buffer);
  } catch (error) {
    next(error);
  }
};

const downloadDtePdfByInvoiceId = async (req, res, next) => {
  try {
    const result = await dtePdfService.getDtePdfByInvoiceId({
      id: req.params.id,
      user: req.user,
      type: req.query.type || 'document'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');

    res.status(200).send(result.buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDtePdfByInvoiceId,
  downloadDtePdfByInvoiceId
};