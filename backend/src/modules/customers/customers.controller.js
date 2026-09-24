const customersService = require('./customers.service');

const listCustomers = async (req, res, next) => {
  try {
    const result = await customersService.listCustomers({
      query: req.query,
      user: req.user
    });
    const customers = Array.isArray(result) ? result : result.rows;

    res.set('Cache-Control', 'no-store');

    res.status(200).json({
      ok: true,
      customers,
      ...(!Array.isArray(result) && result.pagination ? { pagination: result.pagination } : {})
    });
  } catch (error) {
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const customer = await customersService.getCustomerById(req.params.id, {
      user: req.user
    });

    res.status(200).json({
      ok: true,
      customer
    });
  } catch (error) {
    next(error);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const customer = await customersService.createCustomer({
      data: req.body,
      user: req.user
    });

    res.status(201).json({
      ok: true,
      message: 'Cliente registrado correctamente',
      customer
    });
  } catch (error) {
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const customer = await customersService.updateCustomer(req.params.id, {
      data: req.body,
      user: req.user
    });

    res.status(200).json({
      ok: true,
      message: 'Cliente actualizado correctamente',
      customer
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer
};