'use strict';

/*
  Utilidades para seeds masivas de DTE en ambiente de PRUEBAS.

  Estas seeds no crean empresas, usuarios, establecimientos ni puntos de venta.
  El emisor se resuelve de forma segura por NIT + usuario facturador configurados
  en variables de entorno.
*/

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

const loadEnvironment = () => {
  // Dentro de Docker las variables ya están disponibles. Para ejecución local,
  // se toma primero el .env de la raíz del proyecto.
  const rootEnvPath = path.resolve(__dirname, '../../../.env');

  if (fs.existsSync(rootEnvPath)) {
    require('dotenv').config({ path: rootEnvPath, quiet: true });
  }

  require('dotenv').config({ quiet: true });
};

loadEnvironment();

const { sequelize } = require('../../src/config/database');
const loadModels = require('../../src/config/models');

const User = require('../../src/modules/users/user.model');
const Role = require('../../src/modules/users/role.model');
const Company = require('../../src/modules/companies/company.model');
const Establishment = require('../../src/modules/companies/establishment.model');
const PointOfSale = require('../../src/modules/companies/point-of-sale.model');
const Customer = require('../../src/modules/customers/customer.model');
const Invoice = require('../../src/modules/invoices/invoice.model');
const InvoiceItem = require('../../src/modules/invoices/invoice-item.model');

const invoicesService = require('../../src/modules/invoices/invoices.service');
const dteJsonService = require('../../src/modules/dte/dte-json.service');
const emailsService = require('../../src/modules/emails/emails.service');
const EmailLog = require('../../src/modules/emails/email-log.model');

const TARGETS = Object.freeze({
  '01': 90,
  '11': 90,
  '03': 75,
  '14': 25,
  '05': 50
});

const BASE_DOCUMENT_TYPES = Object.freeze(['01', '03', '11', '14']);
const CREDIT_NOTE_DOCUMENT_TYPE = '05';
const DEFAULT_ESTABLISHMENT_CODE = 'M001';
const DEFAULT_POINT_OF_SALE_CODE = 'P001';

const CUSTOMER_KEYS = Object.freeze({
  CONSUMER_FINAL: 'consumerFinal',
  CARLOS: 'carlos',
  EXCLUDED_SUBJECT: 'excludedSubject'
});

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const normalizeKey = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '-')
  .replace(/[^A-Z0-9_-]/g, '');

const getRequiredEnvironmentValue = (name) => {
  const value = String(process.env[name] || '').trim();

  if (!value) {
    throw new Error(`Falta la variable obligatoria ${name}.`);
  }

  return value;
};

const getOptionalEnvironmentValue = (name) => {
  const value = String(process.env[name] || '').trim();

  return value || null;
};

const getBooleanEnvironmentValue = (name, defaultValue = false) => {
  const rawValue = String(process.env[name] ?? '').trim().toLowerCase();

  if (!rawValue) {
    return defaultValue;
  }

  if (['true', '1', 'yes', 'si', 'sí'].includes(rawValue)) {
    return true;
  }

  if (['false', '0', 'no'].includes(rawValue)) {
    return false;
  }

  throw new Error(`${name} debe ser true o false.`);
};

