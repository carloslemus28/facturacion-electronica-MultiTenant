const express = require('express');

const invoicesController = require('./invoices.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('INVOICES_VIEW'),
  invoicesController.listInvoices
);

router.get(
  '/dashboard-summary',
  authenticate,
  authorize('INVOICES_VIEW'),
  invoicesController.getDashboardSummary
);

router.get(
  '/credit-note/available-documents',
  authenticate,
  authorize('INVOICES_CREATE'),
  invoicesController.listAvailableDocumentsForCreditNote
);

router.post(
  '/generate',
  authenticate,
  authorize('INVOICES_CREATE'),
  invoicesController.createGeneratedInvoice
);

router.put(
  '/:id',
  authenticate,
  authorize('INVOICES_CREATE'),
  invoicesController.updateGeneratedInvoice
);

router.patch(
  '/:id/transmit',
  authenticate,
  authorize('INVOICES_TRANSMIT'),
  invoicesController.transmitReal
);

router.patch(
  '/:id/invalidate',
  authenticate,
  authorize('DTE_INVALIDATE'),
  invoicesController.invalidateReal
);

router.get(
  '/:id',
  authenticate,
  authorize('INVOICES_VIEW'),
  invoicesController.getInvoiceById
);

module.exports = router;