const invoicesService = require('../invoices/invoices.service');

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
  CHEQUE: '03',
  TRANSFERENCIA: '05',
  DEPOSITO: '06',
  OTRO: '99'
};

const IVA_RATE = 0.13;
const IVA_FACTOR = 1.13;
const IVA_TRIBUTE_CODE = '20';
const IVA_TRIBUTE_DESCRIPTION = 'Impuesto al Valor Agregado 13%';

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

const cleanCatalogCode = (value, length = 2) => {
  const digits = cleanDigits(value);

  if (!digits) return null;

  if (digits.length === length) return digits;

  if (digits.length > length) {
    return digits.slice(-length);
  }

  return digits.padStart(length, '0');
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

const getDteVersion = (documentTypeCode) => {
  const versions = {
    '01': 1,
    '03': 3,
    '05': 3,
    '11': 1,
    '14': 1
  };

  return versions[String(documentTypeCode)] || 1;
};

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
    CASA_MATRIZ: '01',
    SUCURSAL: '02',
    BODEGA: '04',
    PREDIO: '07'
  };

  return map[establishmentType] || '01';
};

const getUnitOfMeasureCode = (unitOfMeasure) => {
  const code = cleanDigits(unitOfMeasure);

  if (!code) return 59;

  return Number(code);
};

const getItemTypeCode = (itemType) => {
  return itemType === 'PRODUCTO' ? 1 : 2;
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

const getInvalidationEventVersion = () => {
  return Number(process.env.MH_INVALIDACION_EVENT_VERSION || 2);
};

const getInvalidationTypeCode = () => {
  return 2;
};

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
  return String(documentTypeCode) === DOCUMENT_TYPE_CODES.NOTA_CREDITO;
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

  if (isExportInvoice(documentTypeCode)) {
    return {
      ...base,
      motivoContigencia: cleanString(invoice.motivoContin)
    };
  }

  return {
    ...base,
    motivoContin: cleanString(invoice.motivoContin)
  };
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
    tipoEstablecimiento: getEstablishmentTypeCode(establishment.establishmentType || company.establishmentType),
    direccion: {
      departamento: cleanCatalogCode(establishment.departmentCode || company.departmentCode, 2),
      municipio: cleanCatalogCode(establishment.municipalityCode || company.municipalityCode, 2),
      complemento: cleanAddressComplement(establishment.addressComplement || company.addressComplement)
    },
    telefono: cleanPhone(company.phone),
    correo: cleanString(company.email),
    codEstableMH: cleanString(establishment.establishmentCode || company.establishmentCode || 'M001'),
    codEstable: cleanString(establishment.establishmentCode || company.establishmentCode || 'M001'),
    codPuntoVentaMH: cleanString(pointOfSale.code || company.pointOfSaleCode || 'P001'),
    codPuntoVenta: cleanString(pointOfSale.code || company.pointOfSaleCode || 'P001')
  };

  if (isCreditNoteDocument(documentTypeCode)) {
    delete issuer.codEstableMH;
    delete issuer.codEstable;
    delete issuer.codPuntoVentaMH;
    delete issuer.codPuntoVenta;
  }

  if (isExcludedSubjectInvoice(documentTypeCode)) {
    delete issuer.nombreComercial;
    delete issuer.tipoEstablecimiento;
  }

  if (isExportInvoice(documentTypeCode)) {
    issuer.tipoItemExpor = getExportItemType(invoice);
    issuer.recintoFiscal = cleanString(invoice.recintoFiscal || company.recintoFiscal) || null;
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

  // DUI: Hacienda requiere 8 dígitos, guion y dígito verificador.
  if (documentTypeCode === '13') {
    const dui = cleanDigits(rawValue);

    if (!dui || dui.length !== 9) {
      const error = new Error(
        'El DUI del receptor debe contener exactamente 9 dígitos.'
      );
      error.statusCode = 400;
      throw error;
    }

    return `${dui.slice(0, 8)}-${dui.slice(8)}`;
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
      departamento: cleanCatalogCode(customer.departmentCode, 2),
      municipio: cleanCatalogCode(customer.municipalityCode, 2),
      complemento: cleanAddressComplement(customer.addressComplement)
    },
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone),
    correo: getContactEmail(customer.email, customer.secondaryEmail, company.email, process.env.SMTP_FROM_EMAIL)
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
      departamento: cleanCatalogCode(customer.departmentCode, 2),
      municipio: cleanCatalogCode(customer.municipalityCode, 2),
      complemento: cleanAddressComplement(customer.addressComplement)
    },
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone),
    correo: getContactEmail(customer.email, customer.secondaryEmail, company.email, process.env.SMTP_FROM_EMAIL)
  };
};

