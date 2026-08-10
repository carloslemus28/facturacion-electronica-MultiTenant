const productsService = require('./products.service');

const listProducts = async (req, res, next) => {
  try {
    const products = await productsService.listProducts({
      query: req.query,
      user: req.user
    });

    res.set('Cache-Control', 'no-store');

    res.status(200).json({
      ok: true,
      products
    });
  } catch (error) {
    next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const product = await productsService.getProductById(req.params.id, {
      user: req.user
    });

    res.status(200).json({
      ok: true,
      product
    });
  } catch (error) {
    next(error);
  }
};

const createProduct = async (req, res, next) => {
  try {
    const product = await productsService.createProduct({
      data: req.body,
      user: req.user
    });

    res.status(201).json({
      ok: true,
      message: 'Producto o servicio registrado correctamente',
      product
    });
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const product = await productsService.updateProduct(req.params.id, {
      data: req.body,
      user: req.user
    });

    res.status(200).json({
      ok: true,
      message: 'Producto o servicio actualizado correctamente',
      product
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct
};