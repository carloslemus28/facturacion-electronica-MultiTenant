const reportsService = require('./reports.service');

const getScope = (req) => {
  const isAdmin = Array.isArray(req.user?.roles) && req.user.roles.includes('ADMIN');
  return {
    companyId: req.user?.company?.id,
    establishmentId: isAdmin ? null : req.user?.pointOfSale?.establishmentId
  };
};

const exportDteExcel = async (req, res, next) => {
  try {
    const { documentTypeCode, startDate, endDate, status } = req.query;
    const fileName = reportsService.buildReportFileName({ documentTypeCode, startDate, endDate });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');

    await reportsService.streamExcelReport({
      outputStream: res,
      ...getScope(req),
      documentTypeCode,
      startDate,
      endDate,
      status
    });
  } catch (error) {
    if (res.headersSent) {
      console.error('Error durante streaming de reporte Excel:', error);
      return res.destroy(error);
    }
    return next(error);
  }
};

const previewDteReport = async (req, res, next) => {
  try {
    const { documentTypeCode, startDate, endDate, status, limit } = req.query;
    const result = await reportsService.listInvoicesForReportPreview({
      ...getScope(req), documentTypeCode, startDate, endDate, status, limit
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, ...result });
  } catch (error) { next(error); }
};

module.exports = { exportDteExcel, previewDteReport };
