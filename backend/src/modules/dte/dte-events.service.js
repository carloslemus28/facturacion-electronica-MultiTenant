const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../../config/database');

const DteEvent = require('./dte-event.model');
const DteEventItem = require('./dte-event-item.model');
const Invoice = require('../invoices/invoice.model');
const InvoiceItem = require('../invoices/invoice-item.model');
const Customer = require('../customers/customer.model');
const Product = require('../products/product.model');
const Company = require('../companies/company.model');
const PointOfSale = require('../companies/point-of-sale.model');
const Establishment = require('../companies/establishment.model');
const User = require('../users/user.model');
const Role = require('../users/role.model');

const dteSignerService = require('./dte-signer.service');
const dteTransmissionService = require('./dte-transmission.service');
const dteEventJsonService = require('./dte-event-json.service');

const EVENT_TYPE_CODES = dteEventJsonService.EVENT_TYPE_CODES;

const EVENT_TYPE_NAMES = {
  [EVENT_TYPE_CODES.OPERACIONES_ESPECIALES]: 'Evento de Operaciones Especiales',
  [EVENT_TYPE_CODES.RETORNO]: 'Evento de Retorno',
  [EVENT_TYPE_CODES.CONTINGENCIA]: 'Evento de Contingencia'
};

const RETURN_ALLOWED_DOCUMENT_TYPES = ['01', '11', '14'];
const CONTINGENCY_ALLOWED_DOCUMENT_TYPES = ['01', '03', '04', '05', '06', '11', '14'];
const IVA_RATE = 0.13;
const IVA_FACTOR = 1.13;
const IVA_TRIBUTE_CODE = '20';

const round2 = (value) => Number(Number(value || 0).toFixed(2));
const round4 = (value) => Number(Number(value || 0).toFixed(4));
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

const getSourceInvoiceIdFromData = (data = {}) => {
  return (
    data.sourceInvoiceId ||
    data.invoiceId ||
    data.relatedInvoiceId ||
    data.source_invoice_id ||
    data.related_invoice_id ||
    null
  );
};

