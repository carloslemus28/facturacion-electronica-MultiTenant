const { sequelize } = require('../../config/database');

const Company = require('./company.model');
const Establishment = require('./establishment.model');
const companyCredentialsService = require('./company-credentials.service');
const certificateDiagnosticsService = require('./certificate-diagnostics.service');

const LOGO_MAX_SIZE_MB = Number(process.env.LOGO_MAX_SIZE_MB || 2);
const LOGO_MAX_SIZE_BYTES = LOGO_MAX_SIZE_MB * 1024 * 1024;

const DEFAULT_ALLOWED_DOCUMENT_TYPES = ['01', '03'];
const VALID_DOCUMENT_TYPES = ['01', '03', '05', '11', '14'];
const VALID_ENVIRONMENTS = ['TEST', 'PRODUCTION'];

const cleanDigits = (value) => String(value || '').replace(/\D/g, '');

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

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'si', 'sí'].includes(value.toLowerCase());
  }

  return fallback;
};

const normalizeEnvironment = (value, fallback = 'TEST') => {
  const normalized = normalizeText(value);

  if (!normalized) return fallback;

  const upper = normalized.toUpperCase();

  return VALID_ENVIRONMENTS.includes(upper) ? upper : fallback;
};

const normalizeAllowedDocumentTypes = (allowedDocumentTypes) => {
  let source = allowedDocumentTypes;

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = source.split(',');
    }
  }

  if (!Array.isArray(source) || source.length === 0) {
    return DEFAULT_ALLOWED_DOCUMENT_TYPES;
  }

  const normalized = [...new Set(
    source
      .map(String)
      .map((type) => type.trim())
      .filter((type) => VALID_DOCUMENT_TYPES.includes(type))
  )];

  return normalized.length > 0 ? normalized : DEFAULT_ALLOWED_DOCUMENT_TYPES;
};

