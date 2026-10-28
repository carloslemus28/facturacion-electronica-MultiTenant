const fs = require('fs');
const { getFiscalDateTimeParts } = require('../../utils/fiscal-dates');
const { decodeSignedJson, getStoredOriginalDocument, getOriginalDocumentContext } = require('./dte-original-document.service');

const invoicesService = require('../invoices/invoices.service');
const { resolveStoredArtifactPath } = require('../imports/import-storage');
const {
  normalizeDepartmentCatalogCode,
  normalizeMunicipalityCatalogCode
} = require('../../utils/el-salvador-catalogs');
const { normalizeUnitOfMeasureCode, normalizeFiscalPrecinctCode } = require('../../utils/hacienda-catalogs');
const { normalizeCountryCode: normalizeCat020CountryCode, getCountryName: getCat020CountryName } = require('../../utils/hacienda-countries');
const { normalizeDistrictCatalogCode } = require('../../utils/el-salvador-districts');

const DOCUMENT_TYPE_CODES = {
  FACTURA: '01',
  CCF: '03',
  NOTA_CREDITO: '05',
  EXPORTACION: '11',
  SUJETO_EXCLUIDO: '14'
};

const OPERATION_CONDITIONS = {
  CONTADO: 1,
  CREDITO: 2,
  OTRO: 3
};

const PAYMENT_METHODS = {
  EFECTIVO: '01',
  TARJETA: '02',
  TARJETA_DEBITO: '02',
  TARJETA_CREDITO: '03',
  CHEQUE: '04',
  TRANSFERENCIA: '05',
  DEPOSITO: '05',
  OTRO: '99'
};

const IVA_RATE = 0.13;
const IVA_FACTOR = 1.13;
const IVA_TRIBUTE_CODE = '20';
const IVA_TRIBUTE_DESCRIPTION = 'Impuesto al Valor Agregado 13%';
const EXPORT_IVA_TRIBUTE_CODE = 'C3';
const EXPORT_IVA_TRIBUTE_DESCRIPTION = 'Impuesto al Valor Agregado (exportaciones) 0%';

const round2 = (value) => {
  return Number(Number(value || 0).toFixed(2));
};

const round4 = (value) => {
  return Number(Number(value || 0).toFixed(4));
};

const cleanString = (value) => {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text || null;
};

const cleanDigits = (value) => {
  if (value === undefined || value === null) return null;

  const digits = String(value).replace(/\D/g, '');

  return digits || null;
};

const cleanPhone = (value) => {
  const digits = cleanDigits(value);

  if (!digits) return null;

  if (digits.startsWith('503') && digits.length === 11) {
    return digits.slice(3);
  }

  return digits;
};

const cleanEmail = (value) => {
  const email = cleanString(value);

  if (!email) return null;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const getContactPhone = (...values) => {
  for (const value of values) {
    const phone = cleanPhone(value);

    if (phone) {
      return phone;
    }
  }

  return null;
};

const getContactEmail = (...values) => {
  for (const value of values) {
    const email = cleanEmail(value);

    if (email) {
      return email;
    }
  }

  return null;
};

const schemaString = (value, { field, min = 1, max } = {}) => {
  const text = cleanString(value);

  if (!text) {
    const error = new Error(`${field || 'Campo'} es obligatorio según el esquema vigente de Hacienda`);
    error.statusCode = 400;
    throw error;
  }

  if (text.length < min || (max && text.length > max)) {
    const range = max ? `entre ${min} y ${max}` : `al menos ${min}`;
    const error = new Error(`${field || 'Campo'} debe contener ${range} caracteres según el esquema vigente de Hacienda`);
    error.statusCode = 400;
    throw error;
  }

  return text;
};

const getExportCountryCode = (customer = {}) => {
  let code;

  try {
    code = normalizeCat020CountryCode(customer.countryCode || customer.codPais, { allowEmpty: false });
  } catch (error) {
    error.message = 'La Factura de Exportación requiere seleccionar un país extranjero válido del CAT-020 de Hacienda.';
    error.statusCode = 400;
    throw error;
  }

  if (code === 'SV') {
    const error = new Error('La Factura de Exportación requiere seleccionar un país extranjero distinto de El Salvador.');
    error.statusCode = 400;
    throw error;
  }

  return code;
};

const getDistrictCodeOrThrow = ({
  departmentCode,
  districtName,
  municipalityCode,
  municipalityName,
  context = 'dirección'
} = {}) => {
  const districtCode = normalizeDistrictCatalogCode({
    departmentCode,
    districtName,
    municipalityCode,
    municipalityName
  });

  if (!districtCode || !/^\d{2}$/.test(districtCode)) {
    const error = new Error(
      `No se pudo resolver el código de distrito vigente de Hacienda para ${context}. ` +
      'Seleccione nuevamente Departamento y Distrito antes de transmitir.'
    );
    error.statusCode = 400;
    throw error;
  }

  return districtCode;
};

const getExportCountryName = (customer = {}, countryCode) => {
  const countryName = getCat020CountryName(countryCode);

  return schemaString(countryName, {
    field: 'Nombre de país del receptor de exportación',
    min: 3,
    max: 50
  });
};

const cleanAddressComplement = (value) => {
  const text = cleanString(value);

  if (!text || text.length < 5) {
    return 'SIN DIRECCION';
  }

  return text;
};

const APP_TIME_ZONE = process.env.APP_TIMEZONE || 'America/El_Salvador';

const getAppDateTimeParts = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
};

const formatDate = (value) => {
  const parts = getAppDateTimeParts(value);

  return parts
    ? `${parts.year}-${parts.month}-${parts.day}`
    : null;
};

const formatTime = (value) => {
  const parts = getAppDateTimeParts(value);

  return parts
    ? `${parts.hour}:${parts.minute}:${parts.second}`
    : null;
};

const getDteVersion = documentTypeCode => require('./dte-schema.service').getVersion(String(documentTypeCode));

const getOperationConditionCode = (operationCondition) => {
  return OPERATION_CONDITIONS[operationCondition] || OPERATION_CONDITIONS.CONTADO;
};

const getPaymentMethodCode = (paymentMethod) => {
  if (!paymentMethod) return PAYMENT_METHODS.EFECTIVO;

  return PAYMENT_METHODS[String(paymentMethod).toUpperCase()] || PAYMENT_METHODS.OTRO;
};

const getEnvironmentCode = (environment) => {
  return environment === 'PRODUCTION' ? '01' : '00';
};

const getEstablishmentTypeCode = (establishmentType) => {
  const map = {
    CASA_MATRIZ: '02',
    SUCURSAL: '01',
    BODEGA: '04',
    PREDIO: '07'
  };

  return map[establishmentType] || '02';
};

const getUnitOfMeasureCode = (unitOfMeasure, unitOfMeasureName) => {
  return normalizeUnitOfMeasureCode({
    code: unitOfMeasure,
    name: unitOfMeasureName
  });
};

const getItemTypeCode = (itemType) => {
  return itemType === 'PRODUCTO' ? 1 : 2;
};


const getFiscalPrecinctCode = (value) => {
  const raw = cleanString(value);
  if (!raw) return null;

  const code = normalizeFiscalPrecinctCode(raw);
  if (!code) {
    const error = new Error(`Recinto fiscal CAT-027 no válido: ${raw}`);
    error.statusCode = 400;
    throw error;
  }

  return code;
};

const getDocumentTypeForReceiver = (documentType) => {
  const map = {
    NIT: '36',
    DUI: '13',
    PASAPORTE: '03',
    CARNET_RESIDENTE: '02',
    OTRO: '37',
    SIN_DOCUMENTO: null
  };

  return map[documentType] || null;
};

