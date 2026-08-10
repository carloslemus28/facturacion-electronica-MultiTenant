const { Op } = require('sequelize');

const Company = require('./company.model');
const Establishment = require('./establishment.model');
const PointOfSale = require('./point-of-sale.model');

const VALID_ESTABLISHMENT_TYPES = ['CASA_MATRIZ', 'SUCURSAL', 'BODEGA', 'PREDIO'];

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
};

const getPrefixByType = (type) => {
  if (type === 'SUCURSAL') return 'S';
  if (type === 'BODEGA') return 'B';
  if (type === 'PREDIO') return 'P';
  return 'M';
};

const validateEstablishmentData = (data) => {
  if (!data.companyId) {
    const error = new Error('La empresa emisora es obligatoria');
    error.statusCode = 400;
    throw error;
  }

  if (!VALID_ESTABLISHMENT_TYPES.includes(data.establishmentType)) {
    const error = new Error('Tipo de establecimiento no válido');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.establishmentCode)) {
    const error = new Error('El código de establecimiento es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (String(data.establishmentCode).trim().length !== 4) {
    const error = new Error('El código de establecimiento debe tener 4 caracteres. Ejemplo: M001 o S001');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.name)) {
    const error = new Error('El nombre del establecimiento es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.departmentCode) || !normalizeText(data.departmentName)) {
    const error = new Error('Debe seleccionar el departamento del establecimiento');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.districtName) || !normalizeText(data.municipalityCode) || !normalizeText(data.municipalityName)) {
    const error = new Error('Debe seleccionar distrito y municipio del establecimiento');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.addressComplement)) {
    const error = new Error('La dirección complementaria del establecimiento es obligatoria');
    error.statusCode = 400;
    throw error;
  }
};

const buildEstablishmentData = (data, current = null) => {
  const establishmentType = data.establishmentType || current?.establishmentType || 'CASA_MATRIZ';

  const establishmentData = {
    companyId: data.companyId ?? current?.companyId,
    establishmentType,
    establishmentCode: normalizeText(data.establishmentCode ?? current?.establishmentCode)?.toUpperCase(),
    name: normalizeText(data.name ?? current?.name),
    departmentCode: normalizeText(data.departmentCode ?? current?.departmentCode),
    departmentName: normalizeText(data.departmentName ?? current?.departmentName),
    districtName: normalizeText(data.districtName ?? current?.districtName),
    municipalityCode: normalizeText(data.municipalityCode ?? current?.municipalityCode),
    municipalityName: normalizeText(data.municipalityName ?? current?.municipalityName),
    addressComplement: normalizeText(data.addressComplement ?? current?.addressComplement),
    isActive: data.isActive ?? current?.isActive ?? true
  };

  validateEstablishmentData(establishmentData);

  return establishmentData;
};

const getNextEstablishmentCode = async ({ companyId, establishmentType }) => {
  const type = establishmentType || 'SUCURSAL';
  const prefix = getPrefixByType(type);

  const establishments = await Establishment.findAll({
    where: {
      companyId,
      establishmentCode: {
        [Op.like]: `${prefix}%`
      }
    },
    attributes: ['establishmentCode'],
    order: [['establishmentCode', 'ASC']]
  });

  const usedNumbers = establishments
    .map((item) => {
      const match = String(item.establishmentCode || '').match(new RegExp(`^${prefix}(\\d{3})$`));
      return match ? Number(match[1]) : 0;
    })
    .filter((number) => number > 0);

  const nextNumber = usedNumbers.length > 0
    ? Math.max(...usedNumbers) + 1
    : 1;

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
};

const listEstablishments = async ({ companyId = '', isActive = '' } = {}) => {
  const where = {};

  if (companyId) {
    where.companyId = companyId;
  }

  if (isActive !== '') {
    where.isActive = isActive === 'true';
  }

  const establishments = await Establishment.findAll({
    where,
    include: [
      {
        model: Company,
        as: 'company'
      },
      {
        model: PointOfSale,
        as: 'pointsOfSale'
      }
    ],
    order: [
      ['companyId', 'ASC'],
      ['establishmentCode', 'ASC']
    ]
  });

  return establishments;
};

const getEstablishmentById = async (id, companyId = null) => {
  const establishment = await Establishment.findOne({
    where: {
      id,
      ...(companyId ? { companyId } : {})
    },
    include: [
      {
        model: Company,
        as: 'company'
      },
      {
        model: PointOfSale,
        as: 'pointsOfSale'
      }
    ]
  });

  if (!establishment) {
    const error = new Error('Establecimiento no encontrado');
    error.statusCode = 404;
    throw error;
  }

  return establishment;
};

const createEstablishment = async (data) => {
  const company = await Company.findByPk(data.companyId);

  if (!company) {
    const error = new Error('Empresa emisora no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const establishmentData = buildEstablishmentData(data);

  const existing = await Establishment.findOne({
    where: {
      companyId: establishmentData.companyId,
      establishmentCode: establishmentData.establishmentCode
    }
  });

  if (existing) {
    const error = new Error('Ya existe un establecimiento con ese código para esta empresa');
    error.statusCode = 409;
    throw error;
  }

  const establishment = await Establishment.create(establishmentData);

  return getEstablishmentById(establishment.id, establishment.companyId);
};

const updateEstablishment = async (id, data, companyId = null) => {
  const establishment = await getEstablishmentById(id, companyId);

  const establishmentData = buildEstablishmentData(data, establishment);

  const existing = await Establishment.findOne({
    where: {
      companyId: establishmentData.companyId,
      establishmentCode: establishmentData.establishmentCode,
      id: {
        [Op.ne]: establishment.id
      }
    }
  });

  if (existing) {
    const error = new Error('Ya existe otro establecimiento con ese código para esta empresa');
    error.statusCode = 409;
    throw error;
  }

  await establishment.update(establishmentData);

  return getEstablishmentById(establishment.id, establishment.companyId);
};

module.exports = {
  listEstablishments,
  getEstablishmentById,
  createEstablishment,
  updateEstablishment,
  getNextEstablishmentCode
};