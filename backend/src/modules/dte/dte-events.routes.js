const express = require('express');

const dteEventsController = require('./dte-events.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteEventsController.listEvents
);

router.post(
  '/return',
  authenticate,
  authorize('INVOICES_CREATE'),
  dteEventsController.createReturnEvent
);

router.post(
  '/special-operations',
  authenticate,
  authorize('INVOICES_CREATE'),
  dteEventsController.createSpecialOperationsEvent
);

router.post(
  '/contingency',
  authenticate,
  authorize('INVOICES_CREATE'),
  dteEventsController.createContingencyEvent
);

router.get(
  '/:id/json',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteEventsController.getEventJsonById
);

router.patch(
  '/:id/transmit',
  authenticate,
  authorize('INVOICES_TRANSMIT'),
  dteEventsController.transmitEvent
);

router.get(
  '/:id',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteEventsController.getEventById
);

module.exports = router;
