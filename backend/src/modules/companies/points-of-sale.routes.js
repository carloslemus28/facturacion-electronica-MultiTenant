const express = require('express');

const pointsOfSaleController = require('./points-of-sale.controller');
const { authenticate, authorize, requireAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate, requireAdmin, authorize('COMPANIES_MANAGE'));
router.get('/', pointsOfSaleController.getAllPointsOfSale);
router.post('/', pointsOfSaleController.createPointOfSale);
router.put('/:id', pointsOfSaleController.updatePointOfSale);

module.exports = router;
