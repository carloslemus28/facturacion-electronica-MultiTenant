const companiesService = require('./companies.service');

const listCompanies = async (req, res, next) => {
  try {
    const companies = await companiesService.listCompanies({
      includeInactive: req.query.includeInactive === 'true'
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, companies });
  } catch (error) {
    next(error);
  }
};

const getActiveCompany = async (req, res, next) => {
  try {
    const company = await companiesService.getActiveCompany(req.user?.company?.id || null);

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, company });
  } catch (error) {
    next(error);
  }
};

const createCompany = async (req, res, next) => {
  try {
    const company = await companiesService.createCompany(req.body);

    res.status(201).json({
      ok: true,
      message: 'Contribuyente registrado correctamente',
      company
    });
  } catch (error) {
    next(error);
  }
};

const updateCompany = async (req, res, next) => {
  try {
    const { id } = req.params;
    const company = await companiesService.updateCompany(id, req.body);

    res.status(200).json({
      ok: true,
      message: 'Contribuyente actualizado correctamente',
      company
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCompanies,
  getActiveCompany,
  createCompany,
  updateCompany
};