const getNonNegativeIntegerEnvironmentValue = (name, defaultValue) => {
  const rawValue = String(process.env[name] ?? '').trim();

  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} debe ser un entero mayor o igual a cero.`);
  }

  return parsed;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const getSeedConfig = () => {
  const emitterIdentifier = normalizeDigits(getRequiredEnvironmentValue('SEED_EMISOR_NIT'));
  const username = getRequiredEnvironmentValue('SEED_FACTURADOR_USERNAME');
  const batchKey = normalizeKey(getRequiredEnvironmentValue('SEED_BATCH_KEY'));
  const establishmentCode = String(
    process.env.SEED_ESTABLISHMENT_CODE || DEFAULT_ESTABLISHMENT_CODE
  ).trim().toUpperCase();
  const pointOfSaleCode = String(
    process.env.SEED_POINT_OF_SALE_CODE || DEFAULT_POINT_OF_SALE_CODE
  ).trim().toUpperCase();

  const autoTransmit = getBooleanEnvironmentValue('SEED_AUTO_TRANSMIT', false);
  const autoEmail = getBooleanEnvironmentValue('SEED_AUTO_EMAIL', false);
  const defaultRecipient = normalizeEmail(getOptionalEnvironmentValue('SEED_EMAIL_DEFAULT'));

  if (autoEmail && !autoTransmit) {
    throw new Error(
      'SEED_AUTO_EMAIL=true requiere SEED_AUTO_TRANSMIT=true. Solo se envían por correo DTE aceptados por Hacienda.'
    );
  }

  if (![9, 14].includes(emitterIdentifier.length)) {
  throw new Error(
    'SEED_EMISOR_NIT debe contener 14 dígitos si el emisor usa NIT o 9 dígitos si usa DUI.'
  );
}

  if (!/^[A-Z0-9_-]{3,50}$/.test(batchKey)) {
    throw new Error(
      'SEED_BATCH_KEY solo admite letras, números, guion y guion bajo; longitud de 3 a 50 caracteres.'
    );
  }

  if (!establishmentCode || !pointOfSaleCode) {
    throw new Error('SEED_ESTABLISHMENT_CODE y SEED_POINT_OF_SALE_CODE no pueden estar vacíos.');
  }

  const emailRecipients = {
    [CUSTOMER_KEYS.CONSUMER_FINAL]: normalizeEmail(
      getOptionalEnvironmentValue('SEED_EMAIL_CONSUMER_FINAL') || defaultRecipient
    ),
    [CUSTOMER_KEYS.CARLOS]: normalizeEmail(
      getOptionalEnvironmentValue('SEED_EMAIL_CARLOS') || defaultRecipient
    ),
    [CUSTOMER_KEYS.EXCLUDED_SUBJECT]: normalizeEmail(
      getOptionalEnvironmentValue('SEED_EMAIL_EXCLUDED_SUBJECT') || defaultRecipient
    )
  };

  return {
    emitterIdentifier,
    username,
    batchKey,
    establishmentCode,
    pointOfSaleCode,
    autoTransmit,
    autoEmail,
    emailRecipients,
    transmitDelayMs: getNonNegativeIntegerEnvironmentValue('SEED_TRANSMIT_DELAY_MS', 1000),
    emailDelayMs: getNonNegativeIntegerEnvironmentValue('SEED_EMAIL_DELAY_MS', 500),
    stopOnError: getBooleanEnvironmentValue('SEED_STOP_ON_ERROR', true)
  };
};

const assertConfirmed = (variableName) => {
  const confirmed = String(process.env[variableName] || 'false').toLowerCase() === 'true';

  if (!confirmed) {
    throw new Error(`Protección activa. Ejecute con ${variableName}=true.`);
  }
};

const assertTestEnvironment = () => {
  if (String(process.env.MH_ENV || '').trim().toUpperCase() !== 'TEST') {
    throw new Error('Estas seeds solo se pueden ejecutar cuando MH_ENV=TEST.');
  }
};

const getTodayInAppTimezone = () => {
  const timeZone = process.env.APP_TIMEZONE || 'America/El_Salvador';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const getPart = (type) => parts.find((part) => part.type === type)?.value;

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

const assertNonEmpty = (value, label) => {
  if (!String(value || '').trim()) {
    throw new Error(
      `Falta ${label} en la empresa emisora. Corrija la empresa antes de ejecutar la seed.`
    );
  }
};

const parseAllowedDocumentTypes = (value) => {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
      return [];
    }
  }

  return [];
};

const initializeModelsAndDatabase = async () => {
  loadEnvironment();
  loadModels();
  await sequelize.authenticate();
};

const closeDatabase = async () => {
  await sequelize.close();
};

const resolveOperationalContext = async () => {
  const config = getSeedConfig();

  const user = await User.findOne({
    where: {
      username: config.username,
      isActive: true
    },
    include: [
      {
        model: Role,
        as: 'roles',
        required: true,
        through: { attributes: [] }
      },
      {
        model: PointOfSale,
        as: 'pointOfSale',
        required: true,
        include: [
          {
            model: Company,
            as: 'company',
            required: true
          },
          {
            model: Establishment,
            as: 'establishment',
            required: true
          }
        ]
      }
    ]
  });

  if (!user) {
    throw new Error(
      `No se encontró un usuario activo con username "${config.username}" y punto de venta asignado.`
    );
  }

  const company = user.pointOfSale.company;
  const establishment = user.pointOfSale.establishment;
  const pointOfSale = user.pointOfSale;
  const roleCodes = (user.roles || []).map((role) => String(role.code).toUpperCase());

  if (!roleCodes.includes('FACTURADOR')) {
    throw new Error(`El usuario ${config.username} debe tener el rol FACTURADOR.`);
  }

  if (!company.isActive) {
    throw new Error('La empresa emisora está inactiva.');
  }

  if (!establishment.isActive) {
    throw new Error('El establecimiento asignado al usuario está inactivo.');
  }

  if (!pointOfSale.isActive) {
    throw new Error('El punto de venta asignado al usuario está inactivo.');
  }

  if (normalizeDigits(company.nit) !== config.emitterIdentifier) {
  throw new Error(
    `El usuario ${config.username} pertenece al identificador ${company.nit}, no al valor configurado en SEED_EMISOR_NIT.`
  );
}

  if (String(establishment.establishmentCode).toUpperCase() !== config.establishmentCode) {
    throw new Error(
      `El usuario está asignado al establecimiento ${establishment.establishmentCode}; se esperaba ${config.establishmentCode}.`
    );
  }

  if (String(pointOfSale.code).toUpperCase() !== config.pointOfSaleCode) {
    throw new Error(
      `El usuario está asignado al punto de venta ${pointOfSale.code}; se esperaba ${config.pointOfSaleCode}.`
    );
  }

  if (String(company.environment).toUpperCase() !== 'TEST') {
    throw new Error('La empresa emisora debe estar configurada en ambiente TEST.');
  }

  [
    ['NIT', company.nit],
    ['NRC', company.nrc],
    ['razón social', company.legalName],
    ['actividad económica principal', company.economicActivityCode],
    ['descripción de actividad económica', company.economicActivityName],
    ['teléfono', company.phone],
    ['correo', company.email],
    ['departamento', company.departmentCode],
    ['municipio', company.municipalityCode],
    ['dirección', company.addressComplement]
  ].forEach(([label, value]) => assertNonEmpty(value, label));

  return {
    config,
    user,
    company,
    establishment,
    pointOfSale,
    roleCodes
  };
};

const ensureCompanyDocumentTypes = async ({ company, documentTypes }) => {
  const currentTypes = parseAllowedDocumentTypes(company.allowedDocumentTypes);
  const mergedTypes = [...new Set([...currentTypes, ...documentTypes.map(String)])];

  if (mergedTypes.length !== currentTypes.length) {
    await company.update({ allowedDocumentTypes: mergedTypes });
    console.log(`✓ Tipos de DTE habilitados: ${mergedTypes.join(', ')}`);
  }

  return mergedTypes;
};

const getCustomerByDocument = async ({ establishmentId, documentType, documentNumber }) => {
  const expectedDocument = normalizeDigits(documentNumber);
  const customers = await Customer.findAll({
    where: {
      establishmentId,
      documentType
    }
  });

  return customers.find((customer) => (
    normalizeDigits(customer.documentNumber) === expectedDocument
  )) || null;
};

const ensureCustomer = async ({ establishmentId, values }) => {
  let customer = null;

  if (values.documentType === 'SIN_DOCUMENTO') {
    customer = await Customer.findOne({
      where: {
        establishmentId,
        customerType: values.customerType,
        documentType: 'SIN_DOCUMENTO',
        documentNumber: null,
        name: values.name
      }
    });
  } else {
    customer = await getCustomerByDocument({
      establishmentId,
      documentType: values.documentType,
      documentNumber: values.documentNumber
    });
  }

  if (customer) {
    await customer.update({
      establishmentId,
      ...values
    });
    return customer;
  }

  return Customer.create({
    establishmentId,
    ...values
  });
};

const getSeedCustomerEmail = ({ config, customerKey, fallback = null }) => {
  const configuredRecipient = normalizeEmail(config?.emailRecipients?.[customerKey]);
  const fallbackRecipient = normalizeEmail(fallback);

  if (config?.autoEmail) {
    if (!configuredRecipient || !isValidEmail(configuredRecipient)) {
      throw new Error(
        `Falta un correo válido para el cliente de seed "${customerKey}". Configure SEED_EMAIL_${customerKey === CUSTOMER_KEYS.CONSUMER_FINAL ? 'CONSUMER_FINAL' : customerKey === CUSTOMER_KEYS.CARLOS ? 'CARLOS' : 'EXCLUDED_SUBJECT'} o SEED_EMAIL_DEFAULT.`
      );
    }

    return configuredRecipient;
  }

  return configuredRecipient || fallbackRecipient || null;
};

const ensureSeedCustomers = async ({ establishmentId, only = null, config = null }) => {
  const data = {
    [CUSTOMER_KEYS.CARLOS]: {
      customerType: 'CONTRIBUYENTE',
      documentType: 'NIT',
      documentNumber: '01082602751023',
      nrc: '1629370',
      name: 'CARLOS HUMBERTO LEMUS CANO',
      commercialName: 'CARLOS HUMBERTO LEMUS CANO',
      economicActivityCode: '46211',
      economicActivityName: 'Venta de productos para uso agropecuario',
      secondaryEconomicActivityCode: '96092',
      secondaryEconomicActivityName: 'Servicios n.c.p.',
      tertiaryEconomicActivityCode: '49232',
      tertiaryEconomicActivityName: 'Transporte nacional de carga',
      email: getSeedCustomerEmail({
        config,
        customerKey: CUSTOMER_KEYS.CARLOS,
        fallback: 'carlos20zelidon06@gmail.com'
      }),
      phone: null,
      phoneCountryCode: 'SV',
      phoneDialCode: '503',
      phoneNationalNumber: null,
      departmentCode: '03',
      departmentName: 'Sonsonate',
      districtName: 'Sonsonate',
      municipalityCode: '0301',
      municipalityName: 'Sonsonate Centro',
      addressComplement: 'RESIDENCIAL EL PROGRESO 2, SENDA LAS GAVIOTAS, CASA #9, SONSONATE, SONSONATE, SONSONATE CENTRO',
      // Al quedar nulo, el módulo de exportación usa el valor fiscal 9300 / EL SALVADOR.
      countryCode: null,
      isActive: true
    },
    [CUSTOMER_KEYS.CONSUMER_FINAL]: {
      customerType: 'CONSUMIDOR_FINAL',
      documentType: 'SIN_DOCUMENTO',
      documentNumber: null,
      nrc: null,
      name: 'CONSUMIDOR FINAL - SEED PRUEBAS',
      commercialName: null,
      economicActivityCode: null,
      economicActivityName: null,
      secondaryEconomicActivityCode: null,
      secondaryEconomicActivityName: null,
      tertiaryEconomicActivityCode: null,
      tertiaryEconomicActivityName: null,
      email: getSeedCustomerEmail({
        config,
        customerKey: CUSTOMER_KEYS.CONSUMER_FINAL
      }),
      phone: null,
      phoneCountryCode: 'SV',
      phoneDialCode: '503',
      phoneNationalNumber: null,
      departmentCode: '03',
      departmentName: 'Sonsonate',
      districtName: 'Sonsonate',
      municipalityCode: '0301',
      municipalityName: 'Sonsonate Centro',
      addressComplement: 'RESIDENCIAL EL PROGRESO 2, SENDA LAS GAVIOTAS, CASA #9, SONSONATE, SONSONATE, SONSONATE CENTRO',
      countryCode: null,
      isActive: true
    },
    [CUSTOMER_KEYS.EXCLUDED_SUBJECT]: {
      customerType: 'SUJETO_EXCLUIDO',
      documentType: 'DUI',
      // Se guarda en dígitos. El generador JSON del proyecto aplica el formato requerido al transmitir.
      documentNumber: '067097077',
      nrc: null,
      name: 'CARLOS ZELIDON',
      commercialName: null,
      economicActivityCode: '96092',
      economicActivityName: 'Servicios n.c.p.',
      secondaryEconomicActivityCode: null,
      secondaryEconomicActivityName: null,
      tertiaryEconomicActivityCode: null,
      tertiaryEconomicActivityName: null,
      email: getSeedCustomerEmail({
        config,
        customerKey: CUSTOMER_KEYS.EXCLUDED_SUBJECT,
        fallback: 'sujeto.excluido.pruebas@example.com'
      }),
      phone: '70000000',
      phoneCountryCode: 'SV',
      phoneDialCode: '503',
      phoneNationalNumber: '70000000',
      departmentCode: '03',
      departmentName: 'Sonsonate',
      districtName: 'Sonsonate',
      municipalityCode: '0301',
      municipalityName: 'Sonsonate Centro',
      addressComplement: 'SONSONATE, SONSONATE, SONSONATE CENTRO',
      countryCode: 'SV',
      isActive: true
    }
  };

  const keys = only ? [only] : Object.keys(data);
  const customers = {};

  for (const key of keys) {
    if (!data[key]) {
      throw new Error(`No existe configuración de cliente para la clave ${key}.`);
    }

    customers[key] = await ensureCustomer({
      establishmentId,
      values: data[key]
    });
  }

  return customers;
};

const buildItems = ({ documentTypeCode, ordinal }) => {
  const serial = String(ordinal).padStart(3, '0');
  const configurations = {
    '01': {
      prices: [5.65, 8.48, 11.30, 16.95, 22.60, 28.25, 33.90, 45.20, 56.50, 67.80],
      code: `SEED-FCF-${serial}`,
      description: `Servicio de prueba para Factura de Consumidor Final ${serial}`
    },
    '03': {
      prices: [25, 30, 35, 40, 45, 50, 60, 75, 90, 100],
      code: `SEED-CCF-${serial}`,
      description: `Servicio gravado de prueba para Comprobante de Crédito Fiscal ${serial}`
    },
    '11': {
      prices: [100, 125, 150, 175, 200, 225, 250, 275, 300, 325],
      code: `SEED-EXP-${serial}`,
      description: `Servicio de prueba para Factura de Exportación ${serial}`
    },
    '14': {
      prices: [12, 15, 18, 20, 25],
      code: `SEED-FSEE-${serial}`,
      description: `Servicio adquirido a sujeto excluido para prueba ${serial}`
    }
  };

  const configuration = configurations[String(documentTypeCode)];

  if (!configuration) {
    throw new Error(`No existe configuración de ítems para el tipo ${documentTypeCode}.`);
  }

  return [{
    productId: null,
    itemType: 'SERVICIO',
    code: configuration.code,
    description: configuration.description,
    unitOfMeasure: '59',
    unitOfMeasureName: 'Unidad',
    saleType: 'GRAVADA',
    quantity: 1,
    unitPrice: configuration.prices[(ordinal - 1) % configuration.prices.length],
    retention1: 0,
    fovial: 0,
    cotrans: 0
  }];
};

const buildCreditNoteItems = (sourceItems = []) => {
  if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
    throw new Error('El CCF relacionado no tiene ítems para crear la Nota de Crédito.');
  }

  return sourceItems.map((item) => ({
    // No se referencia producto para evitar un nuevo descuento de inventario.
    productId: null,
    itemType: item.itemType || 'SERVICIO',
    code: item.code || null,
    description: `Reversión total: ${String(item.description || '').trim()}`.slice(0, 500),
    unitOfMeasure: item.unitOfMeasure || '59',
    unitOfMeasureName: item.unitOfMeasureName || 'Unidad',
    saleType: item.saleType || 'GRAVADA',
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    retention1: Number(item.retention1 || 0),
    fovial: Number(item.fovial || 0),
    cotrans: Number(item.cotrans || 0)
  }));
};

const assertNoUndefined = (value, pathName = 'DTE') => {
  if (value === undefined) {
    throw new Error(`${pathName} contiene un valor undefined; la seed se detuvo por seguridad.`);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefined(item, `${pathName}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, currentValue]) => {
      assertNoUndefined(currentValue, `${pathName}.${key}`);
    });
  }
};