const buildExportReceiver = (invoice) => {
  const customer = invoice.customer || {};
  const company = invoice.company || {};

  if (!customer?.id) {
    return null;
  }

  return {
    nombre: cleanString(customer.name),
    codPais: cleanString(customer.countryCode || customer.codPais || '9300'),
    nombrePais: cleanString(customer.countryName || customer.country || customer.nombrePais || 'EL SALVADOR'),
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
    correo: getContactEmail(customer.email, customer.secondaryEmail, company.email, process.env.SMTP_FROM_EMAIL) || 'facturacion@correo.com'
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
      departamento: cleanCatalogCode(customer.departmentCode, 2),
      municipio: cleanCatalogCode(customer.municipalityCode, 2),
      complemento: cleanAddressComplement(customer.addressComplement)
    },
    telefono: getContactPhone(customer.phone, customer.phoneNationalNumber, company.phone),
    correo: getContactEmail(customer.email, customer.secondaryEmail, company.email, process.env.SMTP_FROM_EMAIL)
  };
};

const buildReceiver = (invoice) => {
  const documentTypeCode = String(invoice.documentTypeCode || '');
  const customer = invoice.customer || {};
  const company = invoice.company || {};

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
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure),
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
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure),
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

const buildCreditNoteBodyItem = ({ invoice, item, index }) => {
  const hasIva = Number(item.gravada || 0) > 0;

  return {
    numItem: index + 1,
    tipoItem: getItemTypeCode(item.itemType),
    numeroDocumento: getRelatedDocumentNumberForItem(invoice),
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    codTributo: null,
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure),
    descripcion: cleanString(item.description),
    precioUni: round4(item.unitPrice),
    montoDescu: 0,
    ventaNoSuj: round2(item.noSuj),
    ventaExenta: round2(item.exenta),
    ventaGravada: round2(item.gravada),
    tributos: hasIva ? [IVA_TRIBUTE_CODE] : null
  };
};

const buildExportBodyItem = ({ item, index }) => {
  const ventaGravada = round2(item.gravada || item.total || item.subtotal);

  return {
    numItem: index + 1,
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure),
    descripcion: cleanString(item.description),
    precioUni: round4(item.unitPrice),
    montoDescu: 0,
    ventaGravada,
    tributos: null,
    noGravado: 0
  };
};

const buildExcludedSubjectBodyItem = ({ item, index }) => {
  return {
    numItem: index + 1,
    tipoItem: getItemTypeCode(item.itemType),
    cantidad: round4(item.quantity),
    codigo: cleanString(item.code),
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure),
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

const buildIvaTributes = (invoice) => {
  const totalIva = getOfficialTotalIva(invoice);

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
  const montoTotalOperacion = round2(subTotal - retencion);
  const totalPagar = round2(invoice.total || montoTotalOperacion);

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
    ivaRete1: retencion,
    reteRenta: 0,
    montoTotalOperacion,
    totalNoGravado: 0,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    totalIva,
    saldoFavor: 0,
    condicionOperacion: operationConditionCode,
    pagos: buildPayments(invoice, totalPagar),
    numPagoElectronico: null
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
  const ivaPerci1 = 0;
  const ivaRete1 = round2(invoice.retention1);
  const reteRenta = 0;
  const montoTotalOperacion = round2(subTotal + totalIva + ivaPerci1 - ivaRete1 - reteRenta);
  const totalPagar = round2(invoice.total || montoTotalOperacion);

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
    ivaPerci1,
    ivaRete1,
    reteRenta,
    montoTotalOperacion,
    totalNoGravado: 0,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    saldoFavor: 0,
    condicionOperacion: operationConditionCode,
    pagos: buildPayments(invoice, totalPagar),
    numPagoElectronico: null
  };
};

const buildCreditNoteSummary = (invoice) => {
  const operationConditionCode = getOperationConditionCode(invoice.operationCondition);

  const totalNoSuj = round2(invoice.noSuj);
  const totalExenta = round2(invoice.exenta);
  const totalGravada = round2(invoice.gravada);
  const subTotalVentas = round2(totalNoSuj + totalExenta + totalGravada);
  const subTotal = round2(invoice.subtotal);
  const totalIva = getOfficialTotalIva(invoice);
  const ivaPerci1 = 0;
  const ivaRete1 = round2(invoice.retention1);
  const reteRenta = 0;
  const montoTotalOperacion = round2(subTotal + totalIva + ivaPerci1 - ivaRete1 - reteRenta);

  return {
    totalNoSuj,
    totalExenta,
    totalGravada,
    subTotalVentas,
    descuNoSuj: 0,
    descuExenta: 0,
    descuGravada: 0,
    totalDescu: 0,
    tributos: buildIvaTributes(invoice),
    subTotal,
    ivaPerci1,
    ivaRete1,
    reteRenta,
    montoTotalOperacion,
    totalLetras: amountToSpanishWords(montoTotalOperacion),
    condicionOperacion: operationConditionCode
  };
};

