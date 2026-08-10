const { amountToSpanishWords } = require('./dte-json.service');

const EVENT_TYPE_CODES = {
  OPERACIONES_ESPECIALES: '17',
  RETORNO: '18',
  CONTINGENCIA: '19'
};

const IVA_TRIBUTE_CODE = '20';
const IVA_TRIBUTE_DESCRIPTION = 'Impuesto al Valor Agregado 13%';

const round2 = (value) => Number(Number(value || 0).toFixed(2));
const round8 = (value) => Number(Number(value || 0).toFixed(8));

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

const cleanCatalogCode = (value, length = 2) => {
  const digits = cleanDigits(value);

  if (!digits) return null;

  if (digits.length === length) return digits;

  if (digits.length > length) {
    return digits.slice(-length);
  }

  return digits.padStart(length, '0');
};

const EL_SALVADOR_TIME_ZONE =
  process.env.APP_TIMEZONE || 'America/El_Salvador';

const getElSalvadorDateTimeParts = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EL_SALVADOR_TIME_ZONE,
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
  const parts = getElSalvadorDateTimeParts(value);

  return parts
    ? `${parts.year}-${parts.month}-${parts.day}`
    : null;
};

const formatTime = (value) => {
  const parts = getElSalvadorDateTimeParts(value);

  return parts
    ? `${parts.hour}:${parts.minute}:${parts.second}`
    : null;
};