const formatReceiverDocumentNumber = (documentType, documentNumber) => {
  const typeCode = getDocumentTypeForReceiver(documentType);
  const rawValue = cleanString(documentNumber);

  if (!rawValue) return null;

  // NIT y DUI: Hacienda exige solo dígitos.
  if (typeCode === '36' || typeCode === '13') {
    return cleanDigits(rawValue);
  }

  // Carné de residente, pasaporte y otro documento:
  // se envían sin espacios, guiones ni caracteres especiales.
  return rawValue.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

// Compatibilidad con el validador V2 seleccionado en la respuesta MH 096.
const { getInvalidationEventVersion } = require('./invalidation-version');

const getInvalidationTypeCode = () => 2; // Este formulario rescinde la operación; no es la versión del evento.

const getFallbackDocumentType = (value) => {
  return getDocumentTypeForReceiver(value) || '36';
};

const getFallbackDocumentNumber = (...values) => {
  for (const value of values) {
    const cleaned = cleanDigits(value) || cleanString(value);

    if (cleaned) return cleaned;
  }

  return null;
};

const buildPersonFullName = (person) => {
  const fullName = cleanString(`${person?.firstName || ''} ${person?.lastName || ''}`);

  return (
    fullName ||
    cleanString(person?.name) ||
    cleanString(person?.username) ||
    null
  );
};

const isConsumerFinalInvoice = (documentTypeCode) => {
  return String(documentTypeCode) === DOCUMENT_TYPE_CODES.FACTURA;
};

const isCreditFiscalDocument = (documentTypeCode) => {
  return String(documentTypeCode) === DOCUMENT_TYPE_CODES.CCF;
};

const isCreditNoteDocument = (documentTypeCode) => {
  return ['05', '06'].includes(String(documentTypeCode));
};

const isExportInvoice = (documentTypeCode) => {
  return String(documentTypeCode) === DOCUMENT_TYPE_CODES.EXPORTACION;
};

const isExcludedSubjectInvoice = (documentTypeCode) => {
  return String(documentTypeCode) === DOCUMENT_TYPE_CODES.SUJETO_EXCLUIDO;
};

const isIvaSeparatedDocument = (documentTypeCode) => {
  return ['03', '05', '06'].includes(String(documentTypeCode));
};

const isTaxpayerReceiverDocument = (documentTypeCode) => {
  return ['03', '05', '06'].includes(String(documentTypeCode));
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

const getOfficialItemIva = (documentTypeCode, item) => {
  const gravada = Number(item.gravada || 0);

  if (gravada <= 0) return 0;

  /*
    En combustible, el monto ingresado por el usuario es el total final que
    debe cobrarse. FOVIAL y COTRANS se redondean por separado y el IVA ya se
    calcula como residuo sobre ese total. Volver a calcular el IVA a partir
    de la base gravada redondeada puede mover el total un centavo (por
    ejemplo, $50.00 -> $49.99). Conservamos el IVA calculado por el módulo de
    combustible; no se alteran las tasas ni los cálculos de FOVIAL/COTRANS.
  */
  const isFuelItem =
    String(item.code || '').trim().toUpperCase().startsWith('FUEL-') ||
    Number(item.fovial || 0) > 0 ||
    Number(item.cotrans || 0) > 0;

  if (isFuelItem) {
    return round2(item.iva);
  }

  if (isConsumerFinalInvoice(documentTypeCode)) {
    return calculateIncludedIva(gravada);
  }

  if (isIvaSeparatedDocument(documentTypeCode)) {
    return calculateSeparatedIva(gravada);
  }

  return round2(item.iva);
};

const getOfficialTotalIva = (invoice) => {
  const items = invoice.items || [];

  if (!items.length) {
    return round2(invoice.iva);
  }

  return round2(
    items.reduce((sum, item) => {
      return sum + getOfficialItemIva(invoice.documentTypeCode, item);
    }, 0)
  );
};

const numberToSpanishWords = (number) => {
  const units = [
    '',
    'uno',
    'dos',
    'tres',
    'cuatro',
    'cinco',
    'seis',
    'siete',
    'ocho',
    'nueve',
    'diez',
    'once',
    'doce',
    'trece',
    'catorce',
    'quince',
    'dieciseis',
    'diecisiete',
    'dieciocho',
    'diecinueve',
    'veinte',
    'veintiuno',
    'veintidos',
    'veintitres',
    'veinticuatro',
    'veinticinco',
    'veintiseis',
    'veintisiete',
    'veintiocho',
    'veintinueve'
  ];

  const tens = [
    '',
    '',
    '',
    'treinta',
    'cuarenta',
    'cincuenta',
    'sesenta',
    'setenta',
    'ochenta',
    'noventa'
  ];

  const hundreds = [
    '',
    'ciento',
    'doscientos',
    'trescientos',
    'cuatrocientos',
    'quinientos',
    'seiscientos',
    'setecientos',
    'ochocientos',
    'novecientos'
  ];

  const underThousand = (num) => {
    if (num === 0) return '';
    if (num === 100) return 'cien';
    if (num < 30) return units[num];

    if (num < 100) {
      const ten = Math.floor(num / 10);
      const unit = num % 10;

      return unit === 0 ? tens[ten] : `${tens[ten]} y ${units[unit]}`;
    }

    const hundred = Math.floor(num / 100);
    const rest = num % 100;

    return rest === 0
      ? hundreds[hundred]
      : `${hundreds[hundred]} ${underThousand(rest)}`;
  };

  const integer = Math.floor(Number(number || 0));

  if (integer === 0) return 'cero';

  if (integer < 1000) {
    return underThousand(integer);
  }

  if (integer < 1000000) {
    const thousands = Math.floor(integer / 1000);
    const rest = integer % 1000;

    const thousandsText = thousands === 1
      ? 'mil'
      : `${underThousand(thousands)} mil`;

    return rest === 0
      ? thousandsText
      : `${thousandsText} ${underThousand(rest)}`;
  }

  const millions = Math.floor(integer / 1000000);
  const rest = integer % 1000000;

  const millionsText = millions === 1
    ? 'un millon'
    : `${numberToSpanishWords(millions)} millones`;

  return rest === 0
    ? millionsText
    : `${millionsText} ${numberToSpanishWords(rest)}`;
};

const amountToSpanishWords = (value) => {
  const amount = Number(value || 0);
  const totalCents = Math.round(amount * 100);
  const integer = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  return `${numberToSpanishWords(integer).toUpperCase()} ${String(cents).padStart(2, '0')}/100 DOLARES`;
};

const getExportPersonType = (customer) => {
  const type = cleanString(customer?.customerType || customer?.customer_type || '')?.toUpperCase() || '';

  if (
    type.includes('JURIDICA') ||
    type.includes('JURÍDICA') ||
    type.includes('EMPRESA') ||
    type.includes('SOCIEDAD') ||
    type.includes('CONTRIBUYENTE')
  ) {
    return 2;
  }

  return 1;
};

const getExportItemType = (invoice) => {
  const items = invoice.items || [];

  const hasProduct = items.some((item) => {
    const type = cleanString(item.itemType || item.product?.itemType || '')?.toUpperCase();
    return type === 'PRODUCTO';
  });

  const hasService = items.some((item) => {
    const type = cleanString(item.itemType || item.product?.itemType || '')?.toUpperCase();
    return type === 'SERVICIO' || type !== 'PRODUCTO';
  });

  if (hasProduct && hasService) return 3;
  if (hasProduct) return 1;

  return 2;
};

const buildDocumentRelated = (invoice) => {
  if (!invoice.relatedInvoiceId && !invoice.relatedControlNumber && !invoice.relatedGenerationCode) {
    return null;
  }

  const relatedGenerationCode = cleanString(invoice.relatedGenerationCode);
  const relatedControlNumber = cleanString(invoice.relatedControlNumber);

  const numeroDocumento = relatedGenerationCode || relatedControlNumber;

  if (!numeroDocumento) {
    return null;
  }

  const relatedInvoice = invoice.relatedInvoice || invoice.get?.('relatedInvoice') || null;

const relatedIssuedAt =
  relatedInvoice?.issuedAt ||
  invoice.relatedInvoiceIssuedAt ||
  invoice.issuedAt;

return [
  {
    tipoDocumento: cleanString(invoice.relatedDocumentTypeCode || DOCUMENT_TYPE_CODES.CCF),
    tipoGeneracion: relatedGenerationCode ? 2 : 1,
    numeroDocumento,
    fechaEmision: formatDate(relatedIssuedAt)
  }
];

};

const buildIdentification = (invoice) => {
  const documentTypeCode = String(invoice.documentTypeCode || '');

  const base = {
  version: getDteVersion(invoice.documentTypeCode),
  ambiente: getEnvironmentCode(invoice.company?.environment),
  tipoDte: invoice.documentTypeCode,
  numeroControl: invoice.controlNumber,
  codigoGeneracion: invoice.generationCode,
  tipoModelo: Number(invoice.tipoModelo || 1),
  tipoOperacion: Number(invoice.tipoOperacion || 1),
  tipoContingencia: invoice.tipoContingencia === undefined
    ? null
    : invoice.tipoContingencia,
  fecEmi: formatDate(invoice.issuedAt),
  horEmi: formatTime(invoice.issuedAt),
  tipoMoneda: 'USD'
};

  const identification = {
    ...base,
    motivoContin: cleanString(invoice.motivoContin)
  };

  // V4 de NCE exige el atributo aun cuando no aplique una fusión societaria.
  if (isCreditNoteDocument(documentTypeCode)) {
    identification.fusion = cleanDigits(
      invoice.fusion || invoice.fusionNit || invoice.nitFusionado
    ) || null;
  }

  return identification;
};

const buildIssuer = (invoice) => {
  const company = invoice.company || {};
  const pointOfSale = invoice.pointOfSale || {};
  const establishment = pointOfSale.establishment || {};
  const documentTypeCode = String(invoice.documentTypeCode || '');

  const issuer = {
    nit: cleanDigits(company.nit),
    nrc: cleanDigits(company.nrc),
    nombre: cleanString(company.legalName),
    codActividad: cleanString(company.economicActivityCode),
    descActividad: cleanString(company.economicActivityName),
    nombreComercial: cleanString(company.commercialName),
    direccion: {
      departamento: normalizeDepartmentCatalogCode(
        establishment.departmentCode || company.departmentCode
      ),
      municipio: normalizeMunicipalityCatalogCode({
        departmentCode: establishment.departmentCode || company.departmentCode,
        districtName: establishment.districtName || company.districtName,
        municipalityCode: establishment.municipalityCode || company.municipalityCode,
        municipalityName: establishment.municipalityName || company.municipalityName
      }),
      distrito: getDistrictCodeOrThrow({
        departmentCode: establishment.departmentCode || company.departmentCode,
        districtName: establishment.districtName || company.districtName,
        municipalityCode: establishment.municipalityCode || company.municipalityCode,
        municipalityName: establishment.municipalityName || company.municipalityName,
        context: 'la dirección del emisor'
      }),
      complemento: cleanAddressComplement(establishment.addressComplement || company.addressComplement)
    },
    telefono: cleanPhone(company.phone),
    correo: cleanString(company.email),
    codEstable: cleanString(establishment.establishmentCode || company.establishmentCode || 'M001'),
    codPuntoVenta: cleanString(pointOfSale.code || company.pointOfSaleCode || 'P001')
  };

  if (isCreditNoteDocument(documentTypeCode)) {
    // NCE V4 ya no admite códigos de establecimiento dentro de emisor.
    delete issuer.codEstable;
    delete issuer.codPuntoVenta;
  }

  if (isExcludedSubjectInvoice(documentTypeCode)) {
    delete issuer.nombreComercial;
  }

  if (isExportInvoice(documentTypeCode)) {
    issuer.tipoItemExpor = getExportItemType(invoice);
    issuer.recintoFiscal = getFiscalPrecinctCode(invoice.recintoFiscal || company.recintoFiscal);
    issuer.tipoRegimen = cleanString(invoice.tipoRegimen || company.tipoRegimen) || null;
    issuer.regimen = cleanString(invoice.regimen || company.regimen) || null;
  }

  return issuer;
};

const formatConsumerFinalDocumentNumber = (documentType, documentNumber) => {
  const documentTypeCode = getDocumentTypeForReceiver(documentType);
  const rawValue = cleanString(documentNumber);

  if (!rawValue) {
    return null;
  }

  // DUI (CAT-022 código 13): Normativa DTE V2 exige 9 dígitos
  // sin guiones ni otros caracteres especiales en receptor/numDocumento.
  if (documentTypeCode === '13') {
    const dui = cleanDigits(rawValue);

    if (!dui || dui.length !== 9) {
      const error = new Error(
        'El DUI del receptor debe contener exactamente 9 dígitos.'
      );
      error.statusCode = 400;
      throw error;
    }

    return dui;
  }

  // NIT: se transmite únicamente con sus 14 dígitos.
  if (documentTypeCode === '36') {
    const nit = cleanDigits(rawValue);

    if (!nit || nit.length !== 14) {
      const error = new Error(
        'El NIT del receptor debe contener exactamente 14 dígitos.'
      );
      error.statusCode = 400;
      throw error;
    }

    return nit;
  }

  return rawValue;
};

const formatExcludedSubjectDocumentNumber = (
  documentType,
  documentNumber
) => {
  const documentTypeCode = getDocumentTypeForReceiver(documentType);
  const rawValue = cleanString(documentNumber);

  if (!rawValue) {
    return null;
  }

  // DTE 14: el DUI debe enviarse con 9 dígitos, sin guion.
  if (documentTypeCode === '13') {
    const dui = cleanDigits(rawValue);

    if (!dui || dui.length !== 9) {
      const error = new Error(
        'El DUI del sujeto excluido debe contener exactamente 9 dígitos.'
      );

      error.statusCode = 400;
      throw error;
    }

    return dui;
  }

  // NIT del sujeto excluido: 14 dígitos, sin guiones.
  if (documentTypeCode === '36') {
    const nit = cleanDigits(rawValue);

    if (!nit || nit.length !== 14) {
      const error = new Error(
        'El NIT del sujeto excluido debe contener exactamente 14 dígitos.'
      );

      error.statusCode = 400;
      throw error;
    }

    return nit;
  }

  return formatReceiverDocumentNumber(documentType, rawValue);
};

const buildConsumerFinalReceiver = (customer, company = {}) => {
  if (!customer?.id) {
    return null;
  }

  return {
    tipoDocumento: getDocumentTypeForReceiver(customer.documentType),
    numDocumento: formatConsumerFinalDocumentNumber(
      customer.documentType,
      customer.documentNumber
    ),
    nrc: cleanDigits(customer.nrc),
    nombre: cleanString(customer.name),
    codActividad: cleanString(customer.economicActivityCode),
    descActividad: cleanString(customer.economicActivityName),
    direccion: {
      departamento: normalizeDepartmentCatalogCode(customer.departmentCode),
      municipio: normalizeMunicipalityCatalogCode({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName
      }),
      distrito: getDistrictCodeOrThrow({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName,
        context: `la dirección del receptor ${cleanString(customer.name) || ''}}`.trim()
      }),
      complemento: cleanAddressComplement(customer.addressComplement)
    },
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone),
    correo: getContactEmail(customer.email, customer.secondaryEmail)
  };
};

const buildTaxpayerReceiver = (customer, company = {}) => {
  if (!customer?.id) {
    return null;
  }

  return {
    nit: cleanDigits(customer.documentNumber),
    nrc: cleanDigits(customer.nrc),
    nombre: cleanString(customer.name),
    codActividad: cleanString(customer.economicActivityCode),
    descActividad: cleanString(customer.economicActivityName),
    nombreComercial: cleanString(customer.commercialName || customer.name),
    direccion: {
      departamento: normalizeDepartmentCatalogCode(customer.departmentCode),
      municipio: normalizeMunicipalityCatalogCode({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName
      }),
      distrito: getDistrictCodeOrThrow({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName,
        context: `la dirección del receptor ${cleanString(customer.name) || ''}}`.trim()
      }),
      complemento: cleanAddressComplement(customer.addressComplement)
    },
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone),
    correo: getContactEmail(customer.email, customer.secondaryEmail)
  };
};

