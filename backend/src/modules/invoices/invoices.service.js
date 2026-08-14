const { Op, literal } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../../config/database');

const Invoice = require('./invoice.model');
const InvoiceItem = require('./invoice-item.model');
const Customer = require('../customers/customer.model');
const Product = require('../products/product.model');
const Company = require('../companies/company.model');
const PointOfSale = require('../companies/point-of-sale.model');
const Establishment = require('../companies/establishment.model');
const User = require('../users/user.model');
const Role = require('../users/role.model');

const dteSignerService = require('../dte/dte-signer.service');
const dteTransmissionService = require('../dte/dte-transmission.service');
const controlNumbersService = require('../dte/control-numbers.service');
const invalidationDeadlineService = require('../dte/dte-invalidation-deadline.service');
const DteEvent = require('../dte/dte-event.model');
const InvoiceImportArtifact = require('../imports/invoice-import-artifact.model');

const DEFAULT_ALLOWED_DOCUMENT_TYPES = ['01', '03'];

const IVA_RATE = 0.13;
const IVA_FACTOR = 1.13;
const IVA_RETENTION_RATE = 0.01;
const IVA_RETENTION_THRESHOLD = 100;
const IVA_RETENTION_DOCUMENT_TYPES = new Set(['01', '03', '05']);

const DOCUMENT_TYPE_NAMES = {
  '01': 'Factura de Consumidor Final',
  '03': 'Comprobante de Crédito Fiscal Electrónico',
  '04': 'Nota de Remisión Electrónica',
  '05': 'Nota de Crédito Electrónica',
  '06': 'Nota de Débito Electrónica',
  '07': 'Comprobante de Retención Electrónico',
  '08': 'Comprobante de Liquidación Electrónico',
  '09': 'Documento Contable de Liquidación Electrónico',
  '11': 'Factura de Exportación Electrónica',
  '14': 'Factura de Sujeto Excluido Electrónica',
  '15': 'Comprobante de Donación Electrónico'
};

const round2 = (value) => {
  return Number(Number(value || 0).toFixed(2));
};

const round4 = (value) => {
  return Number(Number(value || 0).toFixed(4));
};

const APP_TIME_ZONE = process.env.APP_TIMEZONE || 'America/El_Salvador';

const getAppDateParts = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
};

const getAppDateKey = (value = new Date()) => {
  const parts = getAppDateParts(value);

  return parts
    ? `${parts.year}-${parts.month}-${parts.day}`
    : null;
};

/*
  La bandeja operativa y el dashboard solo muestran el mes calendario
  vigente en El Salvador. Los DTE anteriores permanecen almacenados.
*/
const getCurrentMonthIssuedAtRange = (value = new Date()) => {
  const parts = getAppDateParts(value);

  if (!parts) {
    throw new Error(
      'No fue posible determinar el mes vigente para la consulta de DTE'
    );
  }

  const year = Number(parts.year);
  const month = Number(parts.month);

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const buildMonthStart = (targetYear, targetMonth) => {
    const normalizedMonth = String(targetMonth).padStart(2, '0');

    return new Date(
      `${targetYear}-${normalizedMonth}-01T00:00:00-06:00`
    );
  };

  return {
    [Op.gte]: buildMonthStart(year, month),
    [Op.lt]: buildMonthStart(nextYear, nextMonth)
  };
};

const parseDateFilter = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const rawValue = String(value).trim();
  const dateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateMatch) {
    const error = new Error(`${fieldName} debe tener el formato YYYY-MM-DD`);
    error.statusCode = 400;
    throw error;
  }

  const date = new Date(`${rawValue}T00:00:00-06:00`);

  /*
    Evita fechas inexistentes como 2026-02-30. JavaScript las ajusta
    automáticamente al mes siguiente si no se validan de forma explícita.
  */
  if (Number.isNaN(date.getTime()) || getAppDateKey(date) !== rawValue) {
    const error = new Error(`${fieldName} no es una fecha válida`);
    error.statusCode = 400;
    throw error;
  }

  return {
    key: rawValue,
    date
  };
};

const getIssuedAtRangeForList = ({ startDate, endDate }) => {
  const parsedStartDate = parseDateFilter(startDate, 'La fecha inicial');
  const parsedEndDate = parseDateFilter(endDate, 'La fecha final');

  /*
    Sin filtros explícitos se mantiene la bandeja operativa del mes vigente.
    Los DTE de períodos anteriores se consultan únicamente al indicar fechas.
  */
  if (!parsedStartDate && !parsedEndDate) {
    return getCurrentMonthIssuedAtRange();
  }

  if (
    parsedStartDate &&
    parsedEndDate &&
    parsedStartDate.date.getTime() > parsedEndDate.date.getTime()
  ) {
    const error = new Error('La fecha inicial no puede ser mayor que la fecha final');
    error.statusCode = 400;
    throw error;
  }

  const range = {};

  if (parsedStartDate) {
    range[Op.gte] = parsedStartDate.date;
  }

  if (parsedEndDate) {
    /*
      El límite superior es exclusivo: incluye todo el día seleccionado,
      incluso documentos emitidos durante las últimas horas de la fecha final.
    */
    range[Op.lt] = new Date(
      parsedEndDate.date.getTime() + (24 * 60 * 60 * 1000)
    );
  }

  return range;
};

const buildIssuedAtFromInput = (value) => {
  if (!value) return new Date();

  const rawValue = String(value).trim();

  if (rawValue.includes('T')) {
    const date = new Date(rawValue);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const match = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    /*
      El formulario envía solo la fecha. Para documentos del día actual,
      la hora de emisión debe ser el instante real de creación, no una
      hora fija artificial. Esto evita que todos los DTE queden con la
      misma hora al visualizarse o transmitirse.
    */
    if (rawValue === getAppDateKey()) {
      return new Date();
    }

    /*
      Para fechas distintas al día actual se conserva la fecha elegida.
      El valor se expresa explícitamente en la zona fiscal de El Salvador
      para evitar que Node/MySQL cambien el día por una conversión UTC.
    */
    return new Date(`${rawValue}T00:01:00-06:00`);
  }

  const fallback = new Date(rawValue);

  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
};

const resolveIssuedAtForUpdate = ({ data, invoice }) => {
  if (data.issuedAt) {
    return buildIssuedAtFromInput(data.issuedAt);
  }

  if (!data.issuedAtDate) {
    return invoice.issuedAt;
  }

  /*
    Al editar sin cambiar la fecha, se conserva la hora original de
    emisión. Solo se recalcula si el usuario realmente cambió la fecha.
  */
  if (String(data.issuedAtDate) === getAppDateKey(invoice.issuedAt)) {
    return invoice.issuedAt;
  }

  return buildIssuedAtFromInput(data.issuedAtDate);
};

const isConsumerFinalInvoice = (documentTypeCode) => {
  return String(documentTypeCode) === '01';
};

const isIvaSeparatedDocument = (documentTypeCode) => {
  return ['03', '04', '05', '06'].includes(String(documentTypeCode));
};

const calculateIncludedIva = (grossAmount) => {
  const amount = Number(grossAmount || 0);

  if (amount <= 0) return 0;

  return round2(amount - (amount / IVA_FACTOR));
};

const calculateSeparatedIva = (netAmount) => {
  const amount = Number(netAmount || 0);

  if (amount <= 0) return 0;

  return round2(amount * IVA_RATE);
};

