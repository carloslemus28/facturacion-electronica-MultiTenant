const express = require('express');

const companiesController = require('./companies.controller');
const { authenticate, authorize, requireAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get(
  '/',
  authorize('COMPANIES_MANAGE'),
  companiesController.listCompanies
);

router.get(
  '/active',
  authorize('COMPANIES_MANAGE'),
  companiesController.getActiveCompany
);

router.post(
  '/',
  authorize('COMPANIES_MANAGE'),
  companiesController.createCompany
);

router.put(
  '/:id',
  authorize('COMPANIES_MANAGE'),
  companiesController.updateCompany
);

module.exports = router;