const buildAdjustmentNoteReceiver = (customer, company = {}) => {
  if (!customer?.id) {
    return null;
  }

  return {
    tipoDocumento: getDocumentTypeForReceiver(customer.documentType),
    numDocumento: formatReceiverDocumentNumber(customer.documentType, customer.documentNumber),
    nrc: cleanDigits(customer.nrc),
    nombre: cleanString(customer.name),
    codActividad: cleanString(customer.economicActivityCode),
    descActividad: cleanString(customer.economicActivityName),
    nombreComercial: cleanString(customer.commercialName || customer.name),
    direccion: {
      departamento: normalizeDepartmentCatalogCode(customer.departmentCode),
      municipio: normalizeMunicipalityCatalogCode({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName
      }),
      distrito: getDistrictCodeOrThrow({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName,
        context: `la dirección del receptor ${cleanString(customer.name) || ''}}`.trim()
      }),
      complemento: cleanAddressComplement(customer.addressComplement)
    },
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone),
    correo: getContactEmail(customer.email, customer.secondaryEmail)
  };
};

const buildExportReceiver = (invoice) => {
  const customer = invoice.customer || {};
  const company = invoice.company || {};

  if (!customer?.id) {
    return null;
  }

  const countryCode = getExportCountryCode(customer);

  return {
    nombre: cleanString(customer.name),
    codPais: countryCode,
    nombrePais: getExportCountryName(customer, countryCode),
    complemento: cleanAddressComplement(customer.addressComplement),
    tipoDocumento: getDocumentTypeForReceiver(customer.documentType),
    numDocumento: formatReceiverDocumentNumber(
      customer.documentType,
      customer.documentNumber
    ),
    nombreComercial: cleanString(customer.commercialName || customer.name),
    tipoPersona: getExportPersonType(customer),
    descActividad: cleanString(customer.economicActivityName || 'Actividad económica del receptor'),
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone) || '00000000',
    correo: getContactEmail(customer.email, customer.secondaryEmail)
  };
};