const normalizeReturnItemInput = (item = {}) => {
  return {
    ...item,

    sourceInvoiceItemId:
      item.sourceInvoiceItemId ||
      item.invoiceItemId ||
      item.relatedInvoiceItemId ||
      item.sourceItemId ||
      item.itemId ||
      item.source_invoice_item_id ||
      item.invoice_item_id ||
      null,

    productId:
      item.productId ||
      item.product_id ||
      null,

    code:
      item.code ||
      item.codigo ||
      null,

    description:
      item.description ||
      item.descripcion ||
      null,

    quantity:
      item.quantity ??
      item.cantidad ??
      null,

    unitPrice:
      item.unitPrice ??
      item.precioUni ??
      item.precioUnitario,

    unitOfMeasure:
      item.unitOfMeasure ||
      item.uniMedida ||
      item.unidadMedida ||
      null,

    itemType:
      item.itemType ||
      item.tipoItem ||
      null,

    montoDescu:
      item.montoDescu ??
      item.discount ??
      item.descuento ??
      0,

    codTributo:
      item.codTributo ||
      null,

    psv:
      item.psv ??
      0,

    noGravado:
      item.noGravado ??
      0,

    seguro:
      item.seguro ??
      0,

    flete:
      item.flete ??
      0,

    ivaRete:
      item.ivaRete ??
      0,

    reteRenta:
      item.reteRenta ??
      0
  };
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

const safeNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const calculateIncludedIva = (grossAmount) => {
  const amount = safeNumber(grossAmount);
  if (amount <= 0) return 0;
  return round2(amount - (amount / IVA_FACTOR));
};

const calculateSeparatedIva = (netAmount) => {
  const amount = safeNumber(netAmount);
  if (amount <= 0) return 0;
  return round2(amount * IVA_RATE);
};

const parseJsonArray = (value) => {
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

  if (!company) {
    const error = new Error('El usuario no tiene empresa emisora asignada');
    error.statusCode = 400;
    throw error;
  }

  if (!dbUser.pointOfSale) {
    const error = new Error('El usuario no tiene punto de venta asignado');
    error.statusCode = 400;
    throw error;
  }

  return {
    id: dbUser.id,
    username: dbUser.username,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    email: dbUser.email,
    roles,
    company,
    pointOfSale: dbUser.pointOfSale,
    establishment: dbUser.pointOfSale.establishment
  };
};

const isAdminUser = (user) => {
  return Array.isArray(user?.roles) && user.roles.includes('ADMIN');
};

const validateSameCompany = ({ companyId, user }) => {
  if (!user?.company || Number(companyId) !== Number(user.company.id)) {
    const error = new Error('No tiene permiso para operar documentos de otra empresa');
    error.statusCode = 403;
    throw error;
  }
};

const validateSameEstablishment = ({ pointOfSaleId, user }) => {
  if (isAdminUser(user)) return;

  if (!user?.pointOfSale?.establishmentId) {
    const error = new Error('El usuario no tiene establecimiento o sucursal asignada');
    error.statusCode = 403;
    throw error;
  }

  if (Number(pointOfSaleId) !== Number(user.pointOfSale.id)) {
    const error = new Error('No tiene permiso para operar documentos de otro punto de venta');
    error.statusCode = 403;
    throw error;
  }
};

const loadSourceInvoice = async ({ id, companyId = null, transaction = null }) => {
  const invoice = await Invoice.findOne({
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
        as: 'pointOfSale',
        include: [
          {
            model: Establishment,
            as: 'establishment'
          }
        ]
      },
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

  if (!invoice) {
    const error = new Error('DTE relacionado no encontrado');
    error.statusCode = 404;
    throw error;
  }

  return invoice;
};

const validateSourceInvoiceForReturn = ({ invoice, user }) => {
  validateSameCompany({
    companyId: invoice.companyId,
    user
  });

  if (!isAdminUser(user) && Number(invoice.pointOfSaleId) !== Number(user.pointOfSale.id)) {
    const error = new Error('No tiene permiso para generar eventos sobre documentos de otro punto de venta');
    error.statusCode = 403;
    throw error;
  }

  if (!RETURN_ALLOWED_DOCUMENT_TYPES.includes(String(invoice.documentTypeCode))) {
    const error = new Error('El Evento de Retorno solo puede relacionarse con FE, FEXE o FSEE');
    error.statusCode = 400;
    throw error;
  }

  if (invoice.status !== 'ACEPTADO') {
    const error = new Error('Solo se puede generar Evento de Retorno sobre DTE aceptado por Hacienda');
    error.statusCode = 400;
    throw error;
  }

  if (!invoice.receptionSeal) {
    const error = new Error('El DTE relacionado debe tener sello de recepción');
    error.statusCode = 400;
    throw error;
  }

  const baseDate = invoice.acceptedAt || invoice.transmittedAt || invoice.issuedAt;
  const maxDate = new Date(baseDate);
  maxDate.setMonth(maxDate.getMonth() + 3);

  if (new Date() > maxDate) {
    const error = new Error('El plazo máximo para emitir Evento de Retorno es de tres meses desde el sello de recepción');
    error.statusCode = 400;
    throw error;
  }
};

const buildDateTimeFromInputs = ({ dateValue, timeValue, fallback = null }) => {
  if (dateValue && String(dateValue).includes('T')) {
    const date = new Date(dateValue);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  if (dateValue) {
    const dateText = String(dateValue).slice(0, 10);
    const timeText = timeValue ? String(timeValue).slice(0, 8) : '00:00:00';
    const date = new Date(`${dateText}T${timeText}-06:00`);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  if (fallback) {
    const fallbackDate = new Date(fallback);

    if (!Number.isNaN(fallbackDate.getTime())) {
      return fallbackDate;
    }
  }

  return new Date();
};

const normalizeInvoiceIds = (data = {}) => {
  const raw = data.invoiceIds || data.invoices || data.documentIds || data.dteIds || [];

  if (!Array.isArray(raw)) return [];

  return [...new Set(
    raw
      .map((item) => Number(typeof item === 'object' ? item.id || item.invoiceId : item))
      .filter((item) => Number.isInteger(item) && item > 0)
  )];
};

const validateInvoiceForContingencyEvent = ({ invoice, user }) => {
  validateSameCompany({
    companyId: invoice.companyId,
    user
  });

  if (!isAdminUser(user) && Number(invoice.pointOfSaleId) !== Number(user.pointOfSale.id)) {
    const error = new Error('No tiene permiso para informar contingencia sobre documentos de otro punto de venta');
    error.statusCode = 403;
    throw error;
  }

  if (!CONTINGENCY_ALLOWED_DOCUMENT_TYPES.includes(String(invoice.documentTypeCode))) {
    const error = new Error(`El DTE ${invoice.controlNumber} no corresponde a un tipo permitido para contingencia`);
    error.statusCode = 400;
    throw error;
  }

  if (invoice.receptionSeal || invoice.status === 'ACEPTADO') {
    const error = new Error(`El DTE ${invoice.controlNumber} ya tiene sello o está aceptado; no puede informarse en contingencia`);
    error.statusCode = 400;
    throw error;
  }

  if (invoice.status === 'ANULADO') {
    const error = new Error(`El DTE ${invoice.controlNumber} está anulado; no puede informarse en contingencia`);
    error.statusCode = 400;
    throw error;
  }
};

const buildReceiverSnapshotFromInvoice = (invoice) => {
  const customer = invoice.customer || {};

  return {
    tipoDocumento: getDocumentTypeForReceiver(customer.documentType),
    numDocumento: cleanString(customer.documentNumber),
    nombre: cleanString(customer.name),
    codPais: cleanString(customer.countryCode || customer.codPais),
    nombrePais: cleanString(customer.countryName || customer.country || customer.nombrePais),
    telefono: cleanString(customer.phone),
    correo: cleanString(customer.email)
  };
};

const resolveReturnItemsInput = ({ data, sourceInvoice }) => {
  const rawItems = Array.isArray(data.items) && data.items.length > 0
    ? data.items
    : (sourceInvoice.items || []).map((item) => ({
        sourceInvoiceItemId: item.id,
        quantity: item.quantity
      }));

  return rawItems.map((item) => normalizeReturnItemInput(item));
};

const getSourceItemByInput = ({ sourceInvoice, input }) => {
  const sourceItems = sourceInvoice.items || [];

  if (input.sourceInvoiceItemId) {
    return sourceItems.find((item) => Number(item.id) === Number(input.sourceInvoiceItemId));
  }

  if (input.productId) {
    return sourceItems.find((item) => Number(item.productId) === Number(input.productId));
  }

  if (input.code) {
    return sourceItems.find((item) => cleanString(item.code) === cleanString(input.code));
  }

  if (input.description) {
    return sourceItems.find((item) => cleanString(item.description) === cleanString(input.description));
  }

  return null;
};

const buildReturnEventItemPayload = ({ sourceInvoice, sourceItem, input, index }) => {
  if (!sourceItem) {
    const error = new Error('Uno de los ítems del retorno no existe en el DTE relacionado');
    error.statusCode = 400;
    throw error;
  }

  const sourceQuantity = safeNumber(sourceItem.quantity);
  const requestedQuantity = safeNumber(input.quantity || sourceQuantity);

  if (requestedQuantity <= 0) {
    const error = new Error('La cantidad de retorno debe ser mayor a cero');
    error.statusCode = 400;
    throw error;
  }

  if (requestedQuantity > sourceQuantity) {
    const error = new Error(`La cantidad de retorno no puede superar la cantidad original del ítem ${sourceItem.description}`);
    error.statusCode = 400;
    throw error;
  }

  const ratio = sourceQuantity > 0 ? requestedQuantity / sourceQuantity : 0;
  const documentTypeCode = String(sourceInvoice.documentTypeCode || '');

  const ventaNoSuj = round8(safeNumber(sourceItem.noSuj) * ratio);
  const ventaExenta = round8(safeNumber(sourceItem.exenta) * ratio);
  const ventaGravada = round8(safeNumber(sourceItem.gravada) * ratio);
  const compra = documentTypeCode === '14'
    ? round8(safeNumber(sourceItem.total || sourceItem.subtotal || sourceItem.gravada || sourceItem.exenta || sourceItem.noSuj) * ratio)
    : 0;

  const ivaItem = documentTypeCode === '01'
    ? round8(safeNumber(sourceItem.iva || calculateIncludedIva(sourceItem.gravada)) * ratio)
    : 0;

  const total = round8(
    ventaNoSuj +
    ventaExenta +
    ventaGravada +
    compra +
    round8(safeNumber(sourceItem.fovial) * ratio) +
    round8(safeNumber(sourceItem.cotrans) * ratio)
  );

  return {
    sourceInvoiceItemId: sourceItem.id,
    numItem: index + 1,
    itemType: input.itemType || sourceItem.itemType || 'SERVICIO',
    codigoGeneracion: sourceInvoice.generationCode,
    code: input.code || sourceItem.code || null,
    unitOfMeasure: input.unitOfMeasure || sourceItem.unitOfMeasure || '59',
    description: input.description || sourceItem.description,
    quantity: round8(requestedQuantity),
    unitPrice: round8(input.unitPrice ?? sourceItem.unitPrice),
    montoDescu: round8(input.montoDescu || 0),
    codTributo: input.codTributo || null,
    ventaNoSuj,
    ventaExenta,
    ventaGravada,
    compra,
    tributosJson: ventaGravada > 0 && documentTypeCode !== '11' && documentTypeCode !== '14'
      ? [IVA_TRIBUTE_CODE]
      : null,
    psv: round8(input.psv || 0),
    ivaItem,
    noGravado: round8(input.noGravado || 0),
    seguro: round8(input.seguro || 0),
    flete: round8(input.flete || 0),
    ivaRete: round2(input.ivaRete || 0),
    reteRenta: round2(input.reteRenta || 0),
    total
  };
};

const calculateReturnTotals = ({ items }) => {
  const totals = items.reduce((acc, item) => {
    acc.totalNoSuj += safeNumber(item.ventaNoSuj);
    acc.totalExenta += safeNumber(item.ventaExenta);
    acc.totalGravada += safeNumber(item.ventaGravada);
    acc.totalCompraExcluidos += safeNumber(item.compra);
    acc.totalSeguro += safeNumber(item.seguro);
    acc.totalFlete += safeNumber(item.flete);
    acc.ivaRete += safeNumber(item.ivaRete);
    acc.reteRenta += safeNumber(item.reteRenta);
    acc.totalNoGravado += safeNumber(item.noGravado);
    acc.totalIva += safeNumber(item.ivaItem);
    return acc;
  }, {
    totalNoSuj: 0,
    totalExenta: 0,
    totalGravada: 0,
    totalCompraExcluidos: 0,
    totalSeguro: 0,
    totalFlete: 0,
    ivaRete: 0,
    reteRenta: 0,
    totalNoGravado: 0,
    totalIva: 0
  });

  const subTotal = round4(
    totals.totalNoSuj +
    totals.totalExenta +
    totals.totalGravada +
    totals.totalCompraExcluidos
  );

  const total = round4(
    subTotal +
    totals.totalSeguro +
    totals.totalFlete +
    totals.totalNoGravado
  );

  const totalPagar = round4(total - totals.ivaRete - totals.reteRenta);

  return {
    totalNoSuj: round4(totals.totalNoSuj),
    totalExenta: round4(totals.totalExenta),
    totalGravada: round4(totals.totalGravada),
    totalCompraExcluidos: round4(totals.totalCompraExcluidos),
    subTotal,
    totalSeguro: round4(totals.totalSeguro),
    totalFlete: round4(totals.totalFlete),
    ivaRete: round4(totals.ivaRete),
    reteRenta: round4(totals.reteRenta),
    totalNoGravado: round4(totals.totalNoGravado),
    totalNoOnerosas: 0,
    totalIva: round4(totals.totalIva),
    totalPagar,
    total
  };
};

const normalizeSpecialOperationItem = ({ item, index }) => {
  if (!item.descripcion && !item.description) {
    const error = new Error('Cada ítem del Evento de Operaciones Especiales debe tener descripción');
    error.statusCode = 400;
    throw error;
  }

  if (!item.tipoDocumento) {
    const error = new Error('Cada ítem del Evento de Operaciones Especiales debe tener tipoDocumento');
    error.statusCode = 400;
    throw error;
  }

  const quantity = Number(item.cantidad || item.quantity || 1);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    const error = new Error('La cantidad del Evento de Operaciones Especiales debe ser un entero mayor a cero');
    error.statusCode = 400;
    throw error;
  }

  const ventaNoSuj = round8(item.ventaNoSuj || 0);
  const ventaExenta = round8(item.ventaExenta || 0);
  const ventaGravada = round8(item.ventaGravada || 0);

  return {
    numItem: index + 1,
    codigoGeneracionRef: cleanString(item.codigoGeneracionRef),
    tipoDocumento: cleanString(item.tipoDocumento),
    numDocumento: cleanString(item.numDocumento),
    fechaEmision: item.fechaEmision || null,
    quantity,
    description: cleanString(item.descripcion || item.description),
    docDel: cleanString(item.docDel),
    docAl: cleanString(item.docAl),
    unitPrice: round8(item.precioUni ?? item.unitPrice ?? 0),
    ventaNoSuj,
    ventaExenta,
    ventaGravada,
    tributosJson: parseJsonArray(item.tributos) || (ventaGravada > 0 ? [IVA_TRIBUTE_CODE] : null),
    total: round8(ventaNoSuj + ventaExenta + ventaGravada)
  };
};

const calculateSpecialOperationTotals = ({ items }) => {
  const totals = items.reduce((acc, item) => {
    acc.totalNoSuj += safeNumber(item.ventaNoSuj);
    acc.totalExenta += safeNumber(item.ventaExenta);
    acc.totalGravada += safeNumber(item.ventaGravada);
    return acc;
  }, {
    totalNoSuj: 0,
    totalExenta: 0,
    totalGravada: 0
  });

  const subTotal = round4(totals.totalNoSuj + totals.totalExenta + totals.totalGravada);

  return {
    totalNoSuj: round4(totals.totalNoSuj),
    totalExenta: round4(totals.totalExenta),
    totalGravada: round4(totals.totalGravada),
    subTotal,
    total: subTotal,
    totalPagar: subTotal,
    totalIva: round4(calculateSeparatedIva(totals.totalGravada))
  };
};

const getEventItems = async (eventId, transaction = null) => {
  return DteEventItem.findAll({
    where: {
      eventId
    },
    order: [['numItem', 'ASC']],
    transaction
  });
};

const getEventContext = async ({ id, user = null, transaction = null }) => {
  const event = await DteEvent.findOne({
    where: {
      id,
      ...(user?.company?.id ? { companyId: user.company.id } : {})
    },
    transaction
  });

  if (!event) {
    const error = new Error('Evento DTE no encontrado');
    error.statusCode = 404;
    throw error;
  }

  const company = await Company.findByPk(event.companyId, { transaction });
  const pointOfSale = await PointOfSale.findOne({
    where: { id: event.pointOfSaleId, companyId: event.companyId },
    include: [
      {
        model: Establishment,
        as: 'establishment'
      }
    ],
    transaction
  });
  const sourceInvoice = event.sourceInvoiceId
    ? await loadSourceInvoice({ id: event.sourceInvoiceId, companyId: event.companyId, transaction })
    : null;
  const customer = sourceInvoice?.customer || null;
  const items = await getEventItems(event.id, transaction);

  if (user) {
    validateSameCompany({
      companyId: event.companyId,
      user
    });

    validateSameEstablishment({
      pointOfSaleId: event.pointOfSaleId,
      user
    });
  }

  return {
    event,
    items,
    company,
    pointOfSale,
    establishment: pointOfSale?.establishment || null,
    sourceInvoice,
    customer
  };
};

const listEvents = async ({ user }) => {
  const currentUser = await resolveUserContext(user);

  const where = {
    companyId: currentUser.company.id
  };

  if (!isAdminUser(currentUser)) {
    where.pointOfSaleId = currentUser.pointOfSale.id;
  }

  return DteEvent.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });
};

const getEventById = async ({ id, user }) => {
  const currentUser = await resolveUserContext(user);
  return getEventContext({
    id,
    user: currentUser
  });
};

const createReturnEvent = async ({ data, user }) => {
  const currentUser = await resolveUserContext(user);
  const sourceInvoiceId = getSourceInvoiceIdFromData(data);

  if (!sourceInvoiceId) {
    const error = new Error('Debe indicar el DTE relacionado para el Evento de Retorno');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    const sourceInvoice = await loadSourceInvoice({
      id: sourceInvoiceId,
      companyId: currentUser.company.id,
      transaction
    });

    validateSourceInvoiceForReturn({
      invoice: sourceInvoice,
      user: currentUser
    });

    const existingAcceptedOrGeneratedReturn = await DteEvent.findOne({
      where: {
        companyId: currentUser.company.id,
        sourceInvoiceId: sourceInvoice.id,
        eventTypeCode: EVENT_TYPE_CODES.RETORNO,
        status: ['GENERADO', 'FIRMADO', 'ACEPTADO']
      },
      transaction
    });

    if (existingAcceptedOrGeneratedReturn) {
      const error = new Error('Este DTE ya tiene un Evento de Retorno generado o aceptado');
      error.statusCode = 400;
      throw error;
    }

    const inputItems = resolveReturnItemsInput({
      data,
      sourceInvoice
    });

    const itemPayloads = inputItems.map((input, index) => {
      const sourceItem = getSourceItemByInput({
        sourceInvoice,
        input
      });

      return buildReturnEventItemPayload({
        sourceInvoice,
        sourceItem,
        input,
        index
      });
    });

    const totals = calculateReturnTotals({
      items: itemPayloads
    });

    const event = await DteEvent.create({
      companyId: currentUser.company.id,
      pointOfSaleId: currentUser.pointOfSale.id,
      userId: currentUser.id,
      sourceInvoiceId: sourceInvoice.id,
      eventTypeCode: EVENT_TYPE_CODES.RETORNO,
      eventTypeName: EVENT_TYPE_NAMES[EVENT_TYPE_CODES.RETORNO],
      generationCode: uuidv4().toUpperCase(),
      status: 'GENERADO',
      issuedAt: data.issuedAt ? new Date(data.issuedAt) : new Date(),
      tipoModelo: data.tipoModelo || 1,
      tipoOperacion: data.tipoOperacion || 1,
      tipoContingencia: data.tipoContingencia || null,
      motivoContin: data.motivoContin || null,
      fusion: cleanDigits(data.fusion),
      recintoFiscal: cleanString(data.recintoFiscal),
      tipoRegimen: cleanString(data.tipoRegimen),
      regimen: cleanString(data.regimen),
      tipoItemExpor: data.tipoItemExpor || null,
      sourceDocumentTypeCode: sourceInvoice.documentTypeCode,
      sourceControlNumber: sourceInvoice.controlNumber,
      sourceGenerationCode: sourceInvoice.generationCode,
      sourceIssuedAt: sourceInvoice.issuedAt,
      sourceReceptionSeal: sourceInvoice.receptionSeal,
      receiverSnapshotJson: buildReceiverSnapshotFromInvoice(sourceInvoice),
      ...totals,
      notes: data.notes || data.reason || data.motivo || null
    }, { transaction });

    for (const itemPayload of itemPayloads) {
      await DteEventItem.create({
        eventId: event.id,
        ...itemPayload
      }, { transaction });
    }

    const context = await getEventContext({
      id: event.id,
      transaction
    });

    const officialEventJson = dteEventJsonService.buildOfficialEventJson(context);

    await event.update({
      officialEventJson
    }, { transaction });

    return getEventContext({
      id: event.id,
      transaction
    });
  });
};

