const express = require('express');

const emailsController = require('./emails.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/invoices/:id/logs',
  authenticate,
  authorize('INVOICES_VIEW'),
  emailsController.getInvoiceEmailLogs
);

router.post(
  '/invoices/:id/send',
  authenticate,
  authorize('INVOICES_VIEW'),
  emailsController.sendInvoiceEmail
);

module.exports = router;