const buildExcludedSubject = (customer, company = {}) => {
  if (!customer?.id) {
    return null;
  }

  return {
    tipoDocumento: getDocumentTypeForReceiver(customer.documentType),
    numDocumento: formatExcludedSubjectDocumentNumber(
      customer.documentType,
      customer.documentNumber
    ),
    nombre: cleanString(customer.name),
    codActividad: cleanString(customer.economicActivityCode),
    descActividad: cleanString(customer.economicActivityName),
    direccion: {
      departamento: normalizeDepartmentCatalogCode(customer.departmentCode),
      municipio: normalizeMunicipalityCatalogCode({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName
      }),
      distrito: getDistrictCodeOrThrow({
        departmentCode: customer.departmentCode,
        districtName: customer.districtName,
        municipalityCode: customer.municipalityCode,
        municipalityName: customer.municipalityName,
        context: `la dirección del receptor ${cleanString(customer.name) || ''}}`.trim()
      }),
      complemento: cleanAddressComplement(customer.addressComplement)
    },
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone),
    correo: getContactEmail(customer.email, customer.secondaryEmail)
  };
};

const buildReceiver = (invoice) => {
  const documentTypeCode = String(invoice.documentTypeCode || '');
  const customer = invoice.customer || {};
  const company = invoice.company || {};

  if (isCreditNoteDocument(documentTypeCode)) {
    return buildAdjustmentNoteReceiver(customer, company);
  }

  if (isTaxpayerReceiverDocument(documentTypeCode)) {
    return buildTaxpayerReceiver(customer, company);
  }

  if (isExportInvoice(documentTypeCode)) {
    return buildExportReceiver(invoice);
  }

  if (isExcludedSubjectInvoice(documentTypeCode)) {
    return buildExcludedSubject(customer, company);
  }

  return buildConsumerFinalReceiver(customer, company);
};

const getRelatedDocumentNumberForItem = (invoice) => {
  if (!isCreditNoteDocument(invoice.documentTypeCode)) {
    return null;
  }

  return invoice.relatedGenerationCode || invoice.relatedControlNumber || null;
};

const buildConsumerFinalBodyItem = ({ invoice, item, index }) => {
  const documentTypeCode = String(invoice.documentTypeCode || '');

  return {
    numItem: index + 1,
    tipoItem: getItemTypeCode(item.itemType),
    numeroDocumento: null,
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    codTributo: null,
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure, item.unitOfMeasureName),
    descripcion: cleanString(item.description),
    precioUni: round4(item.unitPrice),
    montoDescu: 0,
    ventaNoSuj: round2(item.noSuj),
    ventaExenta: round2(item.exenta),
    ventaGravada: round2(item.gravada),
    tributos: null,
    psv: 0,
    noGravado: 0,
    ivaItem: getOfficialItemIva(documentTypeCode, item)
  };
};

const buildTaxpayerBodyItem = ({ invoice, item, index }) => {
  const hasIva = Number(item.gravada || 0) > 0;

  return {
    numItem: index + 1,
    tipoItem: getItemTypeCode(item.itemType),
    numeroDocumento: getRelatedDocumentNumberForItem(invoice),
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    codTributo: null,
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure, item.unitOfMeasureName),
    descripcion: cleanString(item.description),
    precioUni: round4(item.unitPrice),
    montoDescu: 0,
    ventaNoSuj: round2(item.noSuj),
    ventaExenta: round2(item.exenta),
    ventaGravada: round2(item.gravada),
    tributos: hasIva ? [IVA_TRIBUTE_CODE] : null,
    psv: 0,
    noGravado: 0
  };
};

const getCreditNoteTributeItemIva = (item) => {
  const ventaGravada = round2(item.gravada);

  if (ventaGravada <= 0) return 0;

  const isFuelItem =
    String(item.code || '').trim().toUpperCase().startsWith('FUEL-') ||
    Number(item.fovial || 0) > 0 ||
    Number(item.cotrans || 0) > 0;

  if (isFuelItem) {
    return round2(item.iva);
  }

  return calculateSeparatedIva(ventaGravada);
};