const validateLogoDataUrl = (logoDataUrl) => {
  if (!logoDataUrl) return null;

  const normalized = String(logoDataUrl).trim();

  if (!normalized) return null;

  const isValidDataUrl = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(normalized);

  if (!isValidDataUrl) {
    const error = new Error('El logo debe ser una imagen válida en formato PNG, JPG, JPEG o WEBP');
    error.statusCode = 400;
    throw error;
  }

  const base64Content = normalized.split(',')[1] || '';
  const logoSizeBytes = Buffer.byteLength(base64Content, 'base64');

  if (logoSizeBytes > LOGO_MAX_SIZE_BYTES) {
    const error = new Error(`El logo es demasiado pesado. Use una imagen menor a ${LOGO_MAX_SIZE_MB} MB`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const validateOptionalEconomicActivity = (code, name, label) => {
  const activityCode = normalizeText(code);
  const activityName = normalizeText(name);

  const hasCode = Boolean(activityCode);
  const hasName = Boolean(activityName);

  if (hasCode && !hasName) {
    const error = new Error(`Debe ingresar la descripción de la ${label}`);
    error.statusCode = 400;
    throw error;
  }

  if (!hasCode && hasName) {
    const error = new Error(`Debe ingresar el código de la ${label}`);
    error.statusCode = 400;
    throw error;
  }
};

const validateDuplicatedEconomicActivities = (companyData) => {
  const selectedCodes = [
    companyData.economicActivityCode,
    companyData.economicActivityCode2,
    companyData.economicActivityCode3
  ].filter(Boolean);

  const uniqueCodes = new Set(selectedCodes);

  if (selectedCodes.length !== uniqueCodes.size) {
    const error = new Error('No debe repetir la misma actividad económica en la empresa emisora');
    error.statusCode = 400;
    throw error;
  }
};

const validateCompanyData = (data) => {
  if (!normalizeText(data.nit)) {
    const error = new Error('El NIT o DUI de la empresa emisora es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  const taxIdentifier = cleanDigits(data.nit);
  if (![9, 14].includes(taxIdentifier.length)) {
    const error = new Error('Ingrese un DUI de 9 dígitos o un NIT de 14 dígitos para la empresa emisora');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.legalName)) {
    const error = new Error('La razón social de la empresa emisora es obligatoria');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.economicActivityCode) || !normalizeText(data.economicActivityName)) {
    const error = new Error('La actividad económica principal de la empresa emisora es obligatoria');
    error.statusCode = 400;
    throw error;
  }

  validateOptionalEconomicActivity(
    data.economicActivityCode2,
    data.economicActivityName2,
    'actividad económica 2'
  );

  validateOptionalEconomicActivity(
    data.economicActivityCode3,
    data.economicActivityName3,
    'actividad económica 3'
  );

  validateDuplicatedEconomicActivities(data);

  if (!normalizeText(data.departmentCode) || !normalizeText(data.departmentName)) {
    const error = new Error('Debe seleccionar el departamento de la empresa emisora');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.districtName) || !normalizeText(data.municipalityCode) || !normalizeText(data.municipalityName)) {
    const error = new Error('Debe seleccionar el distrito y municipio de la empresa emisora');
    error.statusCode = 400;
    throw error;
  }

  if (!normalizeText(data.addressComplement)) {
    const error = new Error('La dirección complementaria es obligatoria');
    error.statusCode = 400;
    throw error;
  }
};

const buildCompanyData = (data, currentCompany = null) => {
  const companyData = {
    nit: normalizeText(data.nit ?? currentCompany?.nit),
    nrc: normalizeEmpty(data.nrc ?? currentCompany?.nrc),

    legalName: normalizeText(data.legalName ?? currentCompany?.legalName),
    commercialName: normalizeText(data.commercialName ?? currentCompany?.commercialName),

    logoDataUrl: data.logoDataUrl !== undefined
      ? validateLogoDataUrl(data.logoDataUrl)
      : currentCompany?.logoDataUrl || null,

    useLogoInPdf: normalizeBoolean(
      data.useLogoInPdf,
      currentCompany?.useLogoInPdf ?? true
    ),

    economicActivityCode: normalizeText(data.economicActivityCode ?? currentCompany?.economicActivityCode),
    economicActivityName: normalizeText(data.economicActivityName ?? currentCompany?.economicActivityName),

    economicActivityCode2: normalizeText(data.economicActivityCode2 ?? currentCompany?.economicActivityCode2),
    economicActivityName2: normalizeText(data.economicActivityName2 ?? currentCompany?.economicActivityName2),

    economicActivityCode3: normalizeText(data.economicActivityCode3 ?? currentCompany?.economicActivityCode3),
    economicActivityName3: normalizeText(data.economicActivityName3 ?? currentCompany?.economicActivityName3),

    establishmentType: 'CASA_MATRIZ',
    establishmentCode: 'M001',
    pointOfSaleCode: 'P001',

    environment: normalizeEnvironment(
      data.environment ?? currentCompany?.environment,
      currentCompany?.environment || 'TEST'
    ),

    email: normalizeText(data.email ?? currentCompany?.email),
    phone: normalizeText(data.phone ?? currentCompany?.phone),

    departmentCode: normalizeText(data.departmentCode ?? currentCompany?.departmentCode),
    departmentName: normalizeText(data.departmentName ?? currentCompany?.departmentName),
    districtName: normalizeText(data.districtName ?? currentCompany?.districtName),
    municipalityCode: normalizeText(data.municipalityCode ?? currentCompany?.municipalityCode),
    municipalityName: normalizeText(data.municipalityName ?? currentCompany?.municipalityName),
    addressComplement: normalizeText(data.addressComplement ?? currentCompany?.addressComplement),

    allowedDocumentTypes: data.allowedDocumentTypes !== undefined
      ? normalizeAllowedDocumentTypes(data.allowedDocumentTypes)
      : normalizeAllowedDocumentTypes(currentCompany?.allowedDocumentTypes || DEFAULT_ALLOWED_DOCUMENT_TYPES),

    usesFuelTaxes: normalizeBoolean(
      data.usesFuelTaxes,
      currentCompany?.usesFuelTaxes ?? false
    ),

    isActive: data.isActive ?? currentCompany?.isActive ?? true
  };

  validateCompanyData(companyData);

  return companyData;
};

const syncMainEstablishment = async (company, transaction = null) => {
  const existing = await Establishment.findOne({
    where: {
      companyId: company.id,
      establishmentCode: 'M001'
    },
    transaction
  });

  const establishmentData = {
    companyId: company.id,
    establishmentType: 'CASA_MATRIZ',
    establishmentCode: 'M001',
    name: 'Casa Matriz',
    departmentCode: company.departmentCode,
    departmentName: company.departmentName,
    districtName: company.districtName,
    municipalityCode: company.municipalityCode,
    municipalityName: company.municipalityName,
    addressComplement: company.addressComplement,
    isActive: company.isActive
  };

  if (existing) {
    await existing.update(establishmentData, { transaction });
    return existing;
  }

  return Establishment.create(establishmentData, { transaction });
};

const attachCredentialStatus = async (company) => {
  if (!company) return null;

  const plain = company.toJSON ? company.toJSON() : { ...company };
  const credentials = await companyCredentialsService.getPublicCredentialStatus(company);

  return { ...plain, credentials };
};

const listCompanies = async ({ includeInactive = false } = {}) => {
  const where = includeInactive ? {} : { isActive: true };

  return Company.findAll({
    where,
    attributes: [
      'id', 'nit', 'nrc', 'legalName', 'commercialName',
      'environment', 'isActive', 'createdAt', 'updatedAt'
    ],
    order: [['legalName', 'ASC'], ['id', 'ASC']]
  });
};

const getActiveCompany = async (companyId = null) => {
  const company = companyId
    ? await Company.findOne({ where: { id: companyId, isActive: true } })
    : await Company.findOne({ where: { isActive: true }, order: [['id', 'ASC']] });

  return attachCredentialStatus(company);
};

const getCompanyById = async (id, { withCredentialStatus = false } = {}) => {
  const company = await Company.findByPk(id);

  if (!company) {
    const error = new Error('Empresa emisora no encontrada');
    error.statusCode = 404;
    throw error;
  }

  return withCredentialStatus ? attachCredentialStatus(company) : company;
};

const createCompany = async (data) => {
  const normalizedNit = normalizeText(data.nit);

  const existingCompany = await Company.findOne({
    where: {
      nit: normalizedNit
    }
  });

  if (existingCompany) {
    const error = new Error('Ya existe una empresa emisora registrada con ese NIT o DUI');
    error.statusCode = 409;
    throw error;
  }

  const companyData = buildCompanyData({
    ...data,
    nit: normalizedNit
  });

  const companyId = await sequelize.transaction(async (transaction) => {
    const company = await Company.create(companyData, { transaction });
    await syncMainEstablishment(company, transaction);
    await companyCredentialsService.updateCompanyCredentials({ company, data, transaction });
    return company.id;
  });

  return getCompanyById(companyId, { withCredentialStatus: true });
};

const diagnoseCompanyCertificate = async (id, data = {}) => {
  const company = await getCompanyById(id);

  return certificateDiagnosticsService.diagnoseCompanyCertificate({
    company,
    data
  });
};

const updateCompany = async (id, data) => {
  const company = await getCompanyById(id);

  const companyData = buildCompanyData(data, company);

  await sequelize.transaction(async (transaction) => {
    await company.update(companyData, { transaction });
    await syncMainEstablishment(company, transaction);
    await companyCredentialsService.updateCompanyCredentials({ company, data, transaction });
  });

  return getCompanyById(company.id, { withCredentialStatus: true });
};

module.exports = {
  listCompanies,
  getActiveCompany,
  getCompanyById,
  createCompany,
  updateCompany,
  diagnoseCompanyCertificate
};