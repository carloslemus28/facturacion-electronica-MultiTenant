const express = require('express');

const customersController = require('./customers.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('CUSTOMERS_MANAGE'),
  customersController.listCustomers
);

router.get(
  '/:id',
  authenticate,
  authorize('CUSTOMERS_MANAGE'),
  customersController.getCustomerById
);

router.post(
  '/',
  authenticate,
  authorize('CUSTOMERS_MANAGE'),
  customersController.createCustomer
);

router.put(
  '/:id',
  authenticate,
  authorize('CUSTOMERS_MANAGE'),
  customersController.updateCustomer
);

module.exports = router;