const buildExportSummary = (invoice) => {
  const operationConditionCode = getOperationConditionCode(invoice.operationCondition);

  const totalGravada = round2(invoice.gravada || invoice.subtotal || invoice.total);
  const descuento = 0;
  const porcentajeDescuento = 0;
  const totalDescu = 0;
  const seguro = round2(invoice.insurance || invoice.seguro || 0);
  const flete = round2(invoice.freight || invoice.flete || 0);
  const montoTotalOperacion = round2(totalGravada + seguro + flete);
  const totalNoGravado = 0;
  const totalPagar = round2(invoice.total || montoTotalOperacion);

  return {
    totalGravada,
    descuento,
    porcentajeDescuento,
    totalDescu,
    seguro,
    flete,
    montoTotalOperacion,
    totalNoGravado,
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
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
  const ivaRete1 = round2(invoice.retention1);
  const reteRenta = 0;
  const totalPagar = round2(invoice.total || (subTotal - ivaRete1 - reteRenta));

  return {
    totalCompra,
    descu,
    totalDescu,
    subTotal,
    ivaRete1,
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
      sujetoExcluido: buildExcludedSubject(invoice.customer || {}, invoice.company || {}),
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
      extension: buildExtension(invoice),
      apendice: buildAppendix(invoice)
    };
  }

  if (isExportInvoice(documentTypeCode)) {
    return {
      identificacion: buildIdentification(invoice),
      emisor: buildIssuer(invoice),
      receptor: buildReceiver(invoice),
      otrosDocumentos: null,
      ventaTercero: null,
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

  dte.extension = buildExtension(invoice);
  dte.ventaTercero = null;

  return dte;
};

const buildInvalidationJson = (invoice) => {
  const company = invoice.company || {};
  const customer = invoice.customer || {};
  const user = invoice.user || {};
  const pointOfSale = invoice.pointOfSale || {};
  const establishment = pointOfSale.establishment || {};

  const invalidationDate = invoice.invalidatedAt || invoice.invalidationSignedAt || new Date();

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

  if (!documentPhone) {
    const error = new Error(
      'No se puede anular el DTE porque el evento de anulación requiere teléfono en el bloque documento. Actualice el teléfono del cliente o de la empresa antes de anular.'
    );

    error.statusCode = 400;
    throw error;
  }

  if (!documentEmail) {
    const error = new Error(
      'No se puede anular el DTE porque el evento de anulación requiere correo electrónico válido en el bloque documento. Actualice el correo del cliente o de la empresa antes de anular.'
    );

    error.statusCode = 400;
    throw error;
  }

  return {
    identificacion: {
      version: getInvalidationEventVersion(),
      ambiente: getEnvironmentCode(company.environment),
      codigoGeneracion: cleanString(invoice.invalidationGenerationCode),
      fecAnula: formatDate(invalidationDate),
      horAnula: formatTime(invalidationDate)
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
      tipoDte: String(invoice.documentTypeCode || '').padStart(2, '0'),
      codigoGeneracion: cleanString(invoice.generationCode),
      selloRecibido: cleanString(invoice.receptionSeal),
      numeroControl: cleanString(invoice.controlNumber),
      fecEmi: formatDate(invoice.issuedAt),
      montoIva: getOfficialTotalIva(invoice),
      codigoGeneracionR: null,
      tipoDocumento: customerDocumentType,
      numDocumento: customerDocumentNumber,
      nombre: cleanString(customer.name),
      telefono: documentPhone,
      correo: documentEmail
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
  const dte = sanitizeOfficialValue(buildStandardDteJson(invoice));

  dte.apendice = null;

  return dte;
};

const buildOfficialInvalidationJson = (invoice) => {
  const eventJson = sanitizeOfficialValue(buildInvalidationJson(invoice));

  delete eventJson.metadataSistema;
  delete eventJson.selloAnulacion;

  return eventJson;
};

const getDteJsonByInvoiceId = async ({ id, user, type = 'document' }) => {
  const invoice = await invoicesService.getInvoiceById(id, {
    user
  });

  if (type === 'invalidation') {
    if (invoice.status !== 'ANULADO') {
      const error = new Error('Solo se puede generar JSON de anulación para documentos anulados');
      error.statusCode = 400;
      throw error;
    }

    return buildInvalidationJson(invoice);
  }

  return buildStandardDteJson(invoice);
};

module.exports = {
  getDteJsonByInvoiceId,
  buildStandardDteJson,
  buildOfficialStandardDteJson,
  buildInvalidationJson,
  buildOfficialInvalidationJson,
  amountToSpanishWords
};