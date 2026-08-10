const establishmentsService = require('./establishments.service');

const getTenantId = (req) => req.user?.company?.id;

const listEstablishments = async (req, res, next) => {
  try {
    const establishments = await establishmentsService.listEstablishments({
      ...req.query,
      companyId: getTenantId(req)
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, establishments });
  } catch (error) {
    next(error);
  }
};

const getEstablishmentById = async (req, res, next) => {
  try {
    const establishment = await establishmentsService.getEstablishmentById(
      req.params.id,
      getTenantId(req)
    );

    res.status(200).json({ ok: true, establishment });
  } catch (error) {
    next(error);
  }
};

const createEstablishment = async (req, res, next) => {
  try {
    const establishment = await establishmentsService.createEstablishment({
      ...req.body,
      companyId: getTenantId(req)
    });

    res.status(201).json({
      ok: true,
      message: 'Establecimiento registrado correctamente',
      establishment
    });
  } catch (error) {
    next(error);
  }
};

const updateEstablishment = async (req, res, next) => {
  try {
    const establishment = await establishmentsService.updateEstablishment(
      req.params.id,
      { ...req.body, companyId: getTenantId(req) },
      getTenantId(req)
    );

    res.status(200).json({
      ok: true,
      message: 'Establecimiento actualizado correctamente',
      establishment
    });
  } catch (error) {
    next(error);
  }
};

const getNextEstablishmentCode = async (req, res, next) => {
  try {
    const code = await establishmentsService.getNextEstablishmentCode({
      companyId: getTenantId(req),
      establishmentType: req.query.establishmentType
    });

    res.status(200).json({ ok: true, code });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listEstablishments,
  getEstablishmentById,
  createEstablishment,
  updateEstablishment,
  getNextEstablishmentCode
};
