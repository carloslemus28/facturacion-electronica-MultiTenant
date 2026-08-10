const express = require('express');

const reportsController = require('./reports.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/dte/preview',
  authenticate,
  authorize('REPORTS_VIEW'),
  reportsController.previewDteReport
);

router.get(
  '/dte/excel',
  authenticate,
  authorize('REPORTS_VIEW'),
  reportsController.exportDteExcel
);

module.exports = router;