const calculateItemTotals = ({
  documentTypeCode,
  quantity,
  unitPrice,
  saleType = 'GRAVADA',
  retention1 = 0,
  fovial = 0,
  cotrans = 0
}) => {
  const qty = Number(quantity);
  const price = Number(unitPrice);

  const baseAmount = round4(qty * price);

  const extraFovial = round4(Number(fovial || 0));
  const extraCotrans = round4(Number(cotrans || 0));
  const retention = round4(Number(retention1 || 0));

  let noSuj = 0;
  let exenta = 0;
  let gravada = 0;
  let iva = 0;

  if (saleType === 'NO_SUJETA') {
    noSuj = baseAmount;
  } else if (saleType === 'EXENTA') {
    exenta = baseAmount;
  } else {
    gravada = baseAmount;

    if (isConsumerFinalInvoice(documentTypeCode)) {
      // Factura 01: el precio unitario ya incluye IVA.
      // Hacienda espera que ivaItem represente el IVA incluido dentro de ventaGravada.
      iva = calculateIncludedIva(gravada);
    } else if (isIvaSeparatedDocument(documentTypeCode)) {
      // CCF, Nota de Crédito y documentos similares: el precio unitario es base sin IVA.
      iva = calculateSeparatedIva(gravada);
    }
  }

  const subtotal = round4(noSuj + exenta + gravada);

  const total = isConsumerFinalInvoice(documentTypeCode)
    ? round4(subtotal + extraFovial + extraCotrans - retention)
    : round4(subtotal + iva + extraFovial + extraCotrans - retention);

  return {
    saleType,
    noSuj,
    exenta,
    gravada,
    subtotal,
    iva,
    retention1: retention,
    fovial: extraFovial,
    cotrans: extraCotrans,
    total
  };
};


const supportsAutomaticIvaRetention = (documentTypeCode) => {
  return IVA_RETENTION_DOCUMENT_TYPES.has(String(documentTypeCode || ''));
};

const calculateRetentionBase = ({ documentTypeCode, items }) => {
  return round4(
    items.reduce((sum, item) => {
      const totals = calculateItemTotals({
        documentTypeCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        saleType: item.saleType || 'GRAVADA',
        retention1: 0,
        fovial: item.fovial || 0,
        cotrans: item.cotrans || 0
      });

      return sum + Number(totals.gravada || 0);
    }, 0)
  );
};

const applyAutomaticRetentionToInvoiceItems = ({
  documentTypeCode,
  items,
  applyRetention1 = false
}) => {
  const sourceItems = Array.isArray(items) ? items : [];

  if (!applyRetention1) {
    return sourceItems.map((item) => ({
      ...item,
      retention1: 0
    }));
  }

  if (!supportsAutomaticIvaRetention(documentTypeCode)) {
    const error = new Error('La retención 1% solo está disponible para Factura, CCF y Nota de Crédito');
    error.statusCode = 400;
    throw error;
  }

  const retentionBase = calculateRetentionBase({
    documentTypeCode,
    items: sourceItems
  });

  if (retentionBase <= IVA_RETENTION_THRESHOLD) {
    const error = new Error('La retención 1% solo puede aplicarse cuando la venta gravada supera $100.00');
    error.statusCode = 400;
    throw error;
  }

  const totalRetention = round4(retentionBase * IVA_RETENTION_RATE);
  let assignedRetention = 0;
  const taxableIndexes = [];
  const preliminaryItems = sourceItems.map((item, index) => {
    const totals = calculateItemTotals({
      documentTypeCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      saleType: item.saleType || 'GRAVADA',
      retention1: 0,
      fovial: item.fovial || 0,
      cotrans: item.cotrans || 0
    });

    if (totals.gravada > 0) {
      taxableIndexes.push(index);
    }

    return {
      item,
      totals
    };
  });

  return preliminaryItems.map(({ item, totals }, index) => {
    let retention = 0;

    if (totals.gravada > 0) {
      const isLastTaxableItem = taxableIndexes[taxableIndexes.length - 1] === index;

      retention = isLastTaxableItem
        ? round4(totalRetention - assignedRetention)
        : round4((Number(totals.gravada || 0) / retentionBase) * totalRetention);

      assignedRetention = round4(assignedRetention + retention);
    }

    return {
      ...item,
      retention1: retention
    };
  });
};

