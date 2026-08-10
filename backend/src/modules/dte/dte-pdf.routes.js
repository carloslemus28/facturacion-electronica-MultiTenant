const express = require('express');

const dtePdfController = require('./dte-pdf.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/invoices/:id',
  authenticate,
  authorize('INVOICES_VIEW'),
  dtePdfController.getDtePdfByInvoiceId
);

router.get(
  '/invoices/:id/download',
  authenticate,
  authorize('INVOICES_VIEW'),
  dtePdfController.downloadDtePdfByInvoiceId
);

module.exports = router;