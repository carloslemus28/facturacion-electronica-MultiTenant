const { Op } = require('sequelize');
const { parsePhoneNumberFromString, getCountryCallingCode } = require('libphonenumber-js');

const Customer = require('./customer.model');
const User = require('../users/user.model');
const Role = require('../users/role.model');
const Company = require('../companies/company.model');
const Establishment = require('../companies/establishment.model');
const PointOfSale = require('../companies/point-of-sale.model');

const VALID_DOCUMENT_TYPES = [
  'SIN_DOCUMENTO',
  'DUI',
  'NIT',
  'PASAPORTE',
  'CARNET_RESIDENTE',
  'OTRO'
];

const normalizeEmpty = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
};

const normalizeDigits = (value) => {
  if (value === undefined || value === null) return null;

  const digits = String(value).replace(/\D/g, '');

  return digits || null;
};

const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isAdminUser = (user) => {
  return Array.isArray(user?.roles) && user.roles.includes('ADMIN');
};

const resolveUserContext = async (user) => {
  const userId = user?.id || user?.sub;

  if (!userId) {
    const error = new Error('Usuario no autenticado');
    error.statusCode = 401;
    throw error;
  }

  const dbUser = await User.findByPk(userId, {
    include: [
      {
        model: Role,
        as: 'roles'
      },
      {
        model: PointOfSale,
        as: 'pointOfSale',
        include: [
          {
            model: Company,
            as: 'company'
          },
          {
            model: Establishment,
            as: 'establishment'
          }
        ]
      }
    ]
  });

  if (!dbUser || !dbUser.isActive) {
    const error = new Error('Usuario no disponible');
    error.statusCode = 401;
    throw error;
  }

  const roles = Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : dbUser.roles.map((role) => role.code);

  let company = dbUser.pointOfSale?.company || null;

  if (roles.includes('ADMIN') && user?.company?.id) {
    company = await Company.findOne({
      where: { id: user.company.id, isActive: true }
    });
  }

  if (!company && roles.includes('ADMIN')) {
    company = await Company.findOne({
      where: { isActive: true },
      order: [['id', 'ASC']]
    });
  }

  return {
    id: dbUser.id,
    username: dbUser.username,
    roles,
    company: company
      ? {
          id: company.id,
          legalName: company.legalName
        }
      : null,
    pointOfSale: dbUser.pointOfSale
      ? {
          id: dbUser.pointOfSale.id,
          companyId: dbUser.pointOfSale.companyId,
          establishmentId: dbUser.pointOfSale.establishmentId,
          code: dbUser.pointOfSale.code,
          name: dbUser.pointOfSale.name,
          establishment: dbUser.pointOfSale.establishment
            ? {
                id: dbUser.pointOfSale.establishment.id,
                establishmentCode: dbUser.pointOfSale.establishment.establishmentCode,
                name: dbUser.pointOfSale.establishment.name
              }
            : null
        }
      : null
  };
};

const getMainEstablishmentId = async (companyId) => {
  const establishment = await Establishment.findOne({
    where: {
      companyId,
      establishmentCode: 'M001',
      isActive: true
    },
    order: [['id', 'ASC']]
  });

  if (!establishment) {
    const error = new Error('No se encontró la Casa Matriz M001 para la empresa activa');
    error.statusCode = 400;
    throw error;
  }

  return establishment.id;
};

const getWritableEstablishmentId = async ({ user, requestedEstablishmentId = null }) => {
  if (!user?.company) {
    const error = new Error('El usuario no tiene empresa emisora asignada');
    error.statusCode = 400;
    throw error;
  }

  if (isAdminUser(user)) {
    if (requestedEstablishmentId) {
      const establishment = await Establishment.findOne({
        where: { id: requestedEstablishmentId, companyId: user.company.id }
      });

      if (!establishment || Number(establishment.companyId) !== Number(user.company.id)) {
        const error = new Error('El establecimiento seleccionado no pertenece a la empresa activa');
        error.statusCode = 400;
        throw error;
      }

      return establishment.id;
    }

    return getMainEstablishmentId(user.company.id);
  }

  if (!user.pointOfSale?.establishmentId) {
    const error = new Error('El usuario no tiene establecimiento o sucursal asignada');
    error.statusCode = 403;
    throw error;
  }

  return user.pointOfSale.establishmentId;
};