const dateOnlyUtc = (value) => new Date(value).toISOString().slice(0, 10);

const assertOfficialJson = ({ invoice, issuedAtDate, relatedInvoice = null }) => {
  if (relatedInvoice) {
    invoice.setDataValue?.('relatedInvoice', relatedInvoice);
    invoice.relatedInvoice = relatedInvoice;
  }

  const officialJson = dteJsonService.buildOfficialStandardDteJson(invoice);

  assertNoUndefined(officialJson);

  if (officialJson.identificacion?.fecEmi !== issuedAtDate) {
    throw new Error(
      `El DTE ${invoice.controlNumber} quedó con fecha ${officialJson.identificacion?.fecEmi || 'vacía'}, no con ${issuedAtDate}.`
    );
  }

  if (String(officialJson.identificacion?.tipoDte) !== String(invoice.documentTypeCode)) {
    throw new Error(`El DTE ${invoice.controlNumber} no conserva su tipo correcto en el JSON oficial.`);
  }

  if (!Array.isArray(officialJson.cuerpoDocumento) || officialJson.cuerpoDocumento.length === 0) {
    throw new Error(`El DTE ${invoice.controlNumber} no tiene cuerpo de documento válido.`);
  }

  if (Number(invoice.total || 0) <= 0) {
    throw new Error(`El DTE ${invoice.controlNumber} quedó con total no válido.`);
  }

  if (String(invoice.documentTypeCode) === CREDIT_NOTE_DOCUMENT_TYPE && relatedInvoice) {
    const relatedDate = officialJson.documentoRelacionado?.[0]?.fechaEmision;
    const sourceDate =
      dteJsonService.resolveInvoiceEmissionDateForDocumentRelated?.(relatedInvoice) ||
      dateOnlyUtc(relatedInvoice.issuedAt);

    if (relatedDate !== sourceDate) {
      throw new Error(
        `La Nota de Crédito ${invoice.controlNumber} no conservó la fecha oficial del CCF relacionado (${sourceDate}).`
      );
    }
  }

  return officialJson;
};

