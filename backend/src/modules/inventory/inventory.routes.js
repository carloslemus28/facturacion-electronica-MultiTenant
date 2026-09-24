const express = require('express');

const inventoryController = require('./inventory.controller');
const { authenticate, authorize, requireAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);
router.use(authorize('PRODUCTS_MANAGE'));

router.get('/summary', inventoryController.getSummary);
router.get('/movements', inventoryController.listMovements);
router.post('/product-entry', inventoryController.registerProductEntry);
router.get('/kardex.xlsx', requireAdmin, inventoryController.downloadKardex);

module.exports = router;