const getEnvironmentCode = (environment) => {
  return environment === 'PRODUCTION' ? '01' : '00';
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

const getEstablishmentTypeCode = (establishmentType) => {
  const map = {
    CASA_MATRIZ: '01',
    SUCURSAL: '02',
    BODEGA: '04',
    PREDIO: '07'
  };

  return map[establishmentType] || '01';
};

const safeJsonArray = (value) => {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
};

const getEventCompany = (context) => context?.company || context?.event?.company || {};
const getEventPointOfSale = (context) => context?.pointOfSale || context?.event?.pointOfSale || {};
const getEventEstablishment = (context) => context?.establishment || getEventPointOfSale(context)?.establishment || {};

const buildCommonIdentification = ({ event, company }) => {
  return {
    version: 1,
    ambiente: getEnvironmentCode(company?.environment),
    tipoModelo: Number(event.tipoModelo || 1),
    tipoOperacion: Number(event.tipoOperacion || 1),
    tipoEvento: String(event.eventTypeCode),
    codigoGeneracion: cleanString(event.generationCode),
    fecEmi: formatDate(event.issuedAt),
    horEmi: formatTime(event.issuedAt),
    tipoMoneda: 'USD'
  };
};

const buildReturnIdentification = ({ event, company }) => {
  return {
    ...buildCommonIdentification({ event, company }),
    tipoContingencia: event.tipoContingencia === undefined ? null : event.tipoContingencia,
    motivoContin: cleanString(event.motivoContin),
    fusion: cleanString(event.fusion)
  };
};

const buildSpecialOperationsIdentification = ({ event, company }) => {
  return buildCommonIdentification({ event, company });
};

const buildReturnRelatedDocuments = ({ event }) => {
  return [
    {
      tipoDocumento: cleanString(event.sourceDocumentTypeCode),
      codigoGeneracion: cleanString(event.sourceGenerationCode),
      fechaEmision: formatDate(event.sourceIssuedAt)
    }
  ];
};

const buildReturnIssuer = ({ event, company, pointOfSale, establishment }) => {
  return {
    nit: cleanDigits(company.nit),
    nombre: cleanString(company.legalName),
    codEstableMH: cleanString(establishment.establishmentCode || company.establishmentCode || 'M001'),
    codEstable: cleanString(establishment.establishmentCode || company.establishmentCode || 'M001'),
    codPuntoVentaMH: cleanString(pointOfSale.code || company.pointOfSaleCode || 'P001'),
    codPuntoVenta: cleanString(pointOfSale.code || company.pointOfSaleCode || 'P001'),
    recintoFiscal: cleanString(event.recintoFiscal),
    tipoRegimen: cleanString(event.tipoRegimen),
    regimen: cleanString(event.regimen),
    tipoItemExpor: event.tipoItemExpor === undefined ? null : event.tipoItemExpor
  };
};

const buildSpecialOperationsIssuer = ({ company }) => {
  return {
    nit: cleanDigits(company.nit),
    nombre: cleanString(company.legalName)
  };
};

const buildContingencyIdentification = ({ event, company }) => {
  return {
    version: 3,
    ambiente: getEnvironmentCode(company?.environment),
    codigoGeneracion: cleanString(event.generationCode),
    fTransmision: formatDate(event.issuedAt),
    hTransmision: formatTime(event.issuedAt)
  };
};

const buildContingencyIssuer = ({ event, company, pointOfSale, establishment }) => {
  return {
    nit: cleanDigits(company.nit),
    nombre: cleanString(company.legalName),
    nombreResponsable: cleanString(event.responsibleName),
    tipoDocResponsable: cleanString(event.responsibleDocumentType || '36'),
    numeroDocResponsable: cleanString(event.responsibleDocumentNumber || company.nit),
    tipoEstablecimiento: getEstablishmentTypeCode(
      establishment?.establishmentType || company?.establishmentType
    ),
    codEstableMH: cleanString(
      establishment?.establishmentCode || company?.establishmentCode || 'M001'
    ),
    codPuntoVenta: cleanString(
      pointOfSale?.code || company?.pointOfSaleCode || 'P001'
    ),
    telefono: cleanPhone(company.phone),
    correo: cleanString(company.email)
  };
};

const buildContingencyDetail = ({ items }) => {
  return items.map((item, index) => ({
    noItem: Number(item.numItem || index + 1),
    tipoDoc: cleanString(item.tipoDocumento),
    codigoGeneracion: cleanString(item.codigoGeneracion)
  }));
};

const buildContingencyReason = ({ event }) => {
  return {
    fInicio: formatDate(event.contingencyStartedAt),
    fFin: formatDate(event.contingencyEndedAt),
    hInicio: formatTime(event.contingencyStartedAt),
    hFin: formatTime(event.contingencyEndedAt),
    tipoContingencia: Number(event.tipoContingencia || 5),
    motivoContingencia: cleanString(event.motivoContin)
  };
};

const buildReturnReceiver = ({ event, sourceInvoice, customer }) => {
  const snapshot = event.receiverSnapshotJson || {};
  const effectiveCustomer = customer || sourceInvoice?.customer || {};

  return {
    tipoDocumento: cleanString(snapshot.tipoDocumento) || getDocumentTypeForReceiver(effectiveCustomer.documentType),
    numDocumento: cleanString(snapshot.numDocumento) || cleanString(effectiveCustomer.documentNumber),
    nombre: cleanString(snapshot.nombre) || cleanString(effectiveCustomer.name),
    codPais: cleanString(snapshot.codPais) || cleanString(effectiveCustomer.countryCode || effectiveCustomer.codPais),
    nombrePais: cleanString(snapshot.nombrePais) || cleanString(effectiveCustomer.countryName || effectiveCustomer.country || effectiveCustomer.nombrePais),
    telefono: cleanPhone(snapshot.telefono || effectiveCustomer.phone),
    correo: cleanString(snapshot.correo || effectiveCustomer.email)
  };
};

const buildReturnBody = ({ items }) => {
  return items.map((item, index) => ({
    numItem: Number(item.numItem || index + 1),
    tipoItem: getItemTypeCode(item.itemType),
    codigoGeneracion: cleanString(item.codigoGeneracion),
    cantidad: round8(item.quantity),
    precioUni: round8(item.unitPrice),
    descripcion: cleanString(item.description),
    codigo: cleanString(item.code),
    uniMedida: getUnitOfMeasureCode(item.unitOfMeasure),
    montoDescu: round8(item.montoDescu),
    codTributo: cleanString(item.codTributo),
    ventaNoSuj: round8(item.ventaNoSuj),
    ventaExenta: round8(item.ventaExenta),
    ventaGravada: round8(item.ventaGravada),
    compra: round8(item.compra),
    tributos: safeJsonArray(item.tributosJson),
    psv: round8(item.psv),
    ivaItem: round8(item.ivaItem),
    noGravado: round8(item.noGravado),
    seguro: round8(item.seguro),
    flete: round8(item.flete),
    ivaRete: round2(item.ivaRete),
    reteRenta: round2(item.reteRenta)
  }));
};

const buildSpecialOperationsBody = ({ items }) => {
  return items.map((item, index) => ({
    numItem: Number(item.numItem || index + 1),
    codigoGeneracionRef: cleanString(item.codigoGeneracionRef),
    tipoDocumento: cleanString(item.tipoDocumento),
    numDocumento: cleanString(item.numDocumento),
    fechaEmision: item.fechaEmision ? formatDate(item.fechaEmision) : null,
    cantidad: Number(item.quantity || 1),
    descripcion: cleanString(item.description),
    docDel: cleanString(item.docDel),
    docAl: cleanString(item.docAl),
    precioUni: round8(item.unitPrice),
    ventaNoSuj: round8(item.ventaNoSuj),
    ventaExenta: round8(item.ventaExenta),
    ventaGravada: round8(item.ventaGravada),
    tributos: safeJsonArray(item.tributosJson)
  }));
};

const buildIvaTributesFromTotal = (totalIva) => {
  const value = round2(totalIva);

  if (value <= 0) return null;

  return [
    {
      codigo: IVA_TRIBUTE_CODE,
      descripcion: IVA_TRIBUTE_DESCRIPTION,
      valor: value
    }
  ];
};

const buildReturnSummary = ({ event }) => {
  const totalPagar = round2(event.totalPagar || event.total);

  return {
    totalNoSuj: round2(event.totalNoSuj),
    totalExenta: round2(event.totalExenta),
    totalGravada: round2(event.totalGravada),
    totalCompraExcluidos: round2(event.totalCompraExcluidos),
    subTotalVentas: round2(event.subTotal),
    tributos: buildIvaTributesFromTotal(event.totalIva),
    totalSeguro: round2(event.totalSeguro),
    totalFlete: round2(event.totalFlete),
    montoTotalOperacion: round2(event.total),
    ivaRete: round2(event.ivaRete),
    reteRenta: round2(event.reteRenta),
    totalNoGravado: round2(event.totalNoGravado),
    totalPagar,
    totalLetras: amountToSpanishWords(totalPagar),
    totalNoOnerosas: round2(event.totalNoOnerosas),
    totalIva: round2(event.totalIva),
    saldoFavor: 0
  };
};

const buildSpecialOperationsSummary = ({ event }) => {
  const total = round2(event.total);

  return {
    totalNoSuj: round2(event.totalNoSuj),
    totalExenta: round2(event.totalExenta),
    totalGravada: round2(event.totalGravada),
    subTotal: round2(event.subTotal),
    tributos: buildIvaTributesFromTotal(event.totalIva),
    total,
    totalLetras: amountToSpanishWords(total)
  };
};

const buildAppendix = ({ event }) => {
  return [
    {
      campo: 'estadoSistema',
      etiqueta: 'Estado en sistema',
      valor: String(event.status || 'GENERADO')
    }
  ];
};

const sanitizeOfficialValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeOfficialValue);
  }

  if (value && typeof value === 'object') {
    const output = {};

    Object.entries(value).forEach(([key, currentValue]) => {
      if (currentValue === undefined) return;
      output[key] = sanitizeOfficialValue(currentValue);
    });

    return output;
  }

  return value;
};