const createSeedInvoice = async ({
  user,
  roleCodes,
  documentTypeCode,
  customerId = null,
  relatedInvoice = null,
  issuedAtDate,
  notes,
  ordinal,
  items = null
}) => {
  const data = {
    documentTypeCode,
    issuedAtDate,
    operationCondition: 'CONTADO',
    paymentMethod: 'EFECTIVO',
    notes,
    items: items || buildItems({ documentTypeCode, ordinal })
  };

  if (String(documentTypeCode) === CREDIT_NOTE_DOCUMENT_TYPE) {
    if (!relatedInvoice?.id) {
      throw new Error('La Nota de Crédito requiere un CCF relacionado.');
    }

    data.relatedInvoiceId = relatedInvoice.id;
  } else {
    data.customerId = customerId;
  }

  const invoice = await invoicesService.createGeneratedInvoice({
    data,
    user: {
      id: user.id,
      roles: roleCodes
    }
  });

  if (invoice.status !== 'GENERADO') {
    throw new Error(`El DTE ${invoice.controlNumber} no quedó en estado GENERADO.`);
  }

  assertOfficialJson({ invoice, issuedAtDate, relatedInvoice });

  return invoice;
};

const sleep = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const buildSeedExecutionUser = ({ user, roleCodes }) => ({
  id: user.id,
  roles: roleCodes
});

