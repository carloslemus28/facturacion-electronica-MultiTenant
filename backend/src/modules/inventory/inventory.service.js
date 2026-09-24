const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const { sequelize } = require('../../config/database');

const InventoryMovement = require('./inventory-movement.model');
const Product = require('../products/product.model');
const User = require('../users/user.model');
const Establishment = require('../companies/establishment.model');
const Invoice = require('../invoices/invoice.model');

const MOVEMENT_SOURCE_DTE = 'DTE';
const MOVEMENT_SOURCE_MANUAL = 'MANUAL';
const MOVEMENT_SOURCE_INVALIDATION = 'ANULACION';
const MOVEMENT_SOURCE_INITIAL = 'SALDO_INICIAL';
const MOVEMENT_SOURCE_ADJUSTMENT = 'AJUSTE_STOCK';

const KARDEX_DTE_DOCUMENT_TYPES = new Set(['01', '03', '05']);
const KARDEX_DTE_VISIBLE_STATUSES = new Set(['ACEPTADO', 'ANULADO']);

// Se mantienen los mismos formatos visuales y numéricos usados por el Kardex de Maritza.
const MONEY_FORMAT = '$#,##0.0000;[Red]-$#,##0.0000';
const QUANTITY_FORMAT = '#,##0.0000;[Red]-#,##0.0000';
const TABLE_BORDER_COLOR = 'FF94A3B8';
const TABLE_HEADER_BORDER_COLOR = 'FFCBD5E1';
const TABLE_ROW_FILL = 'FFF8FAFC';
const TABLE_TOTAL_FILL = 'FFDBEAFE';
const TABLE_TOTAL_FONT = 'FF0F172A';

const round4 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const isAdminUser = (user) => Array.isArray(user?.roles) && user.roles.includes('ADMIN');

const assertCompany = (user) => {
  if (!user?.company?.id) {
    const error = new Error('El usuario no tiene empresa emisora activa');
    error.statusCode = 400;
    throw error;
  }
};

const resolveEstablishmentId = ({ user, requestedEstablishmentId = '' }) => {
  assertCompany(user);

  if (isAdminUser(user)) {
    return requestedEstablishmentId ? Number(requestedEstablishmentId) : null;
  }

  const establishmentId = Number(user?.pointOfSale?.establishmentId || 0);
  if (!establishmentId) {
    const error = new Error('El usuario no tiene establecimiento o sucursal asignada');
    error.statusCode = 403;
    throw error;
  }

  if (requestedEstablishmentId && Number(requestedEstablishmentId) !== establishmentId) {
    const error = new Error('No puede consultar inventario de otra sucursal');
    error.statusCode = 403;
    throw error;
  }

  return establishmentId;
};

const parseInventoryDate = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const error = new Error(`${label} debe tener formato AAAA-MM-DD`);
    error.statusCode = 400;
    throw error;
  }

  const date = new Date(`${normalized}T00:00:00-06:00`);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${label} no es una fecha válida`);
    error.statusCode = 400;
    throw error;
  }

  return { normalized, date };
};

const parseDateRange = ({ startDate, endDate }) => {
  const start = parseInventoryDate(startDate, 'La fecha inicial del Kardex');
  const end = parseInventoryDate(endDate, 'La fecha final del Kardex');

  if (start && end && start.normalized > end.normalized) {
    const error = new Error('La fecha inicial del Kardex no puede ser mayor que la fecha final');
    error.statusCode = 400;
    throw error;
  }

  const where = {};
  if (start) where[Op.gte] = start.date;
  if (end) where[Op.lt] = new Date(end.date.getTime() + 24 * 60 * 60 * 1000);
  return Object.keys(where).length ? where : null;
};

const normalizeQuantity = (value) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('La cantidad debe ser mayor que cero');
    error.statusCode = 400;
    throw error;
  }
  return round4(quantity);
};

const normalizeNonNegativeNumber = (value, label, { allowNull = false } = {}) => {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${label} debe ser mayor o igual a cero`);
    error.statusCode = 400;
    throw error;
  }
  return round4(number);
};