const buildReturnEventJson = ({ event, items, company, pointOfSale, establishment, sourceInvoice, customer }) => {
  const context = {
    event,
    company,
    pointOfSale,
    establishment,
    sourceInvoice,
    customer
  };

  return {
    identificacion: buildReturnIdentification({ event, company }),
    documentoRelacionado: buildReturnRelatedDocuments({ event }),
    emisor: buildReturnIssuer(context),
    documento: buildReturnReceiver(context),
    ventaTercero: null,
    compraTercero: null,
    cuerpoDocumento: buildReturnBody({ items }),
    resumen: buildReturnSummary({ event }),
    apendice: buildAppendix({ event })
  };
};

const buildSpecialOperationsEventJson = ({ event, items, company }) => {
  return {
    identificacion: buildSpecialOperationsIdentification({ event, company }),
    emisor: buildSpecialOperationsIssuer({ company }),
    cuerpoDocumento: buildSpecialOperationsBody({ items }),
    resumen: buildSpecialOperationsSummary({ event }),
    apendice: buildAppendix({ event })
  };
};

const buildContingencyEventJson = ({ event, items, company, pointOfSale, establishment }) => {
  return {
    identificacion: buildContingencyIdentification({ event, company }),
    emisor: buildContingencyIssuer({ event, company, pointOfSale, establishment }),
    detalleDTE: buildContingencyDetail({ items }),
    motivo: buildContingencyReason({ event })
  };
};

const buildEventJson = (context) => {
  const eventTypeCode = String(context?.event?.eventTypeCode || '');

  if (eventTypeCode === EVENT_TYPE_CODES.RETORNO) {
    return buildReturnEventJson(context);
  }

  if (eventTypeCode === EVENT_TYPE_CODES.OPERACIONES_ESPECIALES) {
    return buildSpecialOperationsEventJson(context);
  }

  if (eventTypeCode === EVENT_TYPE_CODES.CONTINGENCIA) {
    return buildContingencyEventJson(context);
  }

  const error = new Error('Tipo de evento no soportado');
  error.statusCode = 400;
  throw error;
};

const buildOfficialEventJson = (context) => {
  const eventJson = sanitizeOfficialValue(buildEventJson(context));
  const eventTypeCode = String(context?.event?.eventTypeCode || '');

  if (eventTypeCode === EVENT_TYPE_CODES.CONTINGENCIA) {
    delete eventJson.apendice;
    return eventJson;
  }

  if (!Object.prototype.hasOwnProperty.call(eventJson, 'apendice')) {
    eventJson.apendice = null;
  }

  return eventJson;
};

module.exports = {
  EVENT_TYPE_CODES,
  buildEventJson,
  buildOfficialEventJson
};