const assertAutoProcessingConfiguration = ({ config, customerKey }) => {
  if (!config.autoTransmit) {
    return;
  }

  if (!config.autoEmail) {
    return;
  }

  getSeedCustomerEmail({
    config,
    customerKey
  });
};

const getSeedRecipient = ({ config, customerKey }) => {
  const recipient = getSeedCustomerEmail({
    config,
    customerKey
  });

  if (!recipient || !isValidEmail(recipient)) {
    throw new Error(
      `No existe un correo válido para el cliente de seed "${customerKey}".`
    );
  }

  return recipient;
};

const hasSuccessfulEmailForRecipient = async ({ invoiceId, recipient }) => {
  const emailLog = await EmailLog.findOne({
    where: {
      invoiceId,
      toEmail: recipient,
      status: 'ENVIADO'
    },
    order: [['id', 'DESC']]
  });

  return Boolean(emailLog);
};

const transmitAndEmailSeedInvoice = async ({
  invoice,
  user,
  roleCodes,
  config,
  customerKey
}) => {
  const executionUser = buildSeedExecutionUser({ user, roleCodes });
  let currentInvoice = invoice;
  let transmitted = false;
  let emailed = false;
  let emailSkipped = false;

  if (currentInvoice.status === 'ACEPTADO') {
    // El documento ya fue aceptado en una ejecución anterior. No se transmite otra vez.
  } else if (currentInvoice.status === 'GENERADO') {
    currentInvoice = await invoicesService.transmitInvoiceToHaciendaReal({
      id: currentInvoice.id,
      user: executionUser
    });

    transmitted = true;

    if (Number(config.transmitDelayMs) > 0) {
      await sleep(Number(config.transmitDelayMs));
    }
  } else if (currentInvoice.status === 'RECHAZADO') {
    throw new Error(
      `El DTE ${currentInvoice.controlNumber} está RECHAZADO. Corrija la observación de Hacienda manualmente antes de volver a ejecutar la seed.`
    );
  } else if (currentInvoice.status === 'FIRMADO' || currentInvoice.status === 'TRANSMITIDO') {
    throw new Error(
      `El DTE ${currentInvoice.controlNumber} está ${currentInvoice.status}. No se retransmite automáticamente porque requiere verificación manual con Hacienda.`
    );
  } else {
    throw new Error(
      `El DTE ${currentInvoice.controlNumber} tiene estado no compatible con la transmisión automática: ${currentInvoice.status}.`
    );
  }

  if (currentInvoice.status !== 'ACEPTADO' || !currentInvoice.receptionSeal) {
    throw new Error(
      `Hacienda no confirmó la aceptación del DTE ${currentInvoice.controlNumber}. Estado actual: ${currentInvoice.status}.`
    );
  }

  if (!config.autoEmail) {
    return {
      invoice: currentInvoice,
      transmitted,
      emailed,
      emailSkipped
    };
  }

  const recipient = getSeedRecipient({ config, customerKey });
  const alreadySent = await hasSuccessfulEmailForRecipient({
    invoiceId: currentInvoice.id,
    recipient
  });

  if (alreadySent) {
    emailSkipped = true;
  } else {
    await emailsService.sendInvoiceEmail({
      id: currentInvoice.id,
      user: executionUser,
      to: recipient
    });

    emailed = true;

    if (Number(config.emailDelayMs) > 0) {
      await sleep(Number(config.emailDelayMs));
    }
  }

  return {
    invoice: currentInvoice,
    transmitted,
    emailed,
    emailSkipped
  };
};

const processSeedInvoices = async ({
  invoices,
  user,
  roleCodes,
  config,
  customerKey,
  label
}) => {
  if (!config.autoTransmit) {
    return {
      total: invoices.length,
      accepted: invoices.filter((invoice) => invoice.status === 'ACEPTADO').length,
      transmitted: 0,
      emailed: 0,
      emailsSkipped: 0,
      errors: []
    };
  }

  assertAutoProcessingConfiguration({ config, customerKey });

  const summary = {
    total: invoices.length,
    accepted: 0,
    transmitted: 0,
    emailed: 0,
    emailsSkipped: 0,
    errors: []
  };

  console.log(
    `Transmitiendo automáticamente ${invoices.length} ${label} a Hacienda${config.autoEmail ? ' y enviando correos' : ''}.`
  );

  for (let index = 0; index < invoices.length; index += 1) {
    const invoice = invoices[index];

    try {
      const result = await transmitAndEmailSeedInvoice({
        invoice,
        user,
        roleCodes,
        config,
        customerKey
      });

      if (result.invoice.status === 'ACEPTADO') {
        summary.accepted += 1;
      }

      if (result.transmitted) {
        summary.transmitted += 1;
      }

      if (result.emailed) {
        summary.emailed += 1;
      }

      if (result.emailSkipped) {
        summary.emailsSkipped += 1;
      }

      const progress = index + 1;
      if (progress % 10 === 0 || progress === invoices.length) {
        console.log(
          `  ${label}: ${progress}/${invoices.length} | aceptados: ${summary.accepted} | correos enviados: ${summary.emailed}`
        );
      }
    } catch (error) {
      const itemError = {
        invoiceId: invoice.id,
        controlNumber: invoice.controlNumber,
        message: error.message
      };

      summary.errors.push(itemError);

      console.error(
        `  ✗ ${label} | DTE ${invoice.controlNumber || invoice.id}: ${error.message}`
      );

      if (config.stopOnError) {
        throw error;
      }
    }
  }

  if (summary.errors.length > 0) {
    throw new Error(
      `La seed de ${label} terminó con ${summary.errors.length} error(es). Revise los mensajes anteriores antes de reintentar.`
    );
  }

  return summary;
};

const getSeedMarker = ({ batchKey, documentTypeCode }) => (
  `SEED-MASIVO-${batchKey}-${String(documentTypeCode).padStart(2, '0')}`
);

const getSeedNote = ({ batchKey, documentTypeCode, ordinal }) => (
  `${getSeedMarker({ batchKey, documentTypeCode })}-${String(ordinal).padStart(3, '0')} | SOLO PRUEBAS`
);

const getSeedInvoicesByMarker = async ({ companyId, documentTypeCode, batchKey }) => {
  const marker = getSeedMarker({ batchKey, documentTypeCode });

  return Invoice.findAll({
    where: {
      companyId,
      documentTypeCode: String(documentTypeCode),
      notes: {
        [Op.like]: `${marker}-%`
      }
    },
    order: [['id', 'ASC']]
  });
};

const getExistingSeedOrdinals = ({ invoices, batchKey, documentTypeCode, target }) => {
  const marker = getSeedMarker({ batchKey, documentTypeCode });
  const expression = new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{3})(?:\\s|\\||$)`);
  const ordinals = new Set();

  for (const invoice of invoices) {
    const match = String(invoice.notes || '').match(expression);

    if (!match) {
      throw new Error(
        `El DTE ${invoice.controlNumber} tiene una nota de seed inválida: ${invoice.notes}`
      );
    }

    const ordinal = Number(match[1]);

    if (ordinal < 1 || ordinal > target) {
      throw new Error(
        `El ordinal ${ordinal} de ${invoice.controlNumber} está fuera de la meta ${target}.`
      );
    }

    if (ordinals.has(ordinal)) {
      throw new Error(
        `Existe más de un DTE con ordinal ${ordinal} para ${marker}. Corrija duplicados antes de continuar.`
      );
    }

    ordinals.add(ordinal);
  }

  return ordinals;
};

const runSingleDocumentSeed = async ({
  confirmationVariable,
  documentTypeCode,
  label,
  target,
  customerKey
}) => {
  assertConfirmed(confirmationVariable);
  assertTestEnvironment();
  await initializeModelsAndDatabase();

  const issuedAtDate = getTodayInAppTimezone();
  const context = await resolveOperationalContext();
  const { config, user, company, establishment, roleCodes } = context;

  assertAutoProcessingConfiguration({ config, customerKey });

  await ensureCompanyDocumentTypes({
    company,
    documentTypes: [documentTypeCode]
  });

  const customers = await ensureSeedCustomers({
    establishmentId: establishment.id,
    only: customerKey,
    config
  });

  const existingInvoices = await getSeedInvoicesByMarker({
    companyId: company.id,
    documentTypeCode,
    batchKey: config.batchKey
  });

  if (existingInvoices.length > target) {
    throw new Error(
      `Existen ${existingInvoices.length} ${label} para esta seed; la meta es ${target}.`
    );
  }

  const existingOrdinals = getExistingSeedOrdinals({
    invoices: existingInvoices,
    batchKey: config.batchKey,
    documentTypeCode,
    target
  });

  const missingOrdinals = [];
  for (let ordinal = 1; ordinal <= target; ordinal += 1) {
    if (!existingOrdinals.has(ordinal)) {
      missingOrdinals.push(ordinal);
    }
  }

  console.log(`Empresa: ${company.legalName} | NIT: ${company.nit}`);
  console.log(`Usuario/POS: ${user.username} | ${establishment.establishmentCode}/${context.pointOfSale.code}`);
  console.log(`Fecha de emisión: ${issuedAtDate}`);

  if (missingOrdinals.length === 0) {
    console.log(
      `No se crearán nuevos ${label}: ya existen los ${target} DTE de la batch ${config.batchKey}.`
    );
  } else {
    console.log(
      `Creando ${missingOrdinals.length} ${label}; existentes: ${existingInvoices.length}/${target}.`
    );

    for (let position = 0; position < missingOrdinals.length; position += 1) {
      const ordinal = missingOrdinals[position];

      await createSeedInvoice({
        user,
        roleCodes,
        documentTypeCode,
        customerId: customers[customerKey].id,
        issuedAtDate,
        notes: getSeedNote({
          batchKey: config.batchKey,
          documentTypeCode,
          ordinal
        }),
        ordinal
      });

      const progress = position + 1;
      if (progress % 15 === 0 || progress === missingOrdinals.length) {
        console.log(`  ${label}: ${progress}/${missingOrdinals.length} creados`);
      }
    }
  }

  const finalInvoices = await getSeedInvoicesByMarker({
    companyId: company.id,
    documentTypeCode,
    batchKey: config.batchKey
  });

  const finalOrdinals = getExistingSeedOrdinals({
    invoices: finalInvoices,
    batchKey: config.batchKey,
    documentTypeCode,
    target
  });

  if (finalOrdinals.size !== target) {
    throw new Error(
      `Verificación final falló para ${label}. Esperado: ${target}; encontrado: ${finalOrdinals.size}.`
    );
  }

  if (!config.autoTransmit) {
    console.log(`✓ Seed ${label} completada: ${finalOrdinals.size}/${target}.`);
    console.log('  Todos los DTE quedaron GENERADOS: sin firma, sin transmisión y sin sello de Hacienda.');
    return;
  }

  const processingSummary = await processSeedInvoices({
    invoices: finalInvoices,
    user,
    roleCodes,
    config,
    customerKey,
    label
  });

  if (processingSummary.accepted !== target) {
    throw new Error(
      `La transmisión automática de ${label} no completó todos los DTE. Aceptados: ${processingSummary.accepted}/${target}.`
    );
  }

  console.log(
    `✓ Seed ${label} completada: ${finalOrdinals.size}/${target} | aceptados: ${processingSummary.accepted}/${target} | correos enviados: ${processingSummary.emailed}${config.autoEmail ? ` | correos ya existentes: ${processingSummary.emailsSkipped}` : ''}.`
  );
};

module.exports = {
  Op,
  Invoice,
  InvoiceItem,
  TARGETS,
  BASE_DOCUMENT_TYPES,
  CREDIT_NOTE_DOCUMENT_TYPE,
  CUSTOMER_KEYS,
  initializeModelsAndDatabase,
  closeDatabase,
  assertConfirmed,
  assertTestEnvironment,
  getTodayInAppTimezone,
  resolveOperationalContext,
  ensureCompanyDocumentTypes,
  ensureSeedCustomers,
  buildCreditNoteItems,
  createSeedInvoice,
  processSeedInvoices,
  getSeedMarker,
  getSeedNote,
  getSeedInvoicesByMarker,
  getExistingSeedOrdinals,
  runSingleDocumentSeed
};