const buildVisibilityWhere = async ({ user, requestedEstablishmentId = '' }) => {
  const where = { companyId: user.company.id };

  if (isAdminUser(user)) {
    if (requestedEstablishmentId) {
      where.establishmentId = Number(requestedEstablishmentId);
    }

    return where;
  }

  if (!user.pointOfSale?.establishmentId) {
    const error = new Error('El usuario no tiene establecimiento o sucursal asignada');
    error.statusCode = 403;
    throw error;
  }

  where.establishmentId = user.pointOfSale.establishmentId;

  return where;
};

const inferCustomerType = (data) => {
  const documentType = data.documentType || 'SIN_DOCUMENTO';
  const documentNumber = normalizeEmpty(data.documentNumber);
  const nrc = normalizeEmpty(data.nrc);
  const economicActivityCode = normalizeEmpty(data.economicActivityCode);
  const economicActivityName = normalizeEmpty(data.economicActivityName);
  const countryCode = normalizeEmpty(data.countryCode);

  if (
    documentType === 'PASAPORTE' ||
    documentType === 'CARNET_RESIDENTE' ||
    (countryCode && countryCode !== 'SV')
  ) {
    return 'EXTRANJERO';
  }

  if (
    ['NIT', 'DUI'].includes(documentType) &&
    documentNumber &&
    nrc &&
    economicActivityCode &&
    economicActivityName
  ) {
    return 'CONTRIBUYENTE';
  }

  return 'CONSUMIDOR_FINAL';
};

const validatePhoneData = ({ phoneCountryCode, phoneNationalNumber }) => {
  if (!phoneCountryCode || !phoneNationalNumber) {
    const error = new Error('Debe seleccionar país telefónico e ingresar el número de teléfono');
    error.statusCode = 400;
    throw error;
  }

  let dialCode = '';

  try {
    dialCode = getCountryCallingCode(phoneCountryCode);
  } catch (error) {
    const customError = new Error('Código de país telefónico no válido');
    customError.statusCode = 400;
    throw customError;
  }

  const phoneNumber = parsePhoneNumberFromString(phoneNationalNumber, phoneCountryCode);

  if (!phoneNumber || !phoneNumber.isValid()) {
    const error = new Error('El número de teléfono no corresponde al formato del país seleccionado');
    error.statusCode = 400;
    throw error;
  }

  return {
    phoneCountryCode,
    phoneDialCode: dialCode,
    phoneNationalNumber: phoneNumber.nationalNumber,
    phone: phoneNumber.number
  };
};