const validateInvoiceData = (data) => {
  if (!data.documentTypeCode) {
    const error = new Error('El tipo de DTE es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (!DOCUMENT_TYPE_NAMES[data.documentTypeCode]) {
    const error = new Error('Tipo de DTE no soportado por el sistema');
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    const error = new Error('Debe agregar al menos un producto o servicio al DTE');
    error.statusCode = 400;
    throw error;
  }

  for (const item of data.items) {
    if (!item.description || !item.description.trim()) {
      const error = new Error('Cada detalle debe tener descripción');
      error.statusCode = 400;
      throw error;
    }

    if (!item.quantity || Number(item.quantity) <= 0) {
      const error = new Error('La cantidad debe ser mayor a cero');
      error.statusCode = 400;
      throw error;
    }

    if (item.unitPrice === undefined || item.unitPrice === null || Number(item.unitPrice) < 0) {
      const error = new Error('El precio unitario debe ser mayor o igual a cero');
      error.statusCode = 400;
      throw error;
    }

    if (item.saleType && !['GRAVADA', 'EXENTA', 'NO_SUJETA'].includes(item.saleType)) {
      const error = new Error('El tipo de venta debe ser GRAVADA, EXENTA o NO_SUJETA');
      error.statusCode = 400;
      throw error;
    }

    if (item.retention1 !== undefined && Number(item.retention1) < 0) {
      const error = new Error('La retención no puede ser negativa');
      error.statusCode = 400;
      throw error;
    }

    if (item.fovial !== undefined && Number(item.fovial) < 0) {
      const error = new Error('FOVIAL no puede ser negativo');
      error.statusCode = 400;
      throw error;
    }

    if (item.cotrans !== undefined && Number(item.cotrans) < 0) {
      const error = new Error('COTRANS no puede ser negativo');
      error.statusCode = 400;
      throw error;
    }
  }
};

const parseAllowedDocumentTypes = (value) => {
  if (!value) {
    return DEFAULT_ALLOWED_DOCUMENT_TYPES;
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch (error) {
      return DEFAULT_ALLOWED_DOCUMENT_TYPES;
    }
  }

  return DEFAULT_ALLOWED_DOCUMENT_TYPES;
};

const validateAllowedDocumentType = async ({ companyId, documentTypeCode }) => {
  const company = await Company.findByPk(companyId);

  if (!company) {
    const error = new Error('Empresa emisora no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const allowedDocumentTypes = parseAllowedDocumentTypes(company.allowedDocumentTypes);

  if (!allowedDocumentTypes.includes(String(documentTypeCode))) {
    const error = new Error(
      `La empresa emisora no tiene habilitado este tipo de DTE. Documento solicitado: ${documentTypeCode}. Documentos habilitados: ${allowedDocumentTypes.join(', ')}`
    );
    error.statusCode = 403;
    throw error;
  }

  return company;
};

const validateCustomerForDocumentType = ({ documentTypeCode, customer }) => {
  if (!customer) {
    const error = new Error('Debe seleccionar un cliente o receptor para emitir el DTE');
    error.statusCode = 400;
    throw error;
  }

  if (documentTypeCode === '04') {
    if (!['NIT', 'DUI'].includes(customer.documentType) || !customer.documentNumber) {
      const error = new Error('Para generar Nota de Remisión, el receptor debe tener NIT o DUI registrado');
      error.statusCode = 400;
      throw error;
    }

    if (!customer.economicActivityCode || !customer.economicActivityName) {
      const error = new Error('Para generar Nota de Remisión, el receptor debe tener actividad económica registrada');
      error.statusCode = 400;
      throw error;
    }

    if (!customer.departmentCode || !customer.municipalityCode || !customer.addressComplement) {
      const error = new Error('Para generar Nota de Remisión, el receptor debe tener dirección registrada');
      error.statusCode = 400;
      throw error;
    }

    if (!customer.email) {
      const error = new Error('Para generar Nota de Remisión, el receptor debe tener correo registrado');
      error.statusCode = 400;
      throw error;
    }
  }

  if (documentTypeCode === '03') {
    if (!['NIT', 'DUI'].includes(customer.documentType) || !customer.documentNumber) {
      const error = new Error('Para generar CCF, el cliente debe tener NIT o DUI registrado');
      error.statusCode = 400;
      throw error;
    }

    if (!customer.nrc) {
      const error = new Error('Para generar CCF, el cliente debe tener NRC registrado');
      error.statusCode = 400;
      throw error;
    }

    if (!customer.economicActivityCode || !customer.economicActivityName) {
      const error = new Error('Para generar CCF, el cliente debe tener actividad económica registrada');
      error.statusCode = 400;
      throw error;
    }
  }

  if (documentTypeCode === '05') {
    if (!['NIT', 'DUI'].includes(customer.documentType) || !customer.documentNumber) {
      const error = new Error('Para generar Nota de Crédito, el cliente relacionado debe tener NIT o DUI registrado');
      error.statusCode = 400;
      throw error;
    }

    if (!customer.nrc) {
      const error = new Error('Para generar Nota de Crédito, el cliente relacionado debe tener NRC registrado');
      error.statusCode = 400;
      throw error;
    }

    if (!customer.economicActivityCode || !customer.economicActivityName) {
      const error = new Error('Para generar Nota de Crédito, el cliente relacionado debe tener actividad económica registrada');
      error.statusCode = 400;
      throw error;
    }
  }

  if (documentTypeCode === '11') {
    if (!customer.documentNumber) {
      const error = new Error('Para Factura de Exportación, el receptor debe tener NIT, DUI, pasaporte u otro documento');
      error.statusCode = 400;
      throw error;
    }

    if (customer.documentType === 'SIN_DOCUMENTO') {
      const error = new Error('Para Factura de Exportación debe seleccionar un tipo de documento válido');
      error.statusCode = 400;
      throw error;
    }
  }

  if (documentTypeCode === '14') {
    if (!customer.documentNumber) {
      const error = new Error('Para Factura de Sujeto Excluido, el receptor debe tener documento registrado');
      error.statusCode = 400;
      throw error;
    }

    if (customer.documentType === 'SIN_DOCUMENTO') {
      const error = new Error('Para Factura de Sujeto Excluido debe seleccionar un tipo de documento válido');
      error.statusCode = 400;
      throw error;
    }
  }
};

const buildCompanyPayloadFromModel = (company) => {
  if (!company) return null;

  return {
    id: company.id,
    nit: company.nit,
    nrc: company.nrc,
    legalName: company.legalName,
    commercialName: company.commercialName,
    economicActivityCode: company.economicActivityCode,
    economicActivityName: company.economicActivityName,
    establishmentType: company.establishmentType,
    establishmentCode: company.establishmentCode,
    pointOfSaleCode: company.pointOfSaleCode,
    environment: company.environment,
    email: company.email,
    phone: company.phone,
    departmentCode: company.departmentCode,
    departmentName: company.departmentName,
    districtName: company.districtName,
    municipalityCode: company.municipalityCode,
    municipalityName: company.municipalityName,
    addressComplement: company.addressComplement,
    allowedDocumentTypes: company.allowedDocumentTypes || DEFAULT_ALLOWED_DOCUMENT_TYPES
  };
};

const buildEstablishmentPayloadFromModel = (establishment) => {
  if (!establishment) return null;

  return {
    id: establishment.id,
    companyId: establishment.companyId,
    establishmentType: establishment.establishmentType,
    establishmentCode: establishment.establishmentCode,
    name: establishment.name,
    departmentCode: establishment.departmentCode,
    departmentName: establishment.departmentName,
    districtName: establishment.districtName,
    municipalityCode: establishment.municipalityCode,
    municipalityName: establishment.municipalityName,
    addressComplement: establishment.addressComplement,
    isActive: establishment.isActive
  };
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
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    email: dbUser.email,
    pointOfSaleId: dbUser.pointOfSaleId,
    roles,
    company: buildCompanyPayloadFromModel(company),
    pointOfSale: dbUser.pointOfSale
      ? {
          id: dbUser.pointOfSale.id,
          companyId: dbUser.pointOfSale.companyId,
          establishmentId: dbUser.pointOfSale.establishmentId,
          code: dbUser.pointOfSale.code,
          name: dbUser.pointOfSale.name,
          description: dbUser.pointOfSale.description,
          establishment: buildEstablishmentPayloadFromModel(dbUser.pointOfSale.establishment)
        }
      : null
  };
};

const isAdminUser = (user) => {
  return Array.isArray(user?.roles) && user.roles.includes('ADMIN');
};

const getUserEstablishmentId = (user) => {
  return user?.pointOfSale?.establishmentId || null;
};

const buildPointOfSaleInclude = () => {
  return {
    model: PointOfSale,
    as: 'pointOfSale',
    include: [
      {
        model: Establishment,
        as: 'establishment'
      }
    ]
  };
};

const buildInvoiceVisibilityInclude = (user) => {
  const pointOfSaleInclude = buildPointOfSaleInclude();

  if (!isAdminUser(user)) {
    const establishmentId = getUserEstablishmentId(user);

    if (!establishmentId) {
      const error = new Error('El usuario no tiene establecimiento o sucursal asignada');
      error.statusCode = 403;
      throw error;
    }

    pointOfSaleInclude.where = {
      establishmentId
    };

    pointOfSaleInclude.required = true;
  }

  return pointOfSaleInclude;
};


const INVOICE_LIST_ATTRIBUTES = [
  'id',
  'companyId',
  'pointOfSaleId',
  'userId',
  'customerId',
  'documentTypeCode',
  'documentTypeName',
  'controlNumber',
  'generationCode',
  'validationStatus',
  'receptionSeal',
  'relatedInvoiceId',
  'relatedControlNumber',
  'relatedGenerationCode',
  'relatedDocumentTypeCode',
  'transmittedAt',
  'acceptedAt',
  'rejectedAt',
  'rejectionReason',
  'invalidatedAt',
  'invalidationReason',
  'invalidationReceptionSeal',
  'invalidationGenerationCode',
  'invalidationDeadlineAt',
  'status',
  'issuedAt',
  'operationCondition',
  'paymentMethod',
  'noSuj',
  'exenta',
  'gravada',
  'subtotal',
  'iva',
  'retention1',
  'fovial',
  'cotrans',
  'total',
  'notes',
  'createdAt',
  'updatedAt'
];

const CUSTOMER_LIST_ATTRIBUTES = [
  'id',
  'name',
  'commercialName',
  'documentType',
  'documentNumber',
  'nrc',
  'email',
  'secondaryEmail',
  'phone',
  'economicActivityCode',
  'economicActivityName'
];

const validateInvoiceVisibility = async ({ invoice, user }) => {
  if (!invoice) {
    const error = new Error('DTE no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (!user?.company || Number(invoice.companyId) !== Number(user.company.id)) {
    const error = new Error('No tiene permiso para consultar este DTE');
    error.statusCode = 403;
    throw error;
  }

  if (isAdminUser(user)) {
    return true;
  }

  const userEstablishmentId = getUserEstablishmentId(user);
  const invoiceEstablishmentId = invoice.pointOfSale?.establishmentId;

  if (!userEstablishmentId || Number(invoiceEstablishmentId) !== Number(userEstablishmentId)) {
    const error = new Error('No tiene permiso para consultar documentos de otra sucursal');
    error.statusCode = 403;
    throw error;
  }

  return true;
};

const validateRelatedInvoiceForCreditNote = async ({ relatedInvoiceId, user, transaction }) => {
  if (!relatedInvoiceId) {
    const error = new Error('Debe seleccionar el CCF relacionado para generar una Nota de Crédito');
    error.statusCode = 400;
    throw error;
  }

  const relatedInvoice = await Invoice.findOne({
    where: { id: relatedInvoiceId, companyId: user.company.id },
    include: [
      {
        model: Customer,
        as: 'customer'
      },
      buildPointOfSaleInclude()
    ],
    transaction
  });

  if (!relatedInvoice) {
    const error = new Error('El CCF relacionado no existe');
    error.statusCode = 404;
    throw error;
  }

  await validateInvoiceVisibility({
    invoice: relatedInvoice,
    user
  });

  if (relatedInvoice.documentTypeCode !== '03') {
    const error = new Error('La Nota de Crédito solo puede relacionarse con un Comprobante de Crédito Fiscal');
    error.statusCode = 400;
    throw error;
  }

  if (relatedInvoice.status !== 'ACEPTADO') {
    const error = new Error('Solo se pueden generar Notas de Crédito sobre CCF aceptados por Hacienda');
    error.statusCode = 400;
    throw error;
  }

  return relatedInvoice;
};

const createGeneratedInvoice = async ({ data, user }) => {
  const currentUser = await resolveUserContext(user);

  validateInvoiceData(data);

  if (!currentUser.company || !currentUser.pointOfSale) {
    const error = new Error('El usuario no tiene empresa o punto de venta asignado');
    error.statusCode = 400;
    throw error;
  }

  await validateAllowedDocumentType({
    companyId: currentUser.company.id,
    documentTypeCode: data.documentTypeCode
  });

  return sequelize.transaction(async (transaction) => {
    let relatedInvoice = null;

    if (data.documentTypeCode === '05') {
      relatedInvoice = await validateRelatedInvoiceForCreditNote({
        relatedInvoiceId: data.relatedInvoiceId,
        user: currentUser,
        transaction
      });
    }

    const effectiveCustomerId = data.documentTypeCode === '05'
      ? relatedInvoice.customerId
      : data.customerId;

    const customer = effectiveCustomerId
      ? await Customer.findOne({ where: { id: effectiveCustomerId, companyId: currentUser.company.id }, transaction })
      : null;

    if (effectiveCustomerId && !customer) {
      const error = new Error('Cliente seleccionado no existe');
      error.statusCode = 404;
      throw error;
    }

    validateCustomerForDocumentType({
      documentTypeCode: data.documentTypeCode,
      customer
    });

    const normalizedItems = applyAutomaticRetentionToInvoiceItems({
      documentTypeCode: data.documentTypeCode,
      items: data.items,
      applyRetention1: data.applyRetention1
    });

    const controlResult = await controlNumbersService.generateNextControlNumber({
      companyId: currentUser.company.id,
      pointOfSaleId: currentUser.pointOfSale.id,
      documentTypeCode: data.documentTypeCode
    });

    let noSuj = 0;
    let exenta = 0;
    let gravada = 0;
    let subtotal = 0;
    let iva = 0;
    let retention1 = 0;
    let fovial = 0;
    let cotrans = 0;
    let total = 0;

    const invoice = await Invoice.create({
      companyId: currentUser.company.id,
      pointOfSaleId: currentUser.pointOfSale.id,
      userId: currentUser.id,
      customerId: effectiveCustomerId || null,
      documentTypeCode: data.documentTypeCode,
      documentTypeName: DOCUMENT_TYPE_NAMES[data.documentTypeCode],
      controlNumber: controlResult.controlNumber,
      generationCode: uuidv4().toUpperCase(),
      relatedInvoiceId: relatedInvoice?.id || null,
      relatedControlNumber: relatedInvoice?.controlNumber || null,
      relatedGenerationCode: relatedInvoice?.generationCode || null,
      relatedDocumentTypeCode: relatedInvoice?.documentTypeCode || null,
      status: 'GENERADO',
      issuedAt: buildIssuedAtFromInput(data.issuedAtDate || data.issuedAt),
      operationCondition: data.operationCondition || 'CONTADO',
      paymentMethod: data.paymentMethod || null,

      noSuj: 0,
      exenta: 0,
      gravada: 0,
      subtotal: 0,
      iva: 0,
      retention1: 0,
      fovial: 0,
      cotrans: 0,
      total: 0,

      notes: data.notes || null
    }, { transaction });

    for (const item of normalizedItems) {
      let product = null;

      if (item.productId) {
        product = await Product.findOne({
          where: { id: item.productId, companyId: currentUser.company.id },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!product) {
          const error = new Error('Uno de los productos seleccionados no existe');
          error.statusCode = 404;
          throw error;
        }

        if (!product.isActive) {
          const error = new Error(`El producto o servicio ${product.name} está inactivo y no puede facturarse`);
          error.statusCode = 400;
          throw error;
        }

        if (product.itemType === 'PRODUCTO') {
          const currentStock = Number(product.stock || 0);
          const requestedQuantity = Number(item.quantity);

          if (currentStock < requestedQuantity) {
            const error = new Error(`Stock insuficiente para ${product.name}. Disponible: ${currentStock}`);
            error.statusCode = 400;
            throw error;
          }

          await product.update({
            stock: round4(currentStock - requestedQuantity)
          }, { transaction });
        }
      }

      const itemTotals = calculateItemTotals({
        documentTypeCode: data.documentTypeCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        saleType: item.saleType || 'GRAVADA',
        retention1: item.retention1 || 0,
        fovial: item.fovial || 0,
        cotrans: item.cotrans || 0
      });

      noSuj += itemTotals.noSuj;
      exenta += itemTotals.exenta;
      gravada += itemTotals.gravada;
      subtotal += itemTotals.subtotal;
      iva += itemTotals.iva;
      retention1 += itemTotals.retention1;
      fovial += itemTotals.fovial;
      cotrans += itemTotals.cotrans;
      total += itemTotals.total;

      await InvoiceItem.create({
        invoiceId: invoice.id,
        productId: item.productId || null,
        itemType: item.itemType || product?.itemType || 'SERVICIO',
        code: item.code || product?.code || null,
        description: item.description,
        unitOfMeasure: item.unitOfMeasure || product?.unitOfMeasure || '59',
        unitOfMeasureName: item.unitOfMeasureName || product?.unitOfMeasureName || 'Unidad',

        saleType: itemTotals.saleType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: product?.purchasePrice || null,

        noSuj: itemTotals.noSuj,
        exenta: itemTotals.exenta,
        gravada: itemTotals.gravada,
        subtotal: itemTotals.subtotal,
        iva: itemTotals.iva,
        retention1: itemTotals.retention1,
        fovial: itemTotals.fovial,
        cotrans: itemTotals.cotrans,
        total: itemTotals.total
      }, { transaction });
    }

    await invoice.update({
      noSuj: round4(noSuj),
      exenta: round4(exenta),
      gravada: round4(gravada),
      subtotal: round4(subtotal),
      iva: round4(iva),
      retention1: round4(retention1),
      fovial: round4(fovial),
      cotrans: round4(cotrans),
      total: round4(total)
    }, { transaction });

    const createdInvoice = await Invoice.findByPk(invoice.id, {
      include: [
        {
          model: Company,
          as: 'company'
        },
        buildPointOfSaleInclude(),
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName', 'email']
        },
        {
          model: Customer,
          as: 'customer'
        },
        {
          model: InvoiceItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product'
            }
          ]
        }
      ],
      transaction
    });

    return createdInvoice;
  });
};

const updateGeneratedInvoice = async ({ id, data, user }) => {
  const currentUser = await resolveUserContext(user);

  validateInvoiceData(data);

  const existingInvoice = await Invoice.findOne({
    where: {
      id,
      companyId: currentUser.company.id
    },
    include: [
      {
        model: Company,
        as: 'company'
      },
      buildPointOfSaleInclude(),
      {
        model: Customer,
        as: 'customer'
      },
      {
        model: InvoiceItem,
        as: 'items',
        include: [
          {
            model: Product,
            as: 'product'
          }
        ]
      }
    ]
  });

  await validateInvoiceVisibility({
    invoice: existingInvoice,
    user: currentUser
  });

  if (!['GENERADO', 'RECHAZADO'].includes(existingInvoice.status)) {
    const error = new Error('Solo se pueden editar DTE en estado GENERADO o RECHAZADO');
    error.statusCode = 400;
    throw error;
  }

  if (String(data.documentTypeCode) !== String(existingInvoice.documentTypeCode)) {
    const error = new Error('No se puede cambiar el tipo de DTE al editar. Debe conservar el mismo tipo de documento.');
    error.statusCode = 400;
    throw error;
  }

  await validateAllowedDocumentType({
    companyId: currentUser.company.id,
    documentTypeCode: data.documentTypeCode
  });

  return sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findOne({
      where: { id, companyId: currentUser.company.id },
      include: [
        buildPointOfSaleInclude()
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!invoice) {
      const error = new Error('DTE no encontrado');
      error.statusCode = 404;
      throw error;
    }

    let relatedInvoice = null;

    if (data.documentTypeCode === '05') {
      relatedInvoice = await validateRelatedInvoiceForCreditNote({
        relatedInvoiceId: data.relatedInvoiceId,
        user: currentUser,
        transaction
      });
    }

    const effectiveCustomerId = data.documentTypeCode === '05'
      ? relatedInvoice.customerId
      : data.customerId;

    const customer = effectiveCustomerId
      ? await Customer.findOne({ where: { id: effectiveCustomerId, companyId: currentUser.company.id }, transaction })
      : null;

    if (effectiveCustomerId && !customer) {
      const error = new Error('Cliente seleccionado no existe');
      error.statusCode = 404;
      throw error;
    }

    validateCustomerForDocumentType({
      documentTypeCode: data.documentTypeCode,
      customer
    });

    const normalizedItems = applyAutomaticRetentionToInvoiceItems({
      documentTypeCode: data.documentTypeCode,
      items: data.items,
      applyRetention1: data.applyRetention1
    });

    const previousItems = await InvoiceItem.findAll({
      where: {
        invoiceId: invoice.id
      },
      transaction
    });

    for (const previousItem of previousItems) {
      if (!previousItem.productId) continue;

      const product = await Product.findOne({
        where: { id: previousItem.productId, companyId: currentUser.company.id },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!product) continue;

      if (product.itemType === 'PRODUCTO' || previousItem.itemType === 'PRODUCTO') {
        const currentStock = Number(product.stock || 0);
        const previousQuantity = Number(previousItem.quantity || 0);

        await product.update({
          stock: round4(currentStock + previousQuantity)
        }, { transaction });
      }
    }

    await InvoiceItem.destroy({
      where: {
        invoiceId: invoice.id
      },
      transaction
    });

    let noSuj = 0;
    let exenta = 0;
    let gravada = 0;
    let subtotal = 0;
    let iva = 0;
    let retention1 = 0;
    let fovial = 0;
    let cotrans = 0;
    let total = 0;

    for (const item of normalizedItems) {
      let product = null;

      if (item.productId) {
        product = await Product.findOne({
          where: { id: item.productId, companyId: currentUser.company.id },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!product) {
          const error = new Error('Uno de los productos seleccionados no existe');
          error.statusCode = 404;
          throw error;
        }

        if (!product.isActive) {
          const error = new Error(`El producto o servicio ${product.name} está inactivo y no puede facturarse`);
          error.statusCode = 400;
          throw error;
        }

        if (product.itemType === 'PRODUCTO') {
          const currentStock = Number(product.stock || 0);
          const requestedQuantity = Number(item.quantity);

          if (currentStock < requestedQuantity) {
            const error = new Error(`Stock insuficiente para ${product.name}. Disponible: ${currentStock}`);
            error.statusCode = 400;
            throw error;
          }

          await product.update({
            stock: round4(currentStock - requestedQuantity)
          }, { transaction });
        }
      }

      const itemTotals = calculateItemTotals({
        documentTypeCode: data.documentTypeCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        saleType: item.saleType || 'GRAVADA',
        retention1: item.retention1 || 0,
        fovial: item.fovial || 0,
        cotrans: item.cotrans || 0
      });

      noSuj += itemTotals.noSuj;
      exenta += itemTotals.exenta;
      gravada += itemTotals.gravada;
      subtotal += itemTotals.subtotal;
      iva += itemTotals.iva;
      retention1 += itemTotals.retention1;
      fovial += itemTotals.fovial;
      cotrans += itemTotals.cotrans;
      total += itemTotals.total;

      await InvoiceItem.create({
        invoiceId: invoice.id,
        productId: item.productId || null,
        itemType: item.itemType || product?.itemType || 'SERVICIO',
        code: item.code || product?.code || null,
        description: item.description,
        unitOfMeasure: item.unitOfMeasure || product?.unitOfMeasure || '59',
        unitOfMeasureName: item.unitOfMeasureName || product?.unitOfMeasureName || 'Unidad',

        saleType: itemTotals.saleType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: product?.purchasePrice || null,

        noSuj: itemTotals.noSuj,
        exenta: itemTotals.exenta,
        gravada: itemTotals.gravada,
        subtotal: itemTotals.subtotal,
        iva: itemTotals.iva,
        retention1: itemTotals.retention1,
        fovial: itemTotals.fovial,
        cotrans: itemTotals.cotrans,
        total: itemTotals.total
      }, { transaction });
    }

    await invoice.update({
      customerId: effectiveCustomerId || null,
      issuedAt: resolveIssuedAtForUpdate({ data, invoice }),

      relatedInvoiceId: relatedInvoice?.id || null,
      relatedControlNumber: relatedInvoice?.controlNumber || null,
      relatedGenerationCode: relatedInvoice?.generationCode || null,
      relatedDocumentTypeCode: relatedInvoice?.documentTypeCode || null,

      operationCondition: data.operationCondition || 'CONTADO',
      paymentMethod: data.paymentMethod || null,
      notes: data.notes || null,

      noSuj: round4(noSuj),
      exenta: round4(exenta),
      gravada: round4(gravada),
      subtotal: round4(subtotal),
      iva: round4(iva),
      retention1: round4(retention1),
      fovial: round4(fovial),
      cotrans: round4(cotrans),
      total: round4(total),

      status: 'GENERADO',
      signedJws: null,
      signedAt: null,
      validationStatus: 'PENDIENTE',
      validationErrorsJson: null,
      mhResponseJson: null,
      mhObservationsJson: null,
      receptionSeal: null,
      transmittedAt: null,
      acceptedAt: null,
      rejectedAt: null,
      rejectionReason: null
    }, { transaction });

    const updatedInvoice = await Invoice.findByPk(invoice.id, {
      include: [
        {
          model: Company,
          as: 'company'
        },
        buildPointOfSaleInclude(),
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName', 'email']
        },
        {
          model: Customer,
          as: 'customer'
        },
        {
          model: InvoiceItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product'
            }
          ]
        }
      ],
      transaction
    });

    return updatedInvoice;
  });
};

