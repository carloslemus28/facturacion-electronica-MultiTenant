const controlNumbersService = require('./control-numbers.service');

const getScope = (req, body = {}) => {
  const isAdmin = Array.isArray(req.user?.roles) && req.user.roles.includes('ADMIN');
  return {
    ...body,
    companyId: req.user?.company?.id,
    pointOfSaleId: isAdmin ? body.pointOfSaleId : req.user?.pointOfSale?.id
  };
};

const getDocumentTypes = async (req, res) => {
  res.status(200).json({ ok: true, documentTypes: controlNumbersService.getDocumentTypes() });
};

const listControlNumbers = async (req, res, next) => {
  try {
    const controlNumbers = await controlNumbersService.listControlNumbers({
      ...req.query,
      companyId: req.user?.company?.id
    });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, controlNumbers });
  } catch (error) { next(error); }
};

const previewNextControlNumber = async (req, res, next) => {
  try {
    const preview = await controlNumbersService.previewNextControlNumber(getScope(req, req.body));
    res.status(200).json({ ok: true, preview });
  } catch (error) { next(error); }
};

const generateNextControlNumber = async (req, res, next) => {
  try {
    const result = await controlNumbersService.generateNextControlNumber(getScope(req, req.body));
    res.status(201).json({ ok: true, message: 'Número de control generado correctamente', result });
  } catch (error) { next(error); }
};

const setLastControlSequence = async (req, res, next) => {
  try {
    const controlNumber = await controlNumbersService.setLastControlSequence(getScope(req, req.body));
    res.status(200).json({ ok: true, message: 'Último correlativo actualizado correctamente', controlNumber });
  } catch (error) { next(error); }
};

const generateFromSession = async (req, res, next) => {
  try {
    if (!req.user.company || !req.user.pointOfSale) {
      return res.status(400).json({ ok: false, message: 'El usuario no tiene empresa o punto de venta asignado' });
    }
    const result = await controlNumbersService.generateNextControlNumber({
      companyId: req.user.company.id,
      pointOfSaleId: req.user.pointOfSale.id,
      documentTypeCode: req.body.documentTypeCode,
      year: req.body.year
    });
    return res.status(201).json({ ok: true, message: 'Número de control generado correctamente', result });
  } catch (error) { return next(error); }
};

module.exports = {
  getDocumentTypes,
  listControlNumbers,
  previewNextControlNumber,
  generateNextControlNumber,
  setLastControlSequence,
  generateFromSession
};