const createSpecialOperationsEvent = async ({ data, user }) => {
  const currentUser = await resolveUserContext(user);

  if (!Array.isArray(data.items) || data.items.length === 0) {
    const error = new Error('Debe agregar al menos un ítem al Evento de Operaciones Especiales');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    const itemPayloads = data.items.map((item, index) => normalizeSpecialOperationItem({
      item,
      index
    }));

    const totals = calculateSpecialOperationTotals({
      items: itemPayloads
    });

    const event = await DteEvent.create({
      companyId: currentUser.company.id,
      pointOfSaleId: currentUser.pointOfSale.id,
      userId: currentUser.id,
      sourceInvoiceId: null,
      eventTypeCode: EVENT_TYPE_CODES.OPERACIONES_ESPECIALES,
      eventTypeName: EVENT_TYPE_NAMES[EVENT_TYPE_CODES.OPERACIONES_ESPECIALES],
      generationCode: uuidv4().toUpperCase(),
      status: 'GENERADO',
      issuedAt: data.issuedAt ? new Date(data.issuedAt) : new Date(),
      tipoModelo: 1,
      tipoOperacion: 1,
      ...totals,
      notes: data.notes || null
    }, { transaction });

    for (const itemPayload of itemPayloads) {
      await DteEventItem.create({
        eventId: event.id,
        ...itemPayload
      }, { transaction });
    }

    const context = await getEventContext({
      id: event.id,
      transaction
    });

    const officialEventJson = dteEventJsonService.buildOfficialEventJson(context);

    await event.update({
      officialEventJson
    }, { transaction });

    return getEventContext({
      id: event.id,
      transaction
    });
  });
};

