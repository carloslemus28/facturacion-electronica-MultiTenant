const { Op } = require('sequelize');

const Company = require('./company.model');
const Establishment = require('./establishment.model');
const PointOfSale = require('./point-of-sale.model');

const validatePointOfSaleCode = (code) => {
  const regex = /^P\d{3}$/;
  return regex.test(code);
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
};

const getPointOfSaleById = async (id, companyId = null) => {
  const point = await PointOfSale.findOne({
    where: { id, ...(companyId ? { companyId } : {}) },
    include: [
      {
        model: Company,
        as: 'company',
        attributes: ['id', 'nit', 'legalName', 'commercialName']
      },
      {
        model: Establishment,
        as: 'establishment'
      }
    ]
  });

  if (!point) {
    const error = new Error('Punto de venta no encontrado');
    error.statusCode = 404;
    throw error;
  }

  return point;
};

const getAllPointsOfSale = async ({ companyId = '', establishmentId = '', isActive = '' } = {}) => {
  const where = {};

  if (companyId) {
    where.companyId = companyId;
  }

  if (establishmentId) {
    where.establishmentId = establishmentId;
  }

  if (isActive !== '') {
    where.isActive = isActive === 'true';
  }

  const points = await PointOfSale.findAll({
    where,
    include: [
      {
        model: Company,
        as: 'company',
        attributes: ['id', 'nit', 'legalName', 'commercialName']
      },
      {
        model: Establishment,
        as: 'establishment'
      }
    ],
    order: [
      ['establishmentId', 'ASC'],
      ['code', 'ASC']
    ]
  });

  return points;
};

const validateCompanyAndEstablishment = async ({ companyId, establishmentId }) => {
  const company = await Company.findByPk(companyId);

  if (!company) {
    const error = new Error('Empresa emisora no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const establishment = await Establishment.findOne({
    where: { id: establishmentId, companyId }
  });

  if (!establishment) {
    const error = new Error('Establecimiento o sucursal no encontrada');
    error.statusCode = 404;
    throw error;
  }

  if (Number(establishment.companyId) !== Number(companyId)) {
    const error = new Error('El establecimiento no pertenece a la empresa emisora indicada');
    error.statusCode = 400;
    throw error;
  }

  return {
    company,
    establishment
  };
};

const createPointOfSale = async (data) => {
  const code = normalizeText(data.code)?.toUpperCase();

  if (!validatePointOfSaleCode(code)) {
    const error = new Error('El código de punto de venta debe tener formato P001, P002, P003, etc.');
    error.statusCode = 400;
    throw error;
  }

  if (!data.establishmentId) {
    const error = new Error('Debe seleccionar el establecimiento o sucursal del punto de venta');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.name)) {
    const error = new Error('El nombre del punto de venta es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  await validateCompanyAndEstablishment({
    companyId: data.companyId,
    establishmentId: data.establishmentId
  });

  const existingPoint = await PointOfSale.findOne({
    where: {
      establishmentId: data.establishmentId,
      code
    }
  });

  if (existingPoint) {
    const error = new Error('Ya existe un punto de venta con ese código en este establecimiento');
    error.statusCode = 409;
    throw error;
  }

  const point = await PointOfSale.create({
    companyId: data.companyId,
    establishmentId: data.establishmentId,
    code,
    name: normalizeText(data.name),
    description: normalizeText(data.description),
    isActive: data.isActive ?? true
  });

  return getPointOfSaleById(point.id, point.companyId);
};

const updatePointOfSale = async (id, data, companyId = null) => {
  const point = await getPointOfSaleById(id, companyId);

  const nextCompanyId = data.companyId ?? point.companyId;
  const nextEstablishmentId = data.establishmentId ?? point.establishmentId;
  const nextCode = normalizeText(data.code ?? point.code)?.toUpperCase();

  if (!validatePointOfSaleCode(nextCode)) {
    const error = new Error('El código de punto de venta debe tener formato P001, P002, P003, etc.');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.name ?? point.name)) {
    const error = new Error('El nombre del punto de venta es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  await validateCompanyAndEstablishment({
    companyId: nextCompanyId,
    establishmentId: nextEstablishmentId
  });

  const existingPoint = await PointOfSale.findOne({
    where: {
      establishmentId: nextEstablishmentId,
      code: nextCode,
      id: {
        [Op.ne]: point.id
      }
    }
  });

  if (existingPoint) {
    const error = new Error('Ya existe otro punto de venta con ese código en este establecimiento');
    error.statusCode = 409;
    throw error;
  }

  await point.update({
    companyId: nextCompanyId,
    establishmentId: nextEstablishmentId,
    code: nextCode,
    name: normalizeText(data.name ?? point.name),
    description: normalizeText(data.description ?? point.description),
    isActive: data.isActive ?? point.isActive
  });

  return getPointOfSaleById(point.id, point.companyId);
};

module.exports = {
  getAllPointsOfSale,
  createPointOfSale,
  updatePointOfSale,
  getPointOfSaleById
};