const validateCustomerData = (data) => {
  const documentType = data.documentType || 'SIN_DOCUMENTO';
  const documentNumber = normalizeEmpty(data.documentNumber);
  const nrc = normalizeEmpty(data.nrc);

  if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
    const error = new Error('Tipo de documento no válido');
    error.statusCode = 400;
    throw error;
  }

  if (!data.name || !data.name.trim()) {
    const error = new Error('El nombre o razón social es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (!data.email || !data.email.trim()) {
    const error = new Error('El correo electrónico del cliente es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (!validateEmail(data.email.trim())) {
    const error = new Error('Ingrese un correo electrónico válido');
    error.statusCode = 400;
    throw error;
  }

  if (data.secondaryEmail && !validateEmail(String(data.secondaryEmail).trim())) {
    const error = new Error('Ingrese un correo electrónico secundario válido');
    error.statusCode = 400;
    throw error;
  }

  if (!data.phoneNationalNumber || !data.phoneNationalNumber.trim()) {
    const error = new Error('El teléfono del cliente es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (documentType !== 'SIN_DOCUMENTO' && !documentNumber) {
    const error = new Error('Ingrese el número de documento del cliente');
    error.statusCode = 400;
    throw error;
  }

  if (documentType === 'SIN_DOCUMENTO' && documentNumber) {
    const error = new Error('No debe ingresar número de documento si el tipo es SIN_DOCUMENTO');
    error.statusCode = 400;
    throw error;
  }

  if (documentType === 'NIT') {
    const nitDigits = normalizeDigits(documentNumber);

    if (!nitDigits || nitDigits.length !== 14) {
      const error = new Error('El NIT debe contener exactamente 14 dígitos');
      error.statusCode = 400;
      throw error;
    }
  }

  if (documentType === 'DUI') {
    const duiDigits = normalizeDigits(documentNumber);

    if (!duiDigits || duiDigits.length !== 9) {
      const error = new Error('El DUI debe contener exactamente 9 dígitos');
      error.statusCode = 400;
      throw error;
    }
  }

  if (nrc) {
  const nrcDigits = normalizeDigits(nrc);

    if (!nrcDigits) {
      const error = new Error('El NRC debe contener solo números');
      error.statusCode = 400;
      throw error;
    }

    if (nrcDigits.length > 8) {
      const error = new Error('El NRC no debe exceder 8 dígitos');
      error.statusCode = 400;
      throw error;
    }
  }
};

const listCustomers = async ({ query = {}, user }) => {
  const currentUser = await resolveUserContext(user);
  const { q = '', customerType = '', isActive = '', establishmentId = '' } = query;

  const where = await buildVisibilityWhere({
    user: currentUser,
    requestedEstablishmentId: establishmentId
  });

  if (q) {
    where[Op.or] = [
      { name: { [Op.like]: `%${q}%` } },
      { commercialName: { [Op.like]: `%${q}%` } },
      { documentNumber: { [Op.like]: `%${q}%` } },
      { nrc: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
      { secondaryEmail: { [Op.like]: `%${q}%` } },
      { phone: { [Op.like]: `%${q}%` } },
      { phoneNationalNumber: { [Op.like]: `%${q}%` } },
      { economicActivityName: { [Op.like]: `%${q}%` } },
      { secondaryEconomicActivityName: { [Op.like]: `%${q}%` } },
      { tertiaryEconomicActivityName: { [Op.like]: `%${q}%` } }
    ];
  }

  if (customerType) {
    where.customerType = customerType;
  }

  if (isActive !== '') {
    where.isActive = isActive === 'true';
  }

  const customers = await Customer.findAll({
    where,
    include: [
      {
        model: Establishment,
        as: 'establishment'
      }
    ],
    order: [['name', 'ASC']]
  });

  return customers;
};

const getCustomerById = async (id, { user } = {}) => {
  const currentUser = await resolveUserContext(user);

  const customer = await Customer.findOne({
    where: { id, companyId: currentUser.company.id },
    include: [
      {
        model: Establishment,
        as: 'establishment'
      }
    ]
  });

  if (!customer) {
    const error = new Error('Cliente no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (!isAdminUser(currentUser) && Number(customer.establishmentId) !== Number(currentUser.pointOfSale?.establishmentId)) {
    const error = new Error('No tiene permiso para consultar clientes de otra sucursal');
    error.statusCode = 403;
    throw error;
  }

  return customer;
};

const validateDuplicateDocument = async ({
  companyId,
  establishmentId,
  documentType,
  documentNumber,
  excludeId = null
}) => {
  if (!documentNumber) return;

  const where = {
    companyId,
    establishmentId,
    documentType,
    documentNumber
  };

  if (excludeId) {
    where.id = {
      [Op.ne]: excludeId
    };
  }

  const existingCustomer = await Customer.findOne({ where });

  if (existingCustomer) {
    const error = new Error('Ya existe un cliente con ese tipo y número de documento en este establecimiento');
    error.statusCode = 409;
    throw error;
  }
};

const createCustomer = async ({ data, user }) => {
  const currentUser = await resolveUserContext(user);

  const establishmentId = await getWritableEstablishmentId({
    user: currentUser,
    requestedEstablishmentId: data.establishmentId
  });

  const documentType = data.documentType || 'SIN_DOCUMENTO';

  const documentNumber = documentType === 'SIN_DOCUMENTO'
    ? null
    : ['NIT', 'DUI'].includes(documentType)
      ? normalizeDigits(data.documentNumber)
      : normalizeText(data.documentNumber);

  const nrc = normalizeDigits(data.nrc);

  const phoneData = validatePhoneData({
    phoneCountryCode: normalizeText(data.phoneCountryCode || 'SV'),
    phoneNationalNumber: normalizeText(data.phoneNationalNumber || data.phone)
  });

  const normalizedData = {
    ...data,
    establishmentId,
    documentType,
    documentNumber,
    nrc,
    name: normalizeText(data.name),
    email: normalizeText(data.email),
    secondaryEmail: normalizeText(data.secondaryEmail),
    phone: phoneData.phone,
    phoneCountryCode: phoneData.phoneCountryCode,
    phoneDialCode: phoneData.phoneDialCode,
    phoneNationalNumber: phoneData.phoneNationalNumber,
    commercialName: normalizeText(data.commercialName),
    economicActivityCode: normalizeEmpty(data.economicActivityCode),
    economicActivityName: normalizeText(data.economicActivityName),
    secondaryEconomicActivityCode: normalizeEmpty(data.secondaryEconomicActivityCode),
    secondaryEconomicActivityName: normalizeText(data.secondaryEconomicActivityName),
    tertiaryEconomicActivityCode: normalizeEmpty(data.tertiaryEconomicActivityCode),
    tertiaryEconomicActivityName: normalizeText(data.tertiaryEconomicActivityName),
    departmentCode: normalizeEmpty(data.departmentCode),
    departmentName: normalizeText(data.departmentName),
    districtName: normalizeText(data.districtName),
    municipalityCode: normalizeEmpty(data.municipalityCode),
    municipalityName: normalizeText(data.municipalityName),
    addressComplement: normalizeText(data.addressComplement),
    countryCode: normalizeEmpty(data.countryCode)
  };

  validateCustomerData(normalizedData);

  await validateDuplicateDocument({
    companyId: currentUser.company.id,
    establishmentId,
    documentType: normalizedData.documentType,
    documentNumber: normalizedData.documentNumber
  });

  const customer = await Customer.create({
    companyId: currentUser.company.id,
    establishmentId,
    customerType: inferCustomerType(normalizedData),
    documentType: normalizedData.documentType,
    documentNumber: normalizedData.documentNumber,
    nrc: normalizedData.nrc,
    name: normalizedData.name,
    commercialName: normalizedData.commercialName,
    economicActivityCode: normalizedData.economicActivityCode,
    economicActivityName: normalizedData.economicActivityName,
    secondaryEconomicActivityCode: normalizedData.secondaryEconomicActivityCode,
    secondaryEconomicActivityName: normalizedData.secondaryEconomicActivityName,
    tertiaryEconomicActivityCode: normalizedData.tertiaryEconomicActivityCode,
    tertiaryEconomicActivityName: normalizedData.tertiaryEconomicActivityName,
    email: normalizedData.email,
    secondaryEmail: normalizedData.secondaryEmail,
    phone: normalizedData.phone,
    phoneCountryCode: normalizedData.phoneCountryCode,
    phoneDialCode: normalizedData.phoneDialCode,
    phoneNationalNumber: normalizedData.phoneNationalNumber,
    departmentCode: normalizedData.departmentCode,
    departmentName: normalizedData.departmentName,
    districtName: normalizedData.districtName,
    municipalityCode: normalizedData.municipalityCode,
    municipalityName: normalizedData.municipalityName,
    addressComplement: normalizedData.addressComplement,
    countryCode: normalizedData.countryCode,
    isActive: data.isActive ?? true
  });

  return getCustomerById(customer.id, {
    user: currentUser
  });
};

const updateCustomer = async (id, { data, user }) => {
  const currentUser = await resolveUserContext(user);
  const customer = await getCustomerById(id, { user: currentUser });

  const establishmentId = await getWritableEstablishmentId({
    user: currentUser,
    requestedEstablishmentId: data.establishmentId ?? customer.establishmentId
  });

  if (!isAdminUser(currentUser) && Number(establishmentId) !== Number(customer.establishmentId)) {
    const error = new Error('No puede mover clientes entre establecimientos');
    error.statusCode = 403;
    throw error;
  }

  const documentType = data.documentType ?? customer.documentType ?? 'SIN_DOCUMENTO';

  const documentNumber = documentType === 'SIN_DOCUMENTO'
    ? null
    : ['NIT', 'DUI'].includes(documentType)
      ? normalizeDigits(data.documentNumber ?? customer.documentNumber)
      : normalizeText(data.documentNumber ?? customer.documentNumber);

  const nrc = normalizeDigits(data.nrc ?? customer.nrc);

  const phoneData = validatePhoneData({
    phoneCountryCode: normalizeText(data.phoneCountryCode ?? customer.phoneCountryCode ?? 'SV'),
    phoneNationalNumber: normalizeText(data.phoneNationalNumber ?? customer.phoneNationalNumber ?? customer.phone)
  });

  const nextData = {
    establishmentId,
    documentType,
    documentNumber,
    nrc,
    name: normalizeText(data.name ?? customer.name),
    commercialName: normalizeText(data.commercialName ?? customer.commercialName),
    economicActivityCode: normalizeEmpty(data.economicActivityCode ?? customer.economicActivityCode),
    economicActivityName: normalizeText(data.economicActivityName ?? customer.economicActivityName),
    secondaryEconomicActivityCode: normalizeEmpty(data.secondaryEconomicActivityCode ?? customer.secondaryEconomicActivityCode),
    secondaryEconomicActivityName: normalizeText(data.secondaryEconomicActivityName ?? customer.secondaryEconomicActivityName),
    tertiaryEconomicActivityCode: normalizeEmpty(data.tertiaryEconomicActivityCode ?? customer.tertiaryEconomicActivityCode),
    tertiaryEconomicActivityName: normalizeText(data.tertiaryEconomicActivityName ?? customer.tertiaryEconomicActivityName),
    email: normalizeText(data.email ?? customer.email),
    secondaryEmail: normalizeText(data.secondaryEmail ?? customer.secondaryEmail),
    phone: phoneData.phone,
    phoneCountryCode: phoneData.phoneCountryCode,
    phoneDialCode: phoneData.phoneDialCode,
    phoneNationalNumber: phoneData.phoneNationalNumber,
    departmentCode: normalizeEmpty(data.departmentCode ?? customer.departmentCode),
    departmentName: normalizeText(data.departmentName ?? customer.departmentName),
    districtName: normalizeText(data.districtName ?? customer.districtName),
    municipalityCode: normalizeEmpty(data.municipalityCode ?? customer.municipalityCode),
    municipalityName: normalizeText(data.municipalityName ?? customer.municipalityName),
    addressComplement: normalizeText(data.addressComplement ?? customer.addressComplement),
    countryCode: normalizeEmpty(data.countryCode ?? customer.countryCode),
    isActive: data.isActive ?? customer.isActive
  };

  validateCustomerData(nextData);

  await validateDuplicateDocument({
    companyId: currentUser.company.id,
    establishmentId: nextData.establishmentId,
    documentType: nextData.documentType,
    documentNumber: nextData.documentNumber,
    excludeId: customer.id
  });

  await customer.update({
    ...nextData,
    customerType: inferCustomerType(nextData)
  });

  return getCustomerById(customer.id, {
    user: currentUser
  });
};

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer
};