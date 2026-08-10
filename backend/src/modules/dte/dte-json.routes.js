const express = require('express');

const dteJsonController = require('./dte-json.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/invoices/:id',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteJsonController.getDteJsonByInvoiceId
);

router.get(
  '/invoices/:id/download',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteJsonController.downloadDteJsonByInvoiceId
);

module.exports = router;