const computeWeightedAverageCost = ({ currentQuantity, currentAverageCost, entryQuantity, entryUnitCost }) => {
  const quantity = toNumber(currentQuantity);
  const averageCost = toNumber(currentAverageCost);
  const inputQuantity = toNumber(entryQuantity);
  const inputCost = toNumber(entryUnitCost);
  const nextQuantity = quantity + inputQuantity;

  if (nextQuantity <= 0) return round4(inputCost || averageCost);
  return round4(((quantity * averageCost) + (inputQuantity * inputCost)) / nextQuantity);
};

const createMovement = async ({ data, transaction }) => {
  const quantityIn = normalizeNonNegativeNumber(data.quantityIn || 0, 'La cantidad de entrada');
  const quantityOut = normalizeNonNegativeNumber(data.quantityOut || 0, 'La cantidad de salida');

  if (quantityIn > 0 && quantityOut > 0) {
    const error = new Error('Un movimiento no puede tener entrada y salida al mismo tiempo');
    error.statusCode = 400;
    throw error;
  }

  return InventoryMovement.create({
    companyId: data.companyId,
    establishmentId: data.establishmentId,
    productId: data.productId || null,
    invoiceId: data.invoiceId || null,
    userId: data.userId || null,
    inventoryType: 'PRODUCTO',
    movementType: data.movementType,
    source: data.source || MOVEMENT_SOURCE_MANUAL,
    reference: data.reference || null,
    supplierName: data.supplierName || null,
    supplierNationality: data.supplierNationality || null,
    description: data.description || null,
    quantityIn,
    quantityOut,
    unitCost: normalizeNonNegativeNumber(data.unitCost, 'El costo unitario', { allowNull: true }),
    unitSalePrice: normalizeNonNegativeNumber(data.unitSalePrice, 'El precio de venta', { allowNull: true }),
    balanceAfter: normalizeNonNegativeNumber(data.balanceAfter, 'El saldo de inventario', { allowNull: true }),
    movementDate: data.movementDate || new Date()
  }, { transaction });
};