const attachHistoricalImportFlagsToInvoices = async (invoices) => {
  const invoiceList = Array.isArray(invoices) ? invoices : [invoices];
  const invoiceIds = invoiceList
    .filter(Boolean)
    .map((invoice) => Number(invoice.id))
    .filter(Number.isInteger);

  if (invoiceIds.length === 0) return invoices;

  const artifacts = await InvoiceImportArtifact.findAll({
    attributes: ['invoiceId'],
    where: {
      invoiceId: {
        [Op.in]: invoiceIds
      }
    }
  });

  const importedInvoiceIds = new Set(
    artifacts.map((artifact) => Number(artifact.invoiceId))
  );

  for (const invoice of invoiceList) {
    invoice.setDataValue(
      'isHistoricalImport',
      importedInvoiceIds.has(Number(invoice.id))
    );
  }

  return invoices;
};

const parseHaciendaProcessingDate = (value) => {
  if (!value) return null;

  const text = String(value).trim();
  const match = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})[:.](\d{2})$/
  );

  if (match) {
    const [, day, month, year, hour, minute, second] = match;
    const parsed = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}-06:00`
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const attachReturnEventsToInvoices = async (invoices) => {
  const invoiceList = Array.isArray(invoices) ? invoices : [invoices];
  const invoiceIds = invoiceList
    .filter(Boolean)
    .map((invoice) => invoice.id);

  if (invoiceIds.length === 0) return invoices;

  const returnEvents = await DteEvent.findAll({
  attributes: [
    'id',
    'sourceInvoiceId',
    'generationCode',
    'status',
    'receptionSeal',
    'issuedAt',
    'transmittedAt',
    'acceptedAt',
    'rejectedAt',
    'rejectionReason'
  ],
  where: {
    sourceInvoiceId: {
      [Op.in]: invoiceIds
    },
    eventTypeCode: '18'
  },
  order: [
    ['createdAt', 'DESC'],
    ['id', 'DESC']
  ]
});

  const eventByInvoiceId = new Map();

  for (const event of returnEvents) {
    if (!eventByInvoiceId.has(Number(event.sourceInvoiceId))) {
      eventByInvoiceId.set(Number(event.sourceInvoiceId), event);
    }
  }

  for (const invoice of invoiceList) {
    const event = eventByInvoiceId.get(Number(invoice.id));

    invoice.setDataValue('returnEvent', event
      ? {
          id: event.id,
          generationCode: event.generationCode,
          status: event.status,
          receptionSeal: event.receptionSeal,
          issuedAt: event.issuedAt,
          transmittedAt: event.transmittedAt,
          acceptedAt: event.acceptedAt,
          rejectedAt: event.rejectedAt,
          rejectionReason: event.rejectionReason
        }
      : null);
  }

  return invoices;
};

const listInvoices = async ({ user, startDate, endDate }) => {
  const currentUser = await resolveUserContext(user);

  if (!currentUser?.company) {
    const error = new Error('El usuario no tiene empresa emisora asignada');
    error.statusCode = 400;
    throw error;
  }

  const invoices = await Invoice.findAll({
    attributes: INVOICE_LIST_ATTRIBUTES,
    where: {
      companyId: currentUser.company.id,
      issuedAt: getIssuedAtRangeForList({
        startDate,
        endDate
      })
    },
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: CUSTOMER_LIST_ATTRIBUTES
      },
      buildInvoiceVisibilityInclude(currentUser),
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName', 'email']
      }
    ],
    order: [
  ['documentTypeCode', 'ASC'],
  [literal("CAST(SUBSTRING_INDEX(`Invoice`.`control_number`, '-', -1) AS UNSIGNED)"), 'DESC'],
  ['id', 'DESC']
]
  });

  await attachReturnEventsToInvoices(invoices);
  await attachHistoricalImportFlagsToInvoices(invoices);

  return invoices;
};

const getInvoiceById = async (id, options = {}) => {
  const { user = null } = options;
  const currentUser = user ? await resolveUserContext(user) : null;

  const invoice = await Invoice.findOne({
    where: {
      id,
      ...(currentUser?.company?.id ? { companyId: currentUser.company.id } : {})
    },
    include: [
      {
        model: Company,
        as: 'company'
      },
      buildPointOfSaleInclude(),
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName', 'email']
      },
      {
        model: Customer,
        as: 'customer'
      },
      {
        model: InvoiceItem,
        as: 'items',
        include: [
          {
            model: Product,
            as: 'product'
          }
        ]
      }
    ]
  });

  if (!invoice) {
    const error = new Error('DTE no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (currentUser) {
    await validateInvoiceVisibility({ invoice, user: currentUser });
  }

  await attachHistoricalImportFlagsToInvoices(invoice);

  return invoice;
};

const getDashboardSummary = async ({ user }) => {
  const currentUser = await resolveUserContext(user);

  if (!currentUser?.company) {
    const error = new Error('El usuario no tiene empresa emisora asignada');
    error.statusCode = 400;
    throw error;
  }

  const invoices = await Invoice.findAll({
    attributes: INVOICE_LIST_ATTRIBUTES,
    where: {
      companyId: currentUser.company.id,
      issuedAt: getCurrentMonthIssuedAtRange()
    },
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: CUSTOMER_LIST_ATTRIBUTES
      },
      buildInvoiceVisibilityInclude(currentUser)
    ],
    order: [['issuedAt', 'DESC']]
  });

  const summary = {
    totalDocuments: invoices.length,
    generated: 0,
    signed: 0,
    transmitted: 0,
    accepted: 0,
    rejected: 0,
    annulled: 0,
    totalAmount: 0,
    generatedAmount: 0,
    acceptedAmount: 0,
    recentInvoices: invoices.slice(0, 5)
  };

  for (const invoice of invoices) {
    const total = Number(invoice.total || 0);

    summary.totalAmount += total;

    if (invoice.status === 'GENERADO') {
      summary.generated += 1;
      summary.generatedAmount += total;
    }

    if (invoice.status === 'FIRMADO') {
      summary.signed += 1;
    }

    if (invoice.status === 'TRANSMITIDO') {
      summary.transmitted += 1;
    }

    if (invoice.status === 'ACEPTADO') {
      summary.accepted += 1;
      summary.acceptedAmount += total;
    }

    if (invoice.status === 'RECHAZADO') {
      summary.rejected += 1;
    }

    if (invoice.status === 'ANULADO') {
      summary.annulled += 1;
    }
  }

  return summary;
};

const listAvailableDocumentsForCreditNote = async ({ user }) => {
  const currentUser = await resolveUserContext(user);

  if (!currentUser.company) {
    const error = new Error('El usuario no tiene empresa emisora asignada');
    error.statusCode = 400;
    throw error;
  }

  const invoices = await Invoice.findAll({
    attributes: INVOICE_LIST_ATTRIBUTES,
    where: {
      companyId: currentUser.company.id,
      documentTypeCode: '03',
      status: 'ACEPTADO'
    },
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: CUSTOMER_LIST_ATTRIBUTES
      },
      buildInvoiceVisibilityInclude(currentUser),
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName', 'email']
      }
    ],
    order: [['issuedAt', 'DESC']]
  });

  return invoices;
};

const transmitInvoiceToHaciendaReal = async ({ id, user }) => {
  const currentUser = await resolveUserContext(user);

  const invoice = await Invoice.findOne({
    where: { id, companyId: currentUser.company.id },
    include: [
      {
        model: Company,
        as: 'company'
      },
      buildPointOfSaleInclude(),
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName', 'email']
      },
      {
        model: Customer,
        as: 'customer'
      },
      {
        model: InvoiceItem,
        as: 'items',
        include: [
          {
            model: Product,
            as: 'product'
          }
        ]
      }
    ]
  });

  if (invoice?.relatedInvoiceId) {
  const relatedInvoice = await Invoice.findOne({
    where: {
      id: invoice.relatedInvoiceId,
      companyId: invoice.companyId
    },
    attributes: [
      'id',
      'documentTypeCode',
      'controlNumber',
      'generationCode',
      'issuedAt',
      'receptionSeal',
      'status'
    ]
  });

  if (relatedInvoice) {
    invoice.setDataValue('relatedInvoice', relatedInvoice);
    invoice.relatedInvoice = relatedInvoice;
  }
}

  await validateInvoiceVisibility({
    invoice,
    user: currentUser
  });

  const historicalImport = await InvoiceImportArtifact.findOne({
    attributes: ['id'],
    where: {
      companyId: invoice.companyId,
      invoiceId: invoice.id
    }
  });

  if (historicalImport) {
    const error = new Error(
      'Este DTE fue importado desde otro sistema. No debe retransmitirse; el Administrador debe usar Sincronizar con Hacienda para recuperar su estado y sello de recepción.'
    );
    error.statusCode = 409;
    throw error;
  }

  if (!['GENERADO', 'FIRMADO', 'RECHAZADO'].includes(invoice.status)) {
    const error = new Error('Solo se pueden transmitir documentos en estado GENERADO, FIRMADO o RECHAZADO');
    error.statusCode = 400;
    throw error;
  }

  const dteJsonService = require('../dte/dte-json.service');
  let transmittedAt = null;

  try {
    // Esta validación se ejecuta antes de firmar o transmitir. Si falla, el
    // catch guarda el error y conserva el DTE en GENERADO.
    const officialDteJson = dteJsonService.buildOfficialStandardDteJson(invoice);

    const signed = await dteSignerService.signDteJson({
      company: invoice.company,
      nit: invoice.company.nit,
      dteJson: officialDteJson
    });

    await invoice.update({
      status: 'FIRMADO',
      signedJws: signed.signedJws,
      signedAt: new Date(),
      validationStatus: 'VALIDADO',
      validationErrorsJson: null,
      mhResponseJson: {
        modo: 'FIRMA_REAL',
        descripcion: 'DTE firmado correctamente. Pendiente de respuesta de recepción de Hacienda.',
        signerResponse: signed.signerResponse
      },
      mhObservationsJson: null
    });

    /*
      Registra la hora cuando realmente inicia el envío a Hacienda,
      después de firmar el documento. Así la fecha de transmisión no
      queda adelantada por el tiempo que tomó la firma.
    */
    transmittedAt = new Date();

    const transmission = await dteTransmissionService.transmitSignedDte({
      invoice,
      company: invoice.company,
      officialDteJson,
      signedJws: signed.signedJws
    });

    if (transmission.accepted) {
      await invoice.update({
        status: 'ACEPTADO',
        signedJws: signed.signedJws,
        signedAt: invoice.signedAt || new Date(),
        validationStatus: 'VALIDADO',
        validationErrorsJson: null,
        transmittedAt,
        acceptedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
        receptionSeal: transmission.receptionSeal,
        mhResponseJson: {
          modo: 'TRANSMISION_REAL',
          estado: transmission.estado,
          httpStatus: transmission.httpStatus,
          payload: transmission.payload,
          response: transmission.response,
          signerResponse: signed.signerResponse
        },
        mhObservationsJson: transmission.observations || null
      });

      return getInvoiceById(invoice.id, {
        user: currentUser
      });
    }

    const explicitValidationRejection = Boolean(
      transmission.rejected &&
      ['RECHAZADO', 'OBSERVADO'].includes(String(transmission.estado || '').toUpperCase()) &&
      Number(transmission.httpStatus || 0) >= 400 &&
      Number(transmission.httpStatus || 0) < 500
    );

    if (explicitValidationRejection) {
      // Hacienda confirmó que el DTE tiene errores de validación. El estado
      // operativo queda en GENERADO para corregirlo y retransmitirlo, sin
      // perder la respuesta devuelta por Hacienda.
      await invoice.update({
        status: 'GENERADO',
        signedJws: null,
        signedAt: null,
        validationStatus: 'ERROR',
        validationErrorsJson: transmission.response || null,
        transmittedAt,
        acceptedAt: null,
        rejectedAt: new Date(),
        receptionSeal: null,
        rejectionReason: transmission.rejectionReason || 'Hacienda rechazó el DTE',
        mhResponseJson: {
          modo: 'VALIDACION_HACIENDA_CON_ERRORES',
          estado: transmission.estado,
          httpStatus: transmission.httpStatus,
          payload: transmission.payload,
          response: transmission.response,
          signerResponse: signed.signerResponse
        },
        mhObservationsJson: transmission.observations || null
      });

      const error = new Error(transmission.rejectionReason || 'Hacienda rechazó el DTE');
      error.statusCode = 400;
      error.mhResponse = transmission.response;
      throw error;
    }

    // Si Hacienda no confirma aceptación ni rechazo de validación (por ejemplo,
    // HTTP 5xx), no se debe retransmitir a ciegas: podría haberlo recibido.
    await invoice.update({
      status: 'FIRMADO',
      validationStatus: 'ERROR',
      validationErrorsJson: transmission.response || null,
      transmittedAt,
      acceptedAt: null,
      receptionSeal: null,
      rejectionReason: transmission.rejectionReason || 'No se pudo confirmar el resultado de Hacienda',
      mhResponseJson: {
        modo: 'PENDIENTE_VERIFICACION_HACIENDA',
        estado: transmission.estado,
        httpStatus: transmission.httpStatus,
        payload: transmission.payload,
        response: transmission.response,
        signerResponse: signed.signerResponse
      },
      mhObservationsJson: transmission.observations || null
    });

    const error = new Error(
      transmission.rejectionReason ||
      'No se pudo confirmar el resultado de la transmisión con Hacienda'
    );
    error.statusCode = 502;
    error.transmissionPendingVerification = true;
    throw error;
  } catch (error) {
    // Estos casos ya fueron almacenados antes de lanzar el error.
    if (error.mhResponse || error.transmissionPendingVerification) {
      throw error;
    }

    // Un timeout o error de red tampoco permite confirmar si Hacienda recibió
    // el DTE. Se mantiene FIRMADO hasta verificar el resultado.
    if (error.haciendaResponse) {
      await invoice.update({
        status: 'FIRMADO',
        validationStatus: 'ERROR',
        validationErrorsJson: {
          message: error.message,
          haciendaResponse: error.haciendaResponse || null
        },
        transmittedAt,
        acceptedAt: null,
        receptionSeal: null,
        rejectionReason: error.message,
        mhResponseJson: {
          modo: 'PENDIENTE_VERIFICACION_HACIENDA',
          message: error.message,
          haciendaResponse: error.haciendaResponse || null
        },
        mhObservationsJson: null
      });

      throw error;
    }

    // Errores locales o del firmador: no hubo transmisión confirmada; el DTE
    // vuelve a GENERADO para corregirlo y firmarlo de nuevo.
    await invoice.update({
      status: 'GENERADO',
      signedJws: null,
      signedAt: null,
      validationStatus: 'ERROR',
      validationErrorsJson: {
        message: error.message,
        signerResponse: error.signerResponse || null
      },
      transmittedAt: null,
      acceptedAt: null,
      receptionSeal: null,
      rejectionReason: error.message,
      mhResponseJson: {
        modo: error.signerResponse ? 'ERROR_FIRMADOR' : 'ERROR_VALIDACION_LOCAL',
        message: error.message,
        signerResponse: error.signerResponse || null
      },
      mhObservationsJson: null
    });

    throw error;
  }
};

const synchronizeHistoricalInvoiceWithHacienda = async ({ id, user }) => {
  const currentUser = await resolveUserContext(user);

  if (!isAdminUser(currentUser)) {
    const error = new Error('Solo el Administrador puede sincronizar DTE históricos con Hacienda');
    error.statusCode = 403;
    throw error;
  }

  if (!currentUser.company) {
    const error = new Error('Seleccione el contribuyente al que pertenece el DTE');
    error.statusCode = 400;
    throw error;
  }

  const invoice = await Invoice.findOne({
    where: {
      id,
      companyId: currentUser.company.id
    },
    include: [
      {
        model: Company,
        as: 'company'
      },
      buildPointOfSaleInclude(),
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName', 'email']
      },
      {
        model: Customer,
        as: 'customer'
      },
      {
        model: InvoiceItem,
        as: 'items',
        include: [
          {
            model: Product,
            as: 'product'
          }
        ]
      }
    ]
  });

  await validateInvoiceVisibility({ invoice, user: currentUser });

  const historicalImport = await InvoiceImportArtifact.findOne({
    attributes: ['id', 'importedAt', 'sourceJsonName'],
    where: {
      companyId: currentUser.company.id,
      invoiceId: invoice.id
    }
  });

  if (!historicalImport) {
    const error = new Error('La sincronización manual está habilitada únicamente para DTE históricos importados');
    error.statusCode = 400;
    throw error;
  }

  if (invoice.status === 'ANULADO') {
    const error = new Error('Un DTE anulado no puede sincronizarse como aceptado');
    error.statusCode = 400;
    throw error;
  }

  if (invoice.status === 'ACEPTADO' && invoice.receptionSeal) {
    return getInvoiceById(invoice.id, { user: currentUser });
  }

  const consultation = await dteTransmissionService.consultDteInHacienda({
    invoice,
    company: invoice.company
  });

  if (!consultation.accepted || !consultation.receptionSeal) {
    const error = new Error(
      consultation.rejectionReason ||
      'Hacienda no confirmó que este DTE esté recibido y procesado. El documento no fue modificado ni retransmitido.'
    );
    error.statusCode = consultation.httpStatus && consultation.httpStatus < 500 ? 409 : 502;
    error.mhResponse = consultation.response || null;
    throw error;
  }

  const processedAt = parseHaciendaProcessingDate(consultation.processingDate);
  const previousMhResponse = invoice.mhResponseJson || null;

  await invoice.update({
    status: 'ACEPTADO',
    validationStatus: 'VALIDADO',
    validationErrorsJson: null,
    receptionSeal: consultation.receptionSeal,
    acceptedAt: processedAt || invoice.acceptedAt || null,
    rejectedAt: null,
    rejectionReason: null,
    mhResponseJson: {
      modo: 'SINCRONIZACION_HISTORICO_CON_HACIENDA',
      sincronizadoEn: new Date().toISOString(),
      importArtifactId: historicalImport.id,
      sourceJsonName: historicalImport.sourceJsonName || null,
      payload: consultation.payload,
      response: consultation.response,
      respuestaAnterior: previousMhResponse
    },
    mhObservationsJson: consultation.observations || null
  });

  return getInvoiceById(invoice.id, { user: currentUser });
};

const invalidateInvoiceReal = async ({ id, user, reason }) => {
  const currentUser = await resolveUserContext(user);

  const invoice = await Invoice.findOne({
    where: { id, companyId: currentUser.company.id },
    include: [
      {
        model: Company,
        as: 'company'
      },
      buildPointOfSaleInclude(),
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'firstName', 'lastName', 'email']
      },
      {
        model: Customer,
        as: 'customer'
      },
      {
        model: InvoiceItem,
        as: 'items',
        include: [
          {
            model: Product,
            as: 'product'
          }
        ]
      }
    ]
  });

  await validateInvoiceVisibility({
    invoice,
    user: currentUser
  });

  if (invoice.status !== 'ACEPTADO') {
    const error = new Error('Solo se pueden anular documentos aceptados por Hacienda');
    error.statusCode = 400;
    throw error;
  }

  if (!invoice.receptionSeal) {
    const error = new Error('No se puede anular oficialmente un DTE sin sello de recepción');
    error.statusCode = 400;
    throw error;
  }

  if (!reason || !reason.trim()) {
    const error = new Error('Debe indicar el motivo de anulación del DTE');
    error.statusCode = 400;
    throw error;
  }

  const deadlineValidation = invalidationDeadlineService.validateInvalidationDeadline(invoice);
  const invalidatedAt = new Date();
  const invalidationGenerationCode = uuidv4().toUpperCase();
  const cleanReason = reason.trim();

  invoice.set({
    invalidatedAt,
    invalidationReason: cleanReason,
    invalidationGenerationCode,
    invalidationDeadlineAt: deadlineValidation.deadlineAt
  });

  const dteJsonService = require('../dte/dte-json.service');

  const officialInvalidationJson = dteJsonService.buildOfficialInvalidationJson(invoice);

  try {
    const signed = await dteSignerService.signDteJson({
      company: invoice.company,
      nit: invoice.company.nit,
      dteJson: officialInvalidationJson
    });

    const transmission = await dteTransmissionService.transmitSignedInvalidation({
      invoice,
      company: invoice.company,
      officialInvalidationJson,
      signedJws: signed.signedJws
    });

    if (transmission.accepted) {
      await invoice.update({
        status: 'ANULADO',
        invalidatedAt,
        invalidationReason: cleanReason,
        invalidationReceptionSeal: transmission.receptionSeal,
        invalidationGenerationCode,
        invalidationDeadlineAt: deadlineValidation.deadlineAt,
        invalidationSignedJws: signed.signedJws,
        invalidationSignedAt: new Date(),
        invalidationResponseJson: {
          modo: 'ANULACION_REAL',
          estado: transmission.estado,
          httpStatus: transmission.httpStatus,
          payload: transmission.payload,
          response: transmission.response,
          signerResponse: signed.signerResponse
        },
        invalidationObservationsJson: transmission.observations || null,
        rejectionReason: null
      });

      return getInvoiceById(invoice.id, {
        user: currentUser
      });
    }

    await invoice.update({
      invalidationReason: cleanReason,
      invalidationGenerationCode,
      invalidationDeadlineAt: deadlineValidation.deadlineAt,
      invalidationSignedJws: signed.signedJws,
      invalidationSignedAt: new Date(),
      invalidationResponseJson: {
        modo: 'ANULACION_REAL_RECHAZADA',
        estado: transmission.estado,
        httpStatus: transmission.httpStatus,
        payload: transmission.payload,
        response: transmission.response,
        signerResponse: signed.signerResponse
      },
      invalidationObservationsJson: transmission.observations || null
    });

    const error = new Error(transmission.rejectionReason || 'Hacienda rechazó la anulación');
    error.statusCode = 400;
    error.mhResponse = transmission.response;
    throw error;
  } catch (error) {
    if (!error.mhResponse && !error.signerResponse) {
      await invoice.update({
        invalidationReason: cleanReason,
        invalidationGenerationCode,
        invalidationDeadlineAt: deadlineValidation.deadlineAt,
        invalidationResponseJson: {
          modo: 'ERROR_ANULACION_REAL',
          message: error.message
        },
        invalidationObservationsJson: null
      });
    } else if (error.signerResponse) {
      await invoice.update({
        invalidationReason: cleanReason,
        invalidationGenerationCode,
        invalidationDeadlineAt: deadlineValidation.deadlineAt,
        invalidationResponseJson: {
          modo: 'ERROR_FIRMADOR_ANULACION',
          message: error.message,
          signerResponse: error.signerResponse
        },
        invalidationObservationsJson: null
      });
    }

    throw error;
  }
};

module.exports = {
  createGeneratedInvoice,
  updateGeneratedInvoice,
  listInvoices,
  getInvoiceById,
  getDashboardSummary,
  listAvailableDocumentsForCreditNote,
  transmitInvoiceToHaciendaReal,
  synchronizeHistoricalInvoiceWithHacienda,
  invalidateInvoiceReal
};