const getCreditNoteTributeTotalIva = (invoice) => {
  const items = invoice.items || [];

  if (!items.length) {
    return round2(invoice.iva);
  }

  return round2(items.reduce((sum, item) => sum + getCreditNoteTributeItemIva(item), 0));
};


const creditNoteAdjustsCcf = (invoice) => {
  return String(invoice.relatedDocumentTypeCode || '') === DOCUMENT_TYPE_CODES.CCF;
};


const getCreditNoteBodyTotalIva = (invoice, item) => {
  if (creditNoteAdjustsCcf(invoice)) return 0;
  return round2(item.totalIva ?? item.iva ?? 0);
};


const getCreditNoteSummaryTotalIva = (invoice) => {
  if (creditNoteAdjustsCcf(invoice)) return 0;

  const items = invoice.items || [];
  if (!items.length) return round2(invoice.totalIva ?? invoice.iva ?? 0);

  return round2(items.reduce((sum, item) => sum + getCreditNoteBodyTotalIva(invoice, item), 0));
};


const buildCreditNoteBodyItem = ({ invoice, item, index }) => {
  const hasIva = Number(item.gravada || 0) > 0;

  return {
    numItem: index + 1,
    tipoItem: getItemTypeCode(item.itemType),
    numeroDocumento: getRelatedDocumentNumberForItem(invoice),
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    codTributo: null,
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure, item.unitOfMeasureName),
    descripcion: cleanString(item.description),
    precioUni: round4(item.unitPrice),
    montoDescu: 0,
    ventaNoSuj: round2(item.noSuj),
    ventaExenta: round2(item.exenta),
    ventaGravada: round2(item.gravada),
    tributos: hasIva ? [IVA_TRIBUTE_CODE] : null,
    noGravado: round2(item.noGravado || 0),
    ivaPerci: round2(item.ivaPerci || 0),
    totalIva: getCreditNoteBodyTotalIva(invoice, item),
    ivaRete: round2(item.ivaRete || item.retention1 || 0)
  };
};

const buildExportBodyItem = ({ item, index }) => {
  const ventaGravada = round2(item.gravada || item.total || item.subtotal);

  return {
    numItem: index + 1,
    tipoItem: getItemTypeCode(item.itemType),
    numeroDocumento: null,
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    codTributo: null,
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure, item.unitOfMeasureName),
    descripcion: cleanString(item.description),
    precioUni: round4(item.unitPrice),
    montoDescu: 0,
    ventaGravada,
    // FEXE V3 exige informar C3 (IVA exportaciones 0%) por cada ítem.
    // Aunque su valor sea 0.00, Hacienda lo valida como tributo requerido.
    tributos: [EXPORT_IVA_TRIBUTE_CODE],
    noGravado: 0
  };
};

const buildExcludedSubjectBodyItem = ({ item, index }) => {
  return {
    numItem: index + 1,
    tipoItem: getItemTypeCode(item.itemType),
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure, item.unitOfMeasureName),
    descripcion: cleanString(item.description),
    precioUni: round4(item.unitPrice),
    montoDescu: 0,
    compra: round2(item.total || item.subtotal || item.gravada || item.exenta || item.noSuj)
  };
};

const buildBody = (invoice) => {
  const items = invoice.items || [];
  const documentTypeCode = String(invoice.documentTypeCode || '');

  return items.map((item, index) => {
    if (isCreditNoteDocument(documentTypeCode)) {
      return buildCreditNoteBodyItem({
        invoice,
        item,
        index
      });
    }

    if (isTaxpayerReceiverDocument(documentTypeCode)) {
      return buildTaxpayerBodyItem({
        invoice,
        item,
        index
      });
    }

    if (isExportInvoice(documentTypeCode)) {
      return buildExportBodyItem({
        item,
        index
      });
    }

    if (isExcludedSubjectInvoice(documentTypeCode)) {
      return buildExcludedSubjectBodyItem({
        item,
        index
      });
    }

    return buildConsumerFinalBodyItem({
      invoice,
      item,
      index
    });
  });
};

const buildPayments = (invoice, totalOverride = null) => {
  const total = round2(totalOverride ?? invoice.total);

  return [
    {
      codigo: getPaymentMethodCode(invoice.paymentMethod),
      montoPago: total,
      referencia: null,
      plazo: null,
      periodo: null
    }
  ];
};

const buildIvaTributes = (invoice, totalIvaOverride = null) => {
  const totalIva = round2(totalIvaOverride ?? getOfficialTotalIva(invoice));

  if (totalIva <= 0) {
    return null;
  }

  return [
    {
      codigo: IVA_TRIBUTE_CODE,
      descripcion: IVA_TRIBUTE_DESCRIPTION,
      valor: totalIva
    }
  ];
};

const buildConsumerFinalSummary = (invoice) => {
  const operationConditionCode = getOperationConditionCode(invoice.operationCondition);

  const totalNoSuj = round2(invoice.noSuj);
  const totalExenta = round2(invoice.exenta);
  const totalGravada = round2(invoice.gravada);
  const subTotalVentas = round2(totalNoSuj + totalExenta + totalGravada);
  const subTotal = round2(invoice.subtotal);
  const totalIva = getOfficialTotalIva(invoice);
  const retencion = round2(invoice.retention1);

  // La retención de IVA no disminuye el monto total de la operación.
  // Se informa por separado en ivaRete1 y únicamente reduce el total a pagar.
  const montoTotalOperacion = subTotal;
  const totalPagar = round2(invoice.total || (montoTotalOperacion - retencion));

  return {
    totalNoSuj,
    totalExenta,
    totalGravada,
    subTotalVentas,
    descuNoSuj: 0,
    descuExenta: 0,
    descuGravada: 0,
    porcentajeDescuento: 0,
    totalDescu: 0,
    tributos: null,
    subTotal,
    ivaRete: retencion,
    montoTotalOperacion,
    totalNoGravado: 0,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    totalIva,
    saldoFavor: 0,
    condicionOperacion: operationConditionCode,
    pagos: buildPayments(invoice, totalPagar),
    numPagoElectronico: null,
    observaciones: cleanString(invoice.notes)
  };
};

const buildTaxpayerSummary = (invoice) => {
  const operationConditionCode = getOperationConditionCode(invoice.operationCondition);

  const totalNoSuj = round2(invoice.noSuj);
  const totalExenta = round2(invoice.exenta);
  const totalGravada = round2(invoice.gravada);
  const subTotalVentas = round2(totalNoSuj + totalExenta + totalGravada);
  const subTotal = round2(invoice.subtotal);
  const totalIva = getOfficialTotalIva(invoice);
  const ivaPerci = 0;
  const ivaRete = round2(invoice.retention1);

  // CCF V4 usa los nombres ivaPerci/ivaRete y mantiene la retención
  // separada del monto bruto de la operación.
  const montoTotalOperacion = round2(subTotal + totalIva + ivaPerci);
  const totalPagar = round2(invoice.total || (montoTotalOperacion - ivaRete));

  return {
    totalNoSuj,
    totalExenta,
    totalGravada,
    subTotalVentas,
    descuNoSuj: 0,
    descuExenta: 0,
    descuGravada: 0,
    porcentajeDescuento: 0,
    totalDescu: 0,
    tributos: buildIvaTributes(invoice),
    subTotal,
    ivaPerci,
    ivaRete,
    montoTotalOperacion,
    totalNoGravado: 0,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    saldoFavor: 0,
    condicionOperacion: operationConditionCode,
    pagos: buildPayments(invoice, totalPagar),
    numPagoElectronico: null,
    observaciones: cleanString(invoice.notes)
  };
};

