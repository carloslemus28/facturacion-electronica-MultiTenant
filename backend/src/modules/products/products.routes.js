const express = require('express');

const productsController = require('./products.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('PRODUCTS_MANAGE'),
  productsController.listProducts
);

router.get(
  '/:id',
  authenticate,
  authorize('PRODUCTS_MANAGE'),
  productsController.getProductById
);

router.post(
  '/',
  authenticate,
  authorize('PRODUCTS_MANAGE'),
  productsController.createProduct
);

router.put(
  '/:id',
  authenticate,
  authorize('PRODUCTS_MANAGE'),
  productsController.updateProduct
);

module.exports = router;