const createContingencyEvent = async ({ data, user }) => {
  const currentUser = await resolveUserContext(user);
  const invoiceIds = normalizeInvoiceIds(data);

  if (invoiceIds.length === 0) {
    const error = new Error('Debe indicar al menos un DTE generado en contingencia');
    error.statusCode = 400;
    throw error;
  }

  if (invoiceIds.length > 1000) {
    const error = new Error('El evento de contingencia permite informar hasta 1000 DTE por evento');
    error.statusCode = 400;
    throw error;
  }

  const tipoContingencia = Number(data.tipoContingencia || data.contingencyType || 5);
  const motivoContin = cleanString(data.motivoContin || data.motivoContingencia || data.reason);

  if (!Number.isInteger(tipoContingencia) || tipoContingencia < 1 || tipoContingencia > 5) {
    const error = new Error('Debe indicar un tipo de contingencia válido según CAT-005');
    error.statusCode = 400;
    throw error;
  }

  if (tipoContingencia === 5 && !motivoContin) {
    const error = new Error('Debe indicar el motivo de contingencia cuando el tipo de contingencia es 5');
    error.statusCode = 400;
    throw error;
  }

  const contingencyStartedAt = buildDateTimeFromInputs({
    dateValue: data.startDate || data.fInicio || data.contingencyStartDate,
    timeValue: data.startTime || data.hInicio || data.contingencyStartTime
  });

  const contingencyEndedAt = buildDateTimeFromInputs({
    dateValue: data.endDate || data.fFin || data.contingencyEndDate,
    timeValue: data.endTime || data.hFin || data.contingencyEndTime,
    fallback: contingencyStartedAt
  });

  if (contingencyEndedAt < contingencyStartedAt) {
    const error = new Error('La fecha y hora de fin de contingencia debe ser mayor o igual al inicio');
    error.statusCode = 400;
    throw error;
  }

  const responsibleName = cleanString(
    data.responsibleName ||
    data.nombreResponsable ||
    currentUser.firstName ||
    currentUser.username
  );

  const responsibleDocumentType = cleanString(
    data.responsibleDocumentType ||
    data.tipoDocResponsable ||
    '36'
  );

  const responsibleDocumentNumber = cleanString(
    data.responsibleDocumentNumber ||
    data.numeroDocResponsable ||
    currentUser.company.nit
  );

  if (!responsibleName || !responsibleDocumentType || !responsibleDocumentNumber) {
    const error = new Error('Debe indicar nombre, tipo y número de documento del responsable de la contingencia');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    const sourceInvoices = await Invoice.findAll({
      where: {
        id: invoiceIds,
        companyId: currentUser.company.id
      },
      include: [
        {
          model: Company,
          as: 'company'
        },
        {
          model: PointOfSale,
          as: 'pointOfSale',
          include: [
            {
              model: Establishment,
              as: 'establishment'
            }
          ]
        }
      ],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (sourceInvoices.length !== invoiceIds.length) {
      const error = new Error('Uno o más DTE indicados no existen');
      error.statusCode = 404;
      throw error;
    }

    const invoiceById = new Map(
      sourceInvoices.map((invoice) => [Number(invoice.id), invoice])
    );

    const orderedInvoices = invoiceIds
      .map((id) => invoiceById.get(Number(id)))
      .filter(Boolean);

    for (const invoice of orderedInvoices) {
      validateInvoiceForContingencyEvent({
        invoice,
        user: currentUser
      });
    }

    const event = await DteEvent.create({
      companyId: currentUser.company.id,
      pointOfSaleId: currentUser.pointOfSale.id,
      userId: currentUser.id,
      sourceInvoiceId: null,
      eventTypeCode: EVENT_TYPE_CODES.CONTINGENCIA,
      eventTypeName: EVENT_TYPE_NAMES[EVENT_TYPE_CODES.CONTINGENCIA],
      generationCode: uuidv4().toUpperCase(),
      status: 'GENERADO',
      issuedAt: data.issuedAt ? new Date(data.issuedAt) : new Date(),
      contingencyStartedAt,
      contingencyEndedAt,
      responsibleName,
      responsibleDocumentType,
      responsibleDocumentNumber,
      tipoModelo: 2,
      tipoOperacion: 2,
      tipoContingencia,
      motivoContin,
      notes: data.notes || motivoContin
    }, { transaction });

    for (let index = 0; index < orderedInvoices.length; index += 1) {
      const invoice = orderedInvoices[index];

      await DteEventItem.create({
        eventId: event.id,
        numItem: index + 1,
        codigoGeneracion: invoice.generationCode,
        tipoDocumento: invoice.documentTypeCode,
        description: `DTE emitido en contingencia ${invoice.controlNumber}`,
        quantity: 1,
        unitPrice: 0,
        total: 0
      }, { transaction });

      await invoice.update({
        tipoModelo: 2,
        tipoOperacion: 2,
        tipoContingencia,
        motivoContin
      }, { transaction });
    }

    const context = await getEventContext({
      id: event.id,
      transaction
    });

    const officialEventJson = dteEventJsonService.buildOfficialEventJson(context);

    await event.update({
      officialEventJson
    }, { transaction });

    return getEventContext({
      id: event.id,
      transaction
    });
  });
};

const getEventJsonById = async ({ id, user, official = false }) => {
  const currentUser = await resolveUserContext(user);
  const context = await getEventContext({
    id,
    user: currentUser
  });

  return official
    ? dteEventJsonService.buildOfficialEventJson(context)
    : dteEventJsonService.buildEventJson(context);
};

const transmitEventToHacienda = async ({ id, user }) => {
  const currentUser = await resolveUserContext(user);
  let context = await getEventContext({
    id,
    user: currentUser
  });

let { event, company } = context;;

  if (!['GENERADO', 'FIRMADO', 'RECHAZADO'].includes(event.status)) {
    const error = new Error('Solo se pueden transmitir eventos en estado GENERADO, FIRMADO o RECHAZADO');
    error.statusCode = 400;
    throw error;
  }

  const transmittedAt = new Date();

/*
  Hacienda valida fTransmision y hTransmision con una ventana limitada.
  Cada intento de transmisión del Evento 19 debe firmar un JSON con la
  fecha y hora reales del momento de envío.
*/
if (event.eventTypeCode === EVENT_TYPE_CODES.CONTINGENCIA) {
  await event.update({
    issuedAt: transmittedAt,
    officialEventJson: null,
    signedJws: null,
    signedAt: null,
    transmittedAt: null,
    acceptedAt: null,
    rejectedAt: null,
    receptionSeal: null,
    rejectionReason: null,
    mhResponseJson: null,
    mhObservationsJson: null
  });

  context = await getEventContext({
    id: event.id,
    user: currentUser
  });

  event = context.event;
  company = context.company;
}

const officialEventJson =
  dteEventJsonService.buildOfficialEventJson(context);

if (event.eventTypeCode === EVENT_TYPE_CODES.CONTINGENCIA) {
  console.log('[EVENTO CONTINGENCIA - FECHA/HORA JSON]', {
    fTransmision:
      officialEventJson?.identificacion?.fTransmision,
    hTransmision:
      officialEventJson?.identificacion?.hTransmision,
    fInicio: officialEventJson?.motivo?.fInicio,
    hInicio: officialEventJson?.motivo?.hInicio,
    fFin: officialEventJson?.motivo?.fFin,
    hFin: officialEventJson?.motivo?.hFin
  });
}

try {
    const signed = await dteSignerService.signDteJson({
      company,
      nit: company.nit,
      dteJson: officialEventJson
    });

    await event.update({
      status: 'FIRMADO',
      officialEventJson,
      signedJws: signed.signedJws,
      signedAt: new Date(),
      mhResponseJson: {
        modo: 'FIRMA_REAL_EVENTO',
        descripcion: 'Evento firmado correctamente. Pendiente de respuesta de recepción de Hacienda.',
        signerResponse: signed.signerResponse
      },
      mhObservationsJson: null,
      rejectionReason: null
    });

    const transmission = event.eventTypeCode === EVENT_TYPE_CODES.CONTINGENCIA
      ? await dteTransmissionService.transmitSignedContingencyEvent({
          event,
          company,
          officialEventJson,
          signedJws: signed.signedJws
        })
      : await dteTransmissionService.transmitSignedEvent({
          event,
          company,
          officialEventJson,
          signedJws: signed.signedJws
        });

    if (transmission.accepted) {
      await event.update({
        status: 'ACEPTADO',
        signedJws: signed.signedJws,
        signedAt: event.signedAt || new Date(),
        transmittedAt,
        acceptedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
        receptionSeal: transmission.receptionSeal,
        mhResponseJson: {
          modo: 'TRANSMISION_REAL_EVENTO',
          estado: transmission.estado,
          httpStatus: transmission.httpStatus,
          statusText: transmission.statusText || null,
          payload: transmission.payload,
          response: transmission.response,
          signerResponse: signed.signerResponse
        },
        mhObservationsJson: transmission.observations || null
      });

      return getEventContext({
        id: event.id,
        user: currentUser
      });
    }

    const responseForStorage = transmission.response || {
      modo: 'RESPUESTA_HACIENDA_SIN_CUERPO',
      estado: transmission.estado || 'RECHAZADO',
      httpStatus: transmission.httpStatus || null,
      statusText: transmission.statusText || null,
      descripcionMsg: transmission.rejectionReason || transmission.defaultRejectedMessage || 'Hacienda rechazó el evento',
      observaciones: transmission.observations || null
    };

    await event.update({
      status: 'RECHAZADO',
      signedJws: signed.signedJws,
      signedAt: event.signedAt || new Date(),
      transmittedAt,
      acceptedAt: null,
      rejectedAt: new Date(),
      receptionSeal: null,
      rejectionReason: transmission.rejectionReason || 'Hacienda rechazó el evento',
      mhResponseJson: {
        modo: 'TRANSMISION_REAL_EVENTO_RECHAZADA',
        estado: transmission.estado,
        httpStatus: transmission.httpStatus,
        statusText: transmission.statusText || null,
        payload: transmission.payload,
        response: responseForStorage,
        signerResponse: signed.signerResponse
      },
      mhObservationsJson: transmission.observations || null
    });

    const error = new Error(transmission.rejectionReason || 'Hacienda rechazó el evento');
    error.statusCode = 400;
    error.mhResponse = responseForStorage;
    error.mhObservations = transmission.observations || null;
    error.haciendaTransmissionAlreadyPersisted = true;
    throw error;
  } catch (error) {
    if (error.haciendaTransmissionAlreadyPersisted) {
      throw error;
    }

    if (error.signerResponse) {
      await event.update({
        status: 'RECHAZADO',
        rejectedAt: new Date(),
        rejectionReason: error.message,
        mhResponseJson: {
          modo: 'ERROR_FIRMADOR_EVENTO',
          message: error.message,
          signerResponse: error.signerResponse || null
        }
      });

      throw error;
    }

    const responseForStorage =
      error.mhResponse ||
      error.haciendaResponse ||
      error.response?.data ||
      null;

    if (responseForStorage) {
      await event.update({
        status: 'RECHAZADO',
        rejectedAt: new Date(),
        acceptedAt: null,
        receptionSeal: null,
        rejectionReason: error.message || 'Hacienda rechazó el evento',
        mhResponseJson: {
          modo: 'ERROR_TRANSMISION_REAL_EVENTO_DETALLADO',
          message: error.message,
          payload: error.haciendaPayload || null,
          response: responseForStorage
        },
        mhObservationsJson: error.mhObservations || responseForStorage?.observaciones || null
      });

      throw error;
    }

    await event.update({
      rejectionReason: error.message,
      mhResponseJson: {
        modo: 'ERROR_TRANSMISION_REAL_EVENTO',
        message: error.message
      }
    });

    throw error;
  }
};

module.exports = {
  listEvents,
  getEventById,
  getEventJsonById,
  createReturnEvent,
  createSpecialOperationsEvent,
  createContingencyEvent,
  transmitEventToHacienda
};
