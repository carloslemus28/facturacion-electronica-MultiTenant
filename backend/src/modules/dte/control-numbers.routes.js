const express = require('express');

const controlNumbersController = require('./control-numbers.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/document-types',
  authenticate,
  controlNumbersController.getDocumentTypes
);

router.get(
  '/',
  authenticate,
  authorize('COMPANIES_MANAGE'),
  controlNumbersController.listControlNumbers
);

router.post(
  '/preview',
  authenticate,
  authorize('INVOICES_CREATE'),
  controlNumbersController.previewNextControlNumber
);

router.post(
  '/generate',
  authenticate,
  authorize('INVOICES_CREATE'),
  controlNumbersController.generateNextControlNumber
);

router.post(
  '/last-sequence',
  authenticate,
  authorize('COMPANIES_MANAGE'),
  controlNumbersController.setLastControlSequence
);

router.post(
  '/generate-from-session',
  authenticate,
  authorize('INVOICES_CREATE'),
  controlNumbersController.generateFromSession
);

module.exports = router;