const buildCreditNoteSummary = (invoice) => {
  const operationConditionCode = getOperationConditionCode(invoice.operationCondition);

  const totalNoSuj = round2(invoice.noSuj);
  const totalExenta = round2(invoice.exenta);
  const totalGravada = round2(invoice.gravada);
  const subTotalVentas = round2(totalNoSuj + totalExenta + totalGravada);
  const ivaTributo = getCreditNoteTributeTotalIva(invoice);
  const totalIva = getCreditNoteSummaryTotalIva(invoice);
  const ivaPerci = round2(invoice.ivaPerci || 0);
  const ivaRete = round2(invoice.retention1);
  const totalNoGravado = round2(invoice.totalNoGravado || 0);
  const montoTotalOperacion = round2(subTotalVentas + ivaTributo + ivaPerci + totalNoGravado);
  const totalPagar = round2(invoice.total || (montoTotalOperacion - ivaRete));

  return {
    totalNoSuj,
    totalExenta,
    totalGravada,
    subTotalVentas,
    totalDescu: 0,
    tributos: buildIvaTributes(invoice, ivaTributo),
    montoTotalOperacion,
    ivaPerci,
    totalIva,
    ivaRete,
    totalNoGravado,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    condicionOperacion: operationConditionCode,
    observaciones: cleanString(invoice.notes),
    codigoRetencionMH: cleanString(invoice.codigoRetencionMH || invoice.retentionCodeMH) || null
  };
};

const buildExportSummary = (invoice) => {
  const operationConditionCode = getOperationConditionCode(invoice.operationCondition);

  const totalGravada = round2(invoice.gravada || invoice.subtotal || invoice.total);
  const porcentajeDescuento = 0;
  const totalDescu = 0;
  const seguro = round2(invoice.insurance || invoice.seguro || 0);
  const flete = round2(invoice.freight || invoice.flete || 0);
  const montoTotalOperacion = round2(totalGravada + seguro + flete);
  const totalNoGravado = 0;
  const totalNoOnerosas = 0;
  const totalPagar = round2(invoice.total || montoTotalOperacion);

  return {
    totalGravada,
    descuGravada: 0,
    porcentajeDescuento,
    totalDescu,
    seguro,
    flete,
    // C3 debe consolidarse también en el resumen de la FEXE, aun con valor 0.00.
    tributos: [
      {
        codigo: EXPORT_IVA_TRIBUTE_CODE,
        descripcion: EXPORT_IVA_TRIBUTE_DESCRIPTION,
        valor: 0
      }
    ],
    montoTotalOperacion,
    totalNoGravado,
    totalNoOnerosas,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    saldoFavor: 0,
    condicionOperacion: operationConditionCode,
    pagos: buildPayments(invoice, totalPagar),
    codIncoterms: cleanString(invoice.codIncoterms || invoice.incotermsCode) || null,
    descIncoterms: cleanString(invoice.descIncoterms || invoice.incotermsDescription) || null,
    numPagoElectronico: null,
    observaciones: cleanString(invoice.notes)
  };
};

const buildExcludedSubjectSummary = (invoice) => {
  const operationConditionCode = getOperationConditionCode(invoice.operationCondition);

  const totalCompra = round2(invoice.total || invoice.subtotal || invoice.gravada || invoice.exenta || invoice.noSuj);
  const descu = 0;
  const totalDescu = 0;
  const subTotal = round2(totalCompra - totalDescu);
  // El esquema oficial DTE 14 v2 informa esta retención como reteRenta.
  const reteRenta = round2(invoice.retention1);
  const totalPagar = round2(invoice.total || (subTotal - reteRenta));

  return {
    totalCompra,
    descu,
    totalDescu,
    subTotal,
    reteRenta,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    condicionOperacion: operationConditionCode,
    pagos: buildPayments(invoice, totalPagar),
    observaciones: cleanString(invoice.notes)
  };
};

const buildSummary = (invoice) => {
  const documentTypeCode = String(invoice.documentTypeCode || '');

  if (isCreditNoteDocument(documentTypeCode)) {
    return buildCreditNoteSummary(invoice);
  }

  if (isTaxpayerReceiverDocument(documentTypeCode)) {
    return buildTaxpayerSummary(invoice);
  }

  if (isExportInvoice(documentTypeCode)) {
    return buildExportSummary(invoice);
  }

  if (isExcludedSubjectInvoice(documentTypeCode)) {
    return buildExcludedSubjectSummary(invoice);
  }

  return buildConsumerFinalSummary(invoice);
};

const buildExtension = (invoice) => {
  const user = invoice.user || {};
  const documentTypeCode = String(invoice.documentTypeCode || '');

  const extension = {
    nombEntrega: cleanString(`${user.firstName || ''} ${user.lastName || ''}`),
    docuEntrega: null,
    nombRecibe: cleanString(invoice.customer?.name),
    docuRecibe: cleanString(invoice.customer?.documentNumber),
    observaciones: cleanString(invoice.notes)
  };

  if (!isCreditNoteDocument(documentTypeCode)) {
    extension.placaVehiculo = null;
  }

  return extension;
};

const buildAppendix = (invoice) => {
  const appendix = [];

  appendix.push({
    campo: 'estadoSistema',
    etiqueta: 'Estado en sistema',
    valor: invoice.status
  });

  if (invoice.receptionSeal) {
    appendix.push({
      campo: 'selloRecepcion',
      etiqueta: 'Sello de recepción',
      valor: invoice.receptionSeal
    });
  }

  if (invoice.rejectionReason) {
    appendix.push({
      campo: 'motivoRechazo',
      etiqueta: 'Motivo de rechazo',
      valor: invoice.rejectionReason
    });
  }

  if (invoice.invalidatedAt) {
    appendix.push({
      campo: 'fechaAnulacion',
      etiqueta: 'Fecha de anulación',
      valor: new Date(invoice.invalidatedAt).toISOString()
    });
  }

  if (invoice.invalidationReason) {
    appendix.push({
      campo: 'motivoAnulacion',
      etiqueta: 'Motivo de anulación',
      valor: invoice.invalidationReason
    });
  }

  if (invoice.invalidationReceptionSeal) {
    appendix.push({
      campo: 'selloAnulacion',
      etiqueta: 'Sello de anulación',
      valor: invoice.invalidationReceptionSeal
    });
  }

  return appendix;
};

const buildInternalMetadata = (invoice) => {
  return {
    invoiceId: invoice.id,
    companyId: invoice.companyId,
    pointOfSaleId: invoice.pointOfSaleId,
    userId: invoice.userId,
    customerId: invoice.customerId,
    status: invoice.status,
    documentTypeName: invoice.documentTypeName,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt
  };
};

