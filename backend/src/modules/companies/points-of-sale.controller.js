const pointsOfSaleService = require('./points-of-sale.service');

const getTenantId = (req) => req.user?.company?.id;

const getAllPointsOfSale = async (req, res, next) => {
  try {
    const pointsOfSale = await pointsOfSaleService.getAllPointsOfSale({
      ...req.query,
      companyId: getTenantId(req)
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, pointsOfSale });
  } catch (error) {
    next(error);
  }
};

const createPointOfSale = async (req, res, next) => {
  try {
    const pointOfSale = await pointsOfSaleService.createPointOfSale({
      ...req.body,
      companyId: getTenantId(req)
    });

    res.status(201).json({
      ok: true,
      message: 'Punto de venta registrado correctamente',
      pointOfSale
    });
  } catch (error) {
    next(error);
  }
};

const updatePointOfSale = async (req, res, next) => {
  try {
    const pointOfSale = await pointsOfSaleService.updatePointOfSale(
      req.params.id,
      { ...req.body, companyId: getTenantId(req) },
      getTenantId(req)
    );

    res.status(200).json({
      ok: true,
      message: 'Punto de venta actualizado correctamente',
      pointOfSale
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllPointsOfSale, createPointOfSale, updatePointOfSale };
