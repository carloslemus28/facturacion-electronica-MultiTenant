const express = require('express');

const inventoryController = require('./inventory.controller');
const { authenticate, authorize, requireInventoryAccess } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);
router.use(authorize('PRODUCTS_MANAGE'));
router.use(requireInventoryAccess);

router.get('/summary', inventoryController.getSummary);
router.get('/movements', inventoryController.listMovements);
router.post('/product-entry', inventoryController.registerProductEntry);
router.post('/product-entries', inventoryController.registerProductEntries);
router.get('/kardex.xlsx', inventoryController.downloadKardex);

module.exports = router;