const buildStandardDteJson = (invoice) => {
  const documentTypeCode = String(invoice.documentTypeCode || '');

  if (isExcludedSubjectInvoice(documentTypeCode)) {
    return {
      identificacion: buildIdentification(invoice),
      emisor: buildIssuer(invoice),
      receptor: buildExcludedSubject(invoice.customer || {}, invoice.company || {}),
      cuerpoDocumento: buildBody(invoice),
      resumen: buildSummary(invoice),
      apendice: buildAppendix(invoice)
    };
  }

  if (isCreditNoteDocument(documentTypeCode)) {
    return {
      identificacion: buildIdentification(invoice),
      documentoRelacionado: buildDocumentRelated(invoice),
      emisor: buildIssuer(invoice),
      receptor: buildReceiver(invoice),
      ventaTercero: null,
      cuerpoDocumento: buildBody(invoice),
      resumen: buildSummary(invoice),
      apendice: buildAppendix(invoice)
    };
  }

  if (isExportInvoice(documentTypeCode)) {
    return {
      identificacion: buildIdentification(invoice),
      documentoRelacionado: null,
      emisor: buildIssuer(invoice),
      receptor: buildReceiver(invoice),
      otrosDocumentos: null,
      ventaTercero: null,
      compraTercero: null,
      cuerpoDocumento: buildBody(invoice),
      resumen: buildSummary(invoice),
      apendice: buildAppendix(invoice)
    };
  }

  const dte = {
    identificacion: buildIdentification(invoice),
    documentoRelacionado: buildDocumentRelated(invoice),
    emisor: buildIssuer(invoice),
    receptor: buildReceiver(invoice),
    otrosDocumentos: null,
    cuerpoDocumento: buildBody(invoice),
    resumen: buildSummary(invoice),
    apendice: buildAppendix(invoice)
  };

  dte.ventaTercero = null;

  return dte;
};

const getOriginalDteForInvalidation = async (invoice) => {
  const stored = getStoredOriginalDocument(invoice);
  if (stored) return stored;
  const artifact = await invoicesService.findHistoricalImportArtifactForInvoice(invoice);
  if (!artifact?.jsonRelativePath) return null;
  if (Number(artifact.companyId) !== Number(invoice.companyId) || Number(artifact.invoiceId) !== Number(invoice.id)) {
    const error = new Error('El archivo histórico no pertenece a este contribuyente y DTE.');
    error.statusCode = 400; throw error;
  }
  try {
    const raw = await fs.promises.readFile(resolveStoredArtifactPath(artifact.jsonRelativePath), 'utf8');
    return getStoredOriginalDocument(invoice, JSON.parse(raw.replace(/^\uFEFF/, '')));
  } catch (error) {
    if (error.statusCode) throw error;
    const invalid = new Error('No se pudo leer el JSON histórico original de este DTE. Recupere el archivo antes de anularlo.');
    invalid.statusCode = 400;
    throw invalid;
  }
};

const getInvalidationTotalIva = (invoice, original) => {
  const code = original?.identificacion?.tipoDte || invoice.documentTypeCode;
  if (['11', '14'].includes(code)) return 0;
  const summary = original?.resumen;
  let amount = summary?.totalIva;
  if (amount === undefined || amount === null) {
    const ivaTributes = Array.isArray(summary?.tributos)
      ? summary.tributos.filter(tribute => String(tribute.codigo) === IVA_TRIBUTE_CODE) : [];
    if (ivaTributes.length) {
      if (ivaTributes.some(tribute => tribute.valor === null || tribute.valor === undefined
        || !Number.isFinite(Number(tribute.valor)) || Number(tribute.valor) < 0)) {
        const error = new Error('El IVA del DTE original no es válido. Recupere el JSON aceptado antes de anularlo.');
        error.statusCode = 400; throw error;
      }
      amount = ivaTributes.reduce((sum, tribute) => sum + Number(tribute.valor), 0);
    } else if (summary && Object.prototype.hasOwnProperty.call(summary, 'tributos')
      && (summary.tributos === null || Array.isArray(summary.tributos))) {
      amount = 0;
    }
  }
  if (amount === undefined || amount === null) return getOfficialTotalIva(invoice);
  const total = Number(amount);
  if (!Number.isFinite(total) || total < 0) {
    const error = new Error('El IVA del DTE original no es válido. Recupere el JSON aceptado antes de anularlo.');
    error.statusCode = 400; throw error;
  }
  return round2(total);
};

const buildInvalidationJson = (invoice, { originalDte = null } = {}) => {
  const company = invoice.company || {};
  const customer = invoice.customer || {};
  const user = invoice.user || {};
  const pointOfSale = invoice.pointOfSale || {};
  const establishment = pointOfSale.establishment || {};

  const invalidationDate = invoice.invalidatedAt || invoice.invalidationSignedAt || new Date();
  const context = getOriginalDocumentContext(invoice, originalDte);
  const originalReceiver = context.original?.receptor || context.original?.sujetoExcluido || null;
  const hasOriginal = Boolean(context.original);
  const receiverType = hasOriginal
    ? (originalReceiver?.nit ? '36' : originalReceiver?.tipoDocumento ?? null)
    : getDocumentTypeForReceiver(customer.documentType);
  const receiverNumber = hasOriginal
    ? originalReceiver?.nit || originalReceiver?.numDocumento || null
    : getFallbackDocumentNumber(customer.documentNumber, customer.dui, customer.nit);
  const acceptedEvent = invoice.status === 'ANULADO' && invoice.invalidationSignedJws
    ? decodeSignedJson(invoice.invalidationSignedJws) : null;
  // Rescisión: la fecha fiscal corresponde a la operación original. Es obligatoria
  // para CCF/notas y está dentro del intervalo permitido para FE/FEX/FSEE.
  // invalidatedAt conserva separadamente el instante real de la acción.
  const eventDate = acceptedEvent?.identificacion?.fecEmi || acceptedEvent?.identificacion?.fecAnula || context.date;
  const eventTime = acceptedEvent?.identificacion?.horEmi || acceptedEvent?.identificacion?.horAnula
    || getFiscalDateTimeParts(invalidationDate)?.time;
  if (!eventTime) { const error = new Error('La hora de invalidación no es válida.'); error.statusCode = 400; throw error; }

  const userDocumentType = getFallbackDocumentType(user.documentType);
  const userDocumentNumber = getFallbackDocumentNumber(
    user.documentNumber,
    user.dui,
    user.nit,
    company.nit,
    process.env.MH_NIT
  );

  const customerDocumentType = getDocumentTypeForReceiver(customer.documentType);
  const customerDocumentNumber = getFallbackDocumentNumber(
    customer.documentNumber,
    customer.dui,
    customer.nit
  );

  const hasCustomerDocument = Boolean(customerDocumentType && customerDocumentNumber);

  const requesterDocumentType = hasCustomerDocument ? customerDocumentType : '36';
  const requesterDocumentNumber = hasCustomerDocument
    ? customerDocumentNumber
    : getFallbackDocumentNumber(company.nit, userDocumentNumber, process.env.MH_NIT);

  const responsibleName = (
    buildPersonFullName(user) ||
    cleanString(company.legalName) ||
    cleanString(company.commercialName) ||
    'RESPONSABLE'
  );

  const requesterName = hasCustomerDocument
    ? cleanString(customer.name)
    : (
        cleanString(company.legalName) ||
        cleanString(company.commercialName) ||
        responsibleName
      );

  const documentPhone = getContactPhone(
    customer.phone,
    customer.phoneNationalNumber,
    customer.phoneDialCode && customer.phoneNationalNumber
      ? `${customer.phoneDialCode}${customer.phoneNationalNumber}`
      : null,
    company.phone
  );

  const documentEmail = getContactEmail(
    customer.email,
    customer.secondaryEmail,
    company.email,
    process.env.SMTP_FROM_EMAIL
  );

  return {
    identificacion: {
      version: acceptedEvent?.identificacion?.version || getInvalidationEventVersion(),
      ambiente: getEnvironmentCode(company.environment),
      codigoGeneracion: cleanString(invoice.invalidationGenerationCode),
      fecAnula: eventDate,
      horAnula: eventTime
    },
    emisor: {
      nit: cleanDigits(company.nit),
      nombre: cleanString(company.legalName),
      tipoEstablecimiento: getEstablishmentTypeCode(establishment.establishmentType || company.establishmentType),
      nomEstablecimiento: cleanString(establishment.name || company.commercialName || company.legalName),
      codEstableMH: cleanString(establishment.establishmentCode || company.establishmentCode || null),
      codEstable: cleanString(establishment.establishmentCode || company.establishmentCode || null),
      codPuntoVentaMH: cleanString(pointOfSale.code || company.pointOfSaleCode || null),
      codPuntoVenta: cleanString(pointOfSale.code || company.pointOfSaleCode || null),
      telefono: cleanPhone(company.phone) || '00000000',
      correo: cleanString(company.email || process.env.SMTP_FROM_EMAIL || 'facturacion@correo.com')
    },
    documento: {
      tipoDte: context.documentTypeCode,
      codigoGeneracion: cleanString(context.generationCode),
      selloRecibido: cleanString(invoice.receptionSeal),
      numeroControl: cleanString(context.controlNumber),
      fecEmi: context.date,
      montoIva: getInvalidationTotalIva(invoice, context.original),
      codigoGeneracionR: null,
      tipoDocumento: receiverType,
      numDocumento: receiverNumber,
      nombre: hasOriginal ? originalReceiver?.nombre || null : cleanString(customer.name),
      telefono: hasOriginal ? originalReceiver?.telefono || null : documentPhone,
      correo: hasOriginal ? originalReceiver?.correo || null : documentEmail
    },
    motivo: {
      tipoAnulacion: getInvalidationTypeCode(),
      motivoAnulacion: cleanString(invoice.invalidationReason) || 'Anulación solicitada del documento tributario electrónico',
      nombreResponsable: responsibleName,
      tipDocResponsable: userDocumentType,
      numDocResponsable: userDocumentNumber,
      nombreSolicita: requesterName,
      tipDocSolicita: requesterDocumentType,
      numDocSolicita: requesterDocumentNumber
    },
    selloAnulacion: invoice.invalidationReceptionSeal,
    metadataSistema: buildInternalMetadata(invoice)
  };
};