const registerProductEntry = async ({ user, data }) => {
  assertCompany(user);

  const productId = Number(data.productId || 0);
  if (!productId) {
    const error = new Error('Seleccione el producto al que ingresará inventario');
    error.statusCode = 400;
    throw error;
  }

  const quantity = normalizeQuantity(data.quantity);
  const unitCost = normalizeNonNegativeNumber(data.unitCost, 'El costo unitario');
  const salePrice = data.salePrice === undefined || data.salePrice === null || data.salePrice === ''
    ? null
    : normalizeNonNegativeNumber(data.salePrice, 'El precio de venta');

  return sequelize.transaction(async (transaction) => {
    const product = await Product.findOne({
      where: { id: productId, companyId: user.company.id, itemType: 'PRODUCTO' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!product) {
      const error = new Error('Producto de inventario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const allowedEstablishmentId = resolveEstablishmentId({ user });
    if (allowedEstablishmentId && Number(product.establishmentId) !== allowedEstablishmentId) {
      const error = new Error('No puede registrar inventario para otra sucursal');
      error.statusCode = 403;
      throw error;
    }

    const currentStock = toNumber(product.stock);
    const currentAverage = toNumber(product.averagePurchaseCost || product.purchasePrice);
    const nextStock = round4(currentStock + quantity);
    const nextAverage = computeWeightedAverageCost({
      currentQuantity: currentStock,
      currentAverageCost: currentAverage,
      entryQuantity: quantity,
      entryUnitCost: unitCost
    });

    const update = {
      stock: nextStock,
      purchasePrice: unitCost,
      averagePurchaseCost: nextAverage
    };

    if (salePrice !== null) {
      update.salePrice = salePrice;
      update.unitPrice = salePrice;
    }

    await product.update(update, { transaction });

    const movement = await createMovement({
      transaction,
      data: {
        companyId: user.company.id,
        establishmentId: product.establishmentId,
        productId: product.id,
        userId: user.id,
        movementType: 'ENTRADA',
        source: MOVEMENT_SOURCE_MANUAL,
        reference: data.reference,
        supplierName: data.supplierName,
        supplierNationality: data.supplierNationality,
        description: data.description || `Entrada manual de ${product.name}`,
        quantityIn: quantity,
        unitCost,
        unitSalePrice: salePrice === null ? product.salePrice : salePrice,
        balanceAfter: nextStock
      }
    });

    return {
      productId: product.id,
      stock: nextStock,
      averagePurchaseCost: nextAverage,
      movementId: movement.id
    };
  });
};

/*
  Se usa cuando el stock se crea o edita desde el catálogo. De esta forma el
  Kardex no pierde movimientos aunque el usuario utilice el formulario que ya
  existía antes de incorporar el módulo de inventario.
*/
const recordProductStockAdjustment = async ({
  product,
  previousStock = 0,
  nextStock = 0,
  userId = null,
  unitCost = null,
  source = MOVEMENT_SOURCE_ADJUSTMENT,
  reference = null,
  description = null,
  transaction = null
}) => {
  if (!product || product.itemType !== 'PRODUCTO') return null;

  const before = round4(previousStock);
  const after = round4(nextStock);
  const difference = round4(after - before);
  if (difference === 0) return null;

  return createMovement({
    transaction,
    data: {
      companyId: product.companyId,
      establishmentId: product.establishmentId,
      productId: product.id,
      userId,
      movementType: 'AJUSTE',
      source,
      reference,
      description: description || `Ajuste de existencia de ${product.name}`,
      quantityIn: difference > 0 ? difference : 0,
      quantityOut: difference < 0 ? Math.abs(difference) : 0,
      unitCost: unitCost ?? product.averagePurchaseCost ?? product.purchasePrice ?? 0,
      unitSalePrice: product.salePrice || null,
      balanceAfter: after
    }
  });
};

const recordProductSaleMovement = async ({ product, invoice, invoiceItem, userId, transaction }) => {
  if (!product || product.itemType !== 'PRODUCTO') return null;
  if (!KARDEX_DTE_DOCUMENT_TYPES.has(String(invoice?.documentTypeCode || ''))) return null;

  return createMovement({
    transaction,
    data: {
      companyId: invoice.companyId,
      establishmentId: product.establishmentId,
      productId: product.id,
      invoiceId: invoice.id,
      userId,
      movementType: 'SALIDA',
      source: MOVEMENT_SOURCE_DTE,
      reference: invoice.controlNumber,
      description: invoiceItem.description || product.name,
      quantityOut: invoiceItem.quantity,
      unitCost: product.averagePurchaseCost || product.purchasePrice || 0,
      unitSalePrice: invoiceItem.unitPrice,
      balanceAfter: product.stock
    }
  });
};

const deleteInvoiceMovements = async ({ invoiceId, transaction }) => {
  return InventoryMovement.destroy({
    where: { invoiceId, source: MOVEMENT_SOURCE_DTE },
    transaction
  });
};

const reverseInvoiceMovementsForInvalidation = async ({ invoice, userId = null, transaction = null }) => {
  if (!invoice?.id) return { reversed: 0 };

  const run = async (activeTransaction) => {
    const existing = await InventoryMovement.findOne({
      where: { invoiceId: invoice.id, source: MOVEMENT_SOURCE_INVALIDATION },
      transaction: activeTransaction
    });
    if (existing) return { reversed: 0, alreadyReversed: true };

    const exits = await InventoryMovement.findAll({
      where: {
        invoiceId: invoice.id,
        source: MOVEMENT_SOURCE_DTE,
        movementType: 'SALIDA',
        quantityOut: { [Op.gt]: 0 }
      },
      transaction: activeTransaction,
      lock: activeTransaction.LOCK.UPDATE
    });

    let reversed = 0;
    for (const movement of exits) {
      if (!movement.productId) continue;

      const product = await Product.findByPk(movement.productId, {
        transaction: activeTransaction,
        lock: activeTransaction.LOCK.UPDATE
      });
      if (!product) continue;

      const quantity = round4(movement.quantityOut);
      const nextStock = round4(toNumber(product.stock) + quantity);
      await product.update({ stock: nextStock }, { transaction: activeTransaction });

      await createMovement({
        transaction: activeTransaction,
        data: {
          companyId: movement.companyId || invoice.companyId,
          establishmentId: movement.establishmentId || product.establishmentId,
          productId: product.id,
          invoiceId: invoice.id,
          userId,
          movementType: 'ENTRADA',
          source: MOVEMENT_SOURCE_INVALIDATION,
          reference: `${invoice.controlNumber || 'DTE'} ANULADA`,
          description: `Factura ${invoice.controlNumber || 'DTE'} anulada - reversión de salida${movement.description ? `: ${movement.description}` : ''}`,
          quantityIn: quantity,
          unitCost: movement.unitCost,
          unitSalePrice: movement.unitSalePrice,
          balanceAfter: nextStock,
          movementDate: invoice.invalidatedAt || new Date()
        }
      });
      reversed += 1;
    }

    return { reversed, alreadyReversed: false };
  };

  return transaction ? run(transaction) : sequelize.transaction(run);
};

const buildMovementWhere = ({ user, query = {} }) => {
  assertCompany(user);
  const where = { companyId: user.company.id };
  const establishmentId = resolveEstablishmentId({
    user,
    requestedEstablishmentId: query.establishmentId
  });

  if (establishmentId) where.establishmentId = establishmentId;
  if (query.productId) where.productId = Number(query.productId);

  const movementDate = parseDateRange(query);
  if (movementDate) where.movementDate = movementDate;

  return { where, establishmentId };
};

const listMovements = async ({ user, query = {} }) => {
  const { where } = buildMovementWhere({ user, query });
  const safeLimit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const safePage = Math.max(Number(query.page) || 1, 1);

  const { count, rows } = await InventoryMovement.findAndCountAll({
    where,
    include: [
      { model: Product, as: 'product', attributes: ['id', 'code', 'name'] },
      { model: Establishment, as: 'establishment', attributes: ['id', 'name'] },
      { model: Invoice, as: 'invoice', attributes: ['id', 'controlNumber', 'documentTypeCode', 'status'] },
      { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName'] }
    ],
    order: [['movementDate', 'DESC'], ['id', 'DESC']],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
    distinct: true
  });

  return {
    movements: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count,
      totalPages: Math.max(Math.ceil(count / safeLimit), 1)
    }
  };
};

const getInventorySummary = async ({ user, query = {} }) => {
  assertCompany(user);
  const establishmentId = resolveEstablishmentId({
    user,
    requestedEstablishmentId: query.establishmentId
  });

  const where = {
    companyId: user.company.id,
    itemType: 'PRODUCTO'
  };
  if (establishmentId) where.establishmentId = establishmentId;

  return Product.findAll({
    where,
    attributes: [
      'id', 'code', 'name', 'description', 'purchasePrice', 'averagePurchaseCost',
      'salePrice', 'stock', 'isActive', 'establishmentId'
    ],
    include: [{ model: Establishment, as: 'establishment', attributes: ['id', 'name'] }],
    order: [['name', 'ASC'], ['code', 'ASC'], ['id', 'ASC']]
  });
};

const createBorder = (style = 'thin', color = TABLE_BORDER_COLOR) => ({
  top: { style, color: { argb: color } },
  left: { style, color: { argb: color } },
  bottom: { style, color: { argb: color } },
  right: { style, color: { argb: color } }
});

const forEachTableCell = (row, startColumn, endColumn, callback) => {
  for (let columnNumber = startColumn; columnNumber <= endColumn; columnNumber += 1) {
    callback(row.getCell(columnNumber), columnNumber);
  }
};

const applyHeaderStyle = (row, startColumn, endColumn) => {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  forEachTableCell(row, startColumn, endColumn, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.border = createBorder('thin', TABLE_HEADER_BORDER_COLOR);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
};

const applyBodyStyle = (row, startColumn, endColumn) => {
  const useStripe = row.number % 2 === 0;
  forEachTableCell(row, startColumn, endColumn, (cell) => {
    cell.border = createBorder('thin', TABLE_BORDER_COLOR);
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (useStripe) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TABLE_ROW_FILL } };
    }
  });
};

const applyTotalRowStyle = (row, startColumn, endColumn) => {
  row.font = { bold: true, color: { argb: TABLE_TOTAL_FONT } };
  forEachTableCell(row, startColumn, endColumn, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TABLE_TOTAL_FILL } };
    cell.border = createBorder('medium', TABLE_BORDER_COLOR);
  });
};

