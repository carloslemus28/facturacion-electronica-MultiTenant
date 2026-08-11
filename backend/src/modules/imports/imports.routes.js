const express = require('express');

const importsController = require('./imports.controller');
const { authenticate, authorize, requireAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate, requireAdmin, authorize('COMPANIES_MANAGE'));

router.get('/summary', importsController.getSummary);
router.post('/customers', importsController.importCustomers);
router.post('/products', importsController.importProducts);
router.post('/documents', importsController.importDocuments);

module.exports = router;