const OFFICIAL_INTERNAL_KEYS = new Set([
  'ambienteNombre',
  'tipoModeloNombre',
  'tipoOperacionNombre',
  'tipoTransmisionNombre',
  'logoDataUrl',
  'usaFovialCotrans',
  'telefonoDetalle',
  'metadataSistema',
  'extras',
  'actividadSecundaria',
  'actividadTerciaria',
  'country',
  'countryName',
  'incotermsCode',
  'incotermsDescription'
]);

const sanitizeOfficialValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeOfficialValue);
  }

  if (value && typeof value === 'object') {
    const output = {};

    Object.entries(value).forEach(([key, currentValue]) => {
      if (OFFICIAL_INTERNAL_KEYS.has(key)) {
        return;
      }

      if (currentValue === undefined) {
        return;
      }

      output[key] = sanitizeOfficialValue(currentValue);
    });

    return output;
  }

  return value;
};

const buildOfficialStandardDteJson = (invoice) => {
  if (invoice.officialDraftJson) {
    const data = structuredClone(invoice.officialDraftJson);
    const id = data.identificacion || {};
    if (String(id.tipoDte) !== String(invoice.documentTypeCode) || id.codigoGeneracion !== invoice.generationCode || id.numeroControl !== invoice.controlNumber) {
      const error = new Error('La identificación del borrador no corresponde al documento almacenado'); error.statusCode = 409; throw error;
    }
    const issuerId = String(data.emisor?.nit || data.emisor?.numDocumento || '').replace(/\D/g, '');
    if (issuerId !== String(invoice.company?.nit || '').replace(/\D/g, '') || id.ambiente !== (invoice.company?.environment === 'PRODUCTION' ? '01' : '00')) {
      const error = new Error('El emisor o ambiente cambió después de guardar el borrador. Revise y guarde nuevamente el documento'); error.statusCode = 409; throw error;
    }
    require('./dte-schema.service').validateFiscalJson(data);
    require('./dte-draft.service').validateTotals(data);
    return data;
  }
  const dte = require('./dte-extended-json.service').adaptDocument(invoice, sanitizeOfficialValue(buildStandardDteJson(invoice)));

  dte.apendice = null;

  return dte;
};

const buildOfficialInvalidationJson = (invoice, options = {}) => {
  const eventJson = sanitizeOfficialValue(buildInvalidationJson(invoice, options));
  delete eventJson.metadataSistema;
  delete eventJson.selloAnulacion;
  if (eventJson.identificacion.version === 3) {
    const id = eventJson.identificacion;
    eventJson.identificacion = {version:3,ambiente:id.ambiente,codigoGeneracion:id.codigoGeneracion,fecEmi:id.fecAnula,horEmi:id.horAnula,fusion:null};
    delete eventJson.emisor.tipoEstablecimiento;
    delete eventJson.emisor.nomEstablecimiento;
    delete eventJson.documento.montoIva;
  }
  return require('./dte-schema.service').validateFiscalJson(eventJson, 'invalidation');
};
const buildInvalidationFileJson = (invoice, options = {}) => {
  const signedJws = invoice.invalidationSignedJws;
  const json = signedJws ? decodeSignedJson(signedJws) : buildOfficialInvalidationJson(invoice, options);
  if (signedJws && (String(json.documento?.codigoGeneracion || '').toUpperCase() !== String(invoice.generationCode || '').toUpperCase()
    || cleanDigits(json.emisor?.nit) !== cleanDigits(invoice.company?.nit))) {
    const error = new Error('La invalidación firmada no corresponde al documento o emisor solicitado.');
    error.statusCode = 400; throw error;
  }
  return { ...json, ...(signedJws ? { firmaElectronica: signedJws } : {}),
    ...(invoice.invalidationReceptionSeal ? { selloRecibido: invoice.invalidationReceptionSeal } : {}) };
};

const buildDteFileJson = invoice => require('./dte-file.service').buildSignedFile(
  cleanString(invoice?.signedJws), cleanString(invoice?.receptionSeal),
  () => buildOfficialStandardDteJson(invoice)
);

const getDteJsonByInvoiceId = async ({ id, user, type = 'document' }) => {
  const invoice = await invoicesService.getInvoiceById(id, {
    user
  });

  if (type !== 'invalidation') {
    const importedArtifact = await invoicesService.findHistoricalImportArtifactForInvoice(invoice);

    if (importedArtifact?.jsonRelativePath) {
      const storedJsonPath = resolveStoredArtifactPath(importedArtifact.jsonRelativePath);
      try {
        const rawJson = await fs.promises.readFile(storedJsonPath, 'utf8');
        return JSON.parse(rawJson.replace(/^\uFEFF/, ''));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          const invalid = new Error('El JSON histórico almacenado para este DTE no es válido');
          invalid.statusCode = 500;
          throw invalid;
        }
        console.warn(`JSON histórico no encontrado para ${invoice.controlNumber}; se regenerará desde la base de datos.`);
      }
    }
  }

  if (type === 'invalidation') {
    if (invoice.status !== 'ANULADO') {
      const error = new Error('Solo se puede generar JSON de anulación para documentos anulados');
      error.statusCode = 400;
      throw error;
    }

    const originalDte = invoice.invalidationSignedJws ? null : await getOriginalDteForInvalidation(invoice);
    return buildInvalidationFileJson(invoice, { originalDte });
  }

  return buildDteFileJson(invoice);
};

module.exports = {
  getOriginalDteForInvalidation,
  getDteJsonByInvoiceId,
  buildStandardDteJson,
  buildOfficialStandardDteJson,
  buildInvalidationJson,
  buildOfficialInvalidationJson,
  amountToSpanishWords
};