const setTitle = (sheet, rowNumber, text, lastColumn) => {
  sheet.mergeCells(rowNumber, 1, rowNumber, lastColumn);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14, color: { argb: TABLE_TOTAL_FONT } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
};

const addMergedHeader = (sheet, label, startColumn, endColumn, rowNumber, fill) => {
  sheet.mergeCells(rowNumber, startColumn, rowNumber, endColumn);
  const cell = sheet.getCell(rowNumber, startColumn);
  cell.value = label;
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = createBorder('thin', TABLE_HEADER_BORDER_COLOR);
};

const normalizeSheetName = (value, fallback = 'Producto') => String(value || fallback)
  .replace(/[\\/*?:\[\]]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 28) || fallback;

const ensureUniqueSheetNameFromSet = (usedNames, requestedName) => {
  const baseName = normalizeSheetName(requestedName);
  let name = baseName;
  let counter = 1;
  while (usedNames.has(name)) {
    const suffix = ` ${counter}`;
    name = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  usedNames.add(name);
  return name;
};

const getUserName = (movement) => [movement.user?.firstName, movement.user?.lastName]
  .filter(Boolean).join(' ') || movement.user?.username || '';

const isKardexMovementVisible = (movement) => {
  if (!movement.invoiceId) return true;
  const source = String(movement.source || '').toUpperCase();
  if (![MOVEMENT_SOURCE_DTE, MOVEMENT_SOURCE_INVALIDATION].includes(source)) return true;
  if (!movement.invoice) return false;
  if (!KARDEX_DTE_DOCUMENT_TYPES.has(String(movement.invoice.documentTypeCode || ''))) return false;
  return KARDEX_DTE_VISIBLE_STATUSES.has(String(movement.invoice.status || '').toUpperCase());
};

const createStreamingKardexSheet = ({ workbook, usedNames, product, company, query }) => {
  const sheet = workbook.addWorksheet(
    ensureUniqueSheetNameFromSet(usedNames, `${product.code || 'Producto'} ${product.name || ''}`)
  );
  sheet.columns = [
    { key: 'fecha', width: 18 }, { key: 'sucursal', width: 22 }, { key: 'documento', width: 24 },
    { key: 'proveedor', width: 28 }, { key: 'nacionalidad', width: 18 }, { key: 'descripcion', width: 36 },
    { key: 'entradaUnidades', width: 14 }, { key: 'entradaPrecio', width: 16 }, { key: 'entradaTotal', width: 16 },
    { key: 'salidaUnidades', width: 14 }, { key: 'salidaPrecio', width: 16 }, { key: 'salidaTotal', width: 16 },
    { key: 'saldoUnidades', width: 14 }, { key: 'saldoPromedio', width: 18 }, { key: 'saldoTotal', width: 18 },
    { key: 'usuario', width: 22 }
  ];

  setTitle(sheet, 1, 'KARDEX - TIENDA', 16);
  sheet.getCell('A2').value = `Empresa: ${company.legalName || company.name || ''}`;
  sheet.getCell('A3').value = `NIT: ${company.nit || ''}   NRC: ${company.nrc || ''}`;
  sheet.getCell('A4').value = `Artículo: ${product.name || ''}`;
  sheet.getCell('A5').value = `Código / Tipo: ${product.code || ''}`;
  sheet.getCell('A6').value = `Sucursal: ${product.establishment?.name || 'Todas'}`;
  sheet.getCell('A7').value = `Período: ${query.startDate || 'Inicio'} al ${query.endDate || 'Actual'}`;
  sheet.getCell('A8').value = `Generado: ${new Date().toLocaleString('es-SV')}`;

  addMergedHeader(sheet, 'DATOS DEL MOVIMIENTO', 1, 6, 10, 'FF1E3A8A');
  addMergedHeader(sheet, 'ENTRADAS', 7, 9, 10, 'FF166534');
  addMergedHeader(sheet, 'SALIDAS', 10, 12, 10, 'FF991B1B');
  addMergedHeader(sheet, 'SALDO', 13, 15, 10, 'FF334155');
  const userHeader = sheet.getCell(10, 16);
  userHeader.value = 'USUARIO';
  userHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  userHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  userHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  userHeader.border = createBorder('thin', TABLE_HEADER_BORDER_COLOR);

  sheet.getRow(11).values = [
    'Fecha', 'Sucursal', 'Documento / Referencia', 'Proveedor', 'Nacionalidad', 'Descripción',
    'Unidades', 'Precio unitario', 'Total', 'Unidades', 'Precio unitario', 'Total',
    'Unidades', 'Precio promedio', 'Total', 'Usuario'
  ];
  applyHeaderStyle(sheet.getRow(11), 1, 16);
  sheet.getColumn(1).numFmt = 'dd/mm/yyyy hh:mm';
  [7, 10, 13].forEach((column) => { sheet.getColumn(column).numFmt = QUANTITY_FORMAT; });
  [8, 9, 11, 12, 14, 15].forEach((column) => { sheet.getColumn(column).numFmt = MONEY_FORMAT; });
  sheet.views = [{ state: 'frozen', ySplit: 11 }];

  for (let rowNumber = 1; rowNumber <= 11; rowNumber += 1) sheet.getRow(rowNumber).commit();

  return {
    sheet,
    product,
    balance: 0,
    averageCost: 0,
    entries: 0,
    exits: 0,
    costOfSales: 0,
    rowNumber: 11
  };
};

const addStreamingKardexMovementRow = (state, movement) => {
  const quantityIn = toNumber(movement.quantityIn);
  const quantityOut = toNumber(movement.quantityOut);
  const movementCost = toNumber(movement.unitCost, state.averageCost);
  const entryCost = quantityIn > 0 ? movementCost : 0;
  const entryTotal = quantityIn > 0 ? round4(quantityIn * entryCost) : null;

  if (quantityIn > 0) {
    state.averageCost = computeWeightedAverageCost({
      currentQuantity: state.balance,
      currentAverageCost: state.averageCost,
      entryQuantity: quantityIn,
      entryUnitCost: entryCost
    });
    state.balance = round4(state.balance + quantityIn);
    state.entries = round4(state.entries + quantityIn);
  }

  const exitCost = quantityOut > 0 ? (movementCost || state.averageCost) : 0;
  const exitTotal = quantityOut > 0 ? round4(quantityOut * exitCost) : null;
  if (quantityOut > 0) {
    state.balance = round4(state.balance - quantityOut);
    state.exits = round4(state.exits + quantityOut);
    state.costOfSales = round4(state.costOfSales + (exitTotal || 0));
  }

  if (String(movement.source || '').toUpperCase() === MOVEMENT_SOURCE_INVALIDATION && quantityIn > 0) {
    state.exits = round4(Math.max(0, state.exits - quantityIn));
    state.costOfSales = round4(Math.max(0, state.costOfSales - (entryTotal || 0)));
  }

  const row = state.sheet.addRow({
    fecha: movement.movementDate,
    sucursal: movement.establishment?.name || movement.product?.establishment?.name || '',
    documento: movement.reference || movement.invoice?.controlNumber || '',
    proveedor: movement.supplierName || '',
    nacionalidad: movement.supplierNationality || '',
    descripcion: movement.description || movement.product?.description || movement.product?.name || '',
    entradaUnidades: quantityIn || null,
    entradaPrecio: quantityIn > 0 ? entryCost : null,
    entradaTotal: entryTotal,
    salidaUnidades: quantityOut || null,
    salidaPrecio: quantityOut > 0 ? exitCost : null,
    salidaTotal: exitTotal,
    saldoUnidades: state.balance,
    saldoPromedio: state.averageCost,
    saldoTotal: round4(state.balance * state.averageCost),
    usuario: getUserName(movement)
  });

  applyBodyStyle(row, 1, 16);
  row.commit();
  state.rowNumber += 1;
};

const finishStreamingKardexSheet = (state) => {
  state.sheet.autoFilter = {
    from: { row: 11, column: 1 },
    to: { row: Math.max(state.rowNumber, 12), column: 16 }
  };
  state.sheet.commit();

  return {
    type: 'PRODUCTO',
    code: state.product.code,
    name: state.product.name,
    establishment: state.product.establishment?.name || '',
    entries: state.entries,
    exits: state.exits,
    balance: state.balance,
    averageCost: state.averageCost,
    value: round4(state.balance * state.averageCost),
    costOfSales: state.costOfSales,
    productId: state.product.id
  };
};

const addConsolidatedSheet = ({ sheet, rows, company, query, summary }) => {
  sheet.columns = [
    { key: 'type', width: 16 }, { key: 'code', width: 20 }, { key: 'name', width: 36 },
    { key: 'establishment', width: 26 }, { key: 'entries', width: 14 }, { key: 'exits', width: 14 },
    { key: 'balance', width: 18 }, { key: 'averageCost', width: 18 }, { key: 'value', width: 20 },
    { key: 'costOfSales', width: 18 }, { key: 'purchasePrice', width: 18 }, { key: 'salePrice', width: 18 },
    { key: 'isActive', width: 12 }
  ];
  [5, 6, 7].forEach((column) => { sheet.getColumn(column).numFmt = QUANTITY_FORMAT; });
  [8, 9, 10, 11, 12].forEach((column) => { sheet.getColumn(column).numFmt = MONEY_FORMAT; });

  sheet.getRow(1).values = ['KARDEX TIENDA - CONSOLIDADO FINAL'];
  sheet.getRow(2).values = [`Empresa: ${company.legalName || company.name || ''}`];
  sheet.getRow(3).values = [`NIT: ${company.nit || ''}   NRC: ${company.nrc || ''}`];
  sheet.getRow(4).values = [`Período: ${query.startDate || 'Inicio'} al ${query.endDate || 'Actual'}`];
  sheet.getRow(5).values = [`Generado: ${new Date().toLocaleString('es-SV')}`];
  sheet.getRow(6).values = [];
  sheet.getRow(7).values = [
    'Tipo', 'Código / Tipo', 'Producto / Combustible', 'Sucursal', 'Entradas', 'Salidas',
    'Existencia / Saldo', 'Precio promedio', 'Costo por existencia', 'Costo de Venta',
    'Precio compra actual', 'Precio venta actual', 'Activo'
  ];
  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: TABLE_TOTAL_FONT } };
  applyHeaderStyle(sheet.getRow(7), 1, 13);
  for (let rowNumber = 1; rowNumber <= 7; rowNumber += 1) sheet.getRow(rowNumber).commit();

  const productMap = new Map(summary.map((product) => [Number(product.id), product]));
  const totals = { entries: 0, exits: 0, balance: 0, value: 0, costOfSales: 0 };

  rows.forEach((row) => {
    const product = productMap.get(Number(row.productId));
    const currentBalance = product ? toNumber(product.stock) : row.balance;
    const averageCost = product
      ? toNumber(product.averagePurchaseCost || product.purchasePrice || row.averageCost)
      : row.averageCost;
    const normalized = {
      ...row,
      balance: currentBalance,
      averageCost,
      value: round4(currentBalance * averageCost),
      purchasePrice: product ? toNumber(product.purchasePrice) : null,
      salePrice: product ? toNumber(product.salePrice) : null,
      isActive: product ? (product.isActive ? 'Sí' : 'No') : ''
    };
    const added = sheet.addRow(normalized);
    applyBodyStyle(added, 1, 13);
    added.commit();

    totals.entries += toNumber(normalized.entries);
    totals.exits += toNumber(normalized.exits);
    totals.balance += toNumber(normalized.balance);
    totals.value += toNumber(normalized.value);
    totals.costOfSales += toNumber(normalized.costOfSales);
  });

  const startRow = 8;
  const lastDataRow = 7 + rows.length;
  const formulaOrValue = (column, value) => lastDataRow >= startRow
    ? { formula: `SUM(${column}${startRow}:${column}${lastDataRow})`, result: round4(value) }
    : round4(value);

  const totalRow = sheet.addRow({
    type: '', code: '', name: 'TOTAL GENERAL', establishment: '',
    entries: formulaOrValue('E', totals.entries), exits: formulaOrValue('F', totals.exits),
    balance: formulaOrValue('G', totals.balance), averageCost: '',
    value: formulaOrValue('I', totals.value), costOfSales: formulaOrValue('J', totals.costOfSales),
    purchasePrice: '', salePrice: '', isActive: ''
  });
  applyTotalRowStyle(totalRow, 1, 13);
  totalRow.commit();
  sheet.views = [{ state: 'frozen', ySplit: 7 }];
  sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: Math.max(lastDataRow, 7), column: 13 } };
  sheet.commit();
};

const getWorkbookExportBatchSize = () => {
  const configured = Number(process.env.KARDEX_EXPORT_BATCH_SIZE || 500);
  if (!Number.isFinite(configured)) return 500;
  return Math.min(Math.max(Math.floor(configured), 100), 2000);
};

const fetchKardexMovementBatch = async ({ where, limit, offset }) => InventoryMovement.findAll({
  where,
  attributes: [
    'id', 'establishmentId', 'productId', 'invoiceId', 'userId', 'source', 'reference',
    'supplierName', 'supplierNationality', 'description', 'quantityIn', 'quantityOut',
    'unitCost', 'unitSalePrice', 'balanceAfter', 'movementDate'
  ],
  include: [
    {
      model: Product,
      as: 'product',
      attributes: ['id', 'code', 'name', 'description', 'purchasePrice', 'averagePurchaseCost', 'salePrice', 'stock', 'itemType'],
      include: [{ model: Establishment, as: 'establishment', attributes: ['id', 'name'] }]
    },
    { model: Establishment, as: 'establishment', attributes: ['id', 'name'] },
    { model: Invoice, as: 'invoice', attributes: ['id', 'controlNumber', 'documentTypeCode', 'status'] },
    { model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName'] }
  ],
  order: [['productId', 'ASC'], ['movementDate', 'ASC'], ['id', 'ASC']],
  limit,
  offset,
  raw: true,
  nest: true,
  subQuery: false
});

const streamKardexWorkbook = async ({ user, query = {}, stream, filePath }) => {
  // La ruta aplica requireAdmin; se valida nuevamente aquí para impedir usos internos accidentales.
  if (!isAdminUser(user)) {
    const error = new Error('Solo el Administrador puede descargar el Kardex');
    error.statusCode = 403;
    throw error;
  }

  const { where } = buildMovementWhere({ user, query });
  const summary = await getInventorySummary({ user, query });
  const workbookOptions = { useStyles: true, useSharedStrings: false };
  if (filePath) workbookOptions.filename = filePath;
  else workbookOptions.stream = stream;

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(workbookOptions);
  workbook.creator = 'Facturación C&M';
  workbook.created = new Date();

  const usedNames = new Set();
  const consolidatedSheet = workbook.addWorksheet(ensureUniqueSheetNameFromSet(usedNames, 'Consolidado Final'));
  const consolidatedRows = [];
  const batchSize = getWorkbookExportBatchSize();

  let offset = 0;
  let currentProductId = null;
  let currentState = null;
  let visibleMovementCount = 0;

  while (true) {
    const movements = await fetchKardexMovementBatch({ where, limit: batchSize, offset });
    if (!movements.length) break;

    for (const movement of movements) {
      if (!isKardexMovementVisible(movement) || !movement.product?.id) continue;

      if (Number(movement.product.id) !== Number(currentProductId)) {
        if (currentState) consolidatedRows.push(finishStreamingKardexSheet(currentState));
        currentState = createStreamingKardexSheet({
          workbook,
          usedNames,
          product: movement.product,
          company: user.company,
          query
        });
        currentProductId = Number(movement.product.id);
      }

      addStreamingKardexMovementRow(currentState, movement);
      visibleMovementCount += 1;
    }

    offset += movements.length;
    if (movements.length < batchSize) break;
  }

  if (currentState) consolidatedRows.push(finishStreamingKardexSheet(currentState));

  if (!visibleMovementCount) {
    const empty = workbook.addWorksheet(ensureUniqueSheetNameFromSet(usedNames, 'Kardex'));
    setTitle(empty, 1, 'KARDEX - TIENDA', 6);
    empty.getCell('A3').value = `Empresa: ${user.company.legalName || user.company.name || ''}`;
    empty.getCell('A4').value = `Período: ${query.startDate || 'Inicio'} al ${query.endDate || 'Actual'}`;
    empty.getCell('A6').value = 'No hay movimientos de inventario para el período seleccionado.';
    empty.getColumn(1).width = 60;
    for (let rowNumber = 1; rowNumber <= 6; rowNumber += 1) empty.getRow(rowNumber).commit();
    empty.commit();
  }

  addConsolidatedSheet({
    sheet: consolidatedSheet,
    rows: consolidatedRows.sort((a, b) => `${a.name}-${a.code}`.localeCompare(`${b.name}-${b.code}`, 'es')),
    company: user.company,
    query,
    summary
  });

  await workbook.commit();
};

module.exports = {
  MOVEMENT_SOURCE_DTE,
  MOVEMENT_SOURCE_MANUAL,
  MOVEMENT_SOURCE_INVALIDATION,
  MOVEMENT_SOURCE_INITIAL,
  MOVEMENT_SOURCE_ADJUSTMENT,
  registerProductEntry,
  recordProductStockAdjustment,
  recordProductSaleMovement,
  deleteInvoiceMovements,
  reverseInvoiceMovementsForInvalidation,
  listMovements,
  getInventorySummary,
  streamKardexWorkbook
};
