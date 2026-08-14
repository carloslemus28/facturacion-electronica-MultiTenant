const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Op } = require('sequelize');

const { sequelize } = require('../../config/database');
const Company = require('../companies/company.model');
const Establishment = require('../companies/establishment.model');
const PointOfSale = require('../companies/point-of-sale.model');
const Customer = require('../customers/customer.model');
const Product = require('../products/product.model');
const {
  normalizeDepartmentCatalogCode,
  normalizeMunicipalityCatalogCode
} = require('../../utils/el-salvador-catalogs');
const User = require('../users/user.model');
const Invoice = require('../invoices/invoice.model');
const InvoiceItem = require('../invoices/invoice-item.model');
const ControlNumber = require('../dte/control-number.model');
const InvoiceImportArtifact = require('./invoice-import-artifact.model');
const { ensureImportStorageDir } = require('./import-storage');

const execFileAsync = promisify(execFile);

const DOCUMENT_TYPE_NAMES = {
  '01': 'Factura de Consumidor Final',
  '03': 'Comprobante de Crédito Fiscal Electrónico',
  '05': 'Nota de Crédito Electrónica',
  '11': 'Factura de Exportación Electrónica',
  '14': 'Factura de Sujeto Excluido Electrónica'
};

const SUPPORTED_DTE_TYPES = new Set(Object.keys(DOCUMENT_TYPE_NAMES));
const CUSTOMER_TYPES = new Set(['CONSUMIDOR_FINAL', 'CONTRIBUYENTE', 'SUJETO_EXCLUIDO', 'EXTRANJERO']);
const CUSTOMER_DOCUMENT_TYPES = new Set(['NIT', 'DUI', 'PASAPORTE', 'CARNET_RESIDENTE', 'OTRO', 'SIN_DOCUMENTO']);
const DTE_DOCUMENT_TYPE_MAP = {
  '36': 'NIT',
  '13': 'DUI',
  '03': 'PASAPORTE',
  '02': 'CARNET_RESIDENTE'
};
const PAYMENT_METHOD_MAP = {
  '01': 'EFECTIVO',
  '02': 'TARJETA',
  '05': 'TRANSFERENCIA'
};
const STATUS_VALUES = new Set(['BORRADOR', 'GENERADO', 'FIRMADO', 'TRANSMITIDO', 'ACEPTADO', 'RECHAZADO', 'ANULADO']);

const clean = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const normalizeNit = (value) => String(value || '').replace(/\D/g, '');

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toBoolean = (value, fallback = false) => {
  if (value === true || value === false) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return fallback;
};

const validDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildIssuedAt = (identification = {}) => {
  const date = clean(identification.fecEmi);
  const time = clean(identification.horEmi) || '00:00:00';
  if (!date) return new Date();

  const parsed = new Date(`${date}T${time}-06:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(`${date}T00:00:00-06:00`) : parsed;
};

const parseCsv = (input) => {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => String(value).trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => String(value).trim() !== '')) rows.push(row);

  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => String(header).trim());
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ''])
  ));
};

const validateActiveCompany = async (companyId, transaction = null) => {
  const company = await Company.findByPk(companyId, { transaction });
  if (!company) {
    const error = new Error('El contribuyente activo no existe');
    error.statusCode = 404;
    throw error;
  }
  return company;
};

const validateTargetEstablishment = async ({ companyId, establishmentId, transaction = null }) => {
  const establishment = await Establishment.findOne({
    where: { id: establishmentId, companyId },
    transaction
  });

  if (!establishment) {
    const error = new Error('Seleccione un establecimiento válido del contribuyente activo');
    error.statusCode = 400;
    throw error;
  }

  return establishment;
};

const normalizeEmail = (value) => {
  const email = clean(value);
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const findExistingCustomer = async ({ companyId, establishmentId, row, transaction }) => {
  const documentType = CUSTOMER_DOCUMENT_TYPES.has(clean(row.documentType))
    ? clean(row.documentType)
    : 'SIN_DOCUMENTO';
  const documentNumber = clean(row.documentNumber);
  const name = clean(row.name);
  const phone = clean(row.phone);
  const email = normalizeEmail(row.email);

  if (documentNumber && documentType !== 'SIN_DOCUMENTO') {
    const byDocument = await Customer.findOne({
      where: { companyId, documentType, documentNumber },
      transaction
    });
    if (byDocument) return byDocument;
  }

  if (name && phone) {
    const byPhone = await Customer.findOne({
      where: { companyId, name, phone },
      transaction
    });
    if (byPhone) return byPhone;
  }

  if (name && email) {
    const byEmail = await Customer.findOne({
      where: { companyId, name, email },
      transaction
    });
    if (byEmail) return byEmail;
  }

  if (name) {
    return Customer.findOne({
      where: { companyId, establishmentId, name },
      transaction
    });
  }

  return null;
};

const buildCustomerPayloadFromCsv = ({ companyId, establishmentId, row }) => ({
  companyId,
  establishmentId,
  customerType: CUSTOMER_TYPES.has(clean(row.customerType)) ? clean(row.customerType) : 'CONSUMIDOR_FINAL',
  documentType: CUSTOMER_DOCUMENT_TYPES.has(clean(row.documentType)) ? clean(row.documentType) : 'SIN_DOCUMENTO',
  documentNumber: clean(row.documentNumber),
  nrc: clean(row.nrc),
  name: clean(row.name),
  commercialName: clean(row.commercialName),
  economicActivityCode: clean(row.economicActivityCode),
  economicActivityName: clean(row.economicActivityName),
  secondaryEconomicActivityCode: clean(row.secondaryEconomicActivityCode),
  secondaryEconomicActivityName: clean(row.secondaryEconomicActivityName),
  tertiaryEconomicActivityCode: clean(row.tertiaryEconomicActivityCode),
  tertiaryEconomicActivityName: clean(row.tertiaryEconomicActivityName),
  email: normalizeEmail(row.email),
  secondaryEmail: normalizeEmail(row.secondaryEmail),
  phone: clean(row.phone),
  phoneCountryCode: clean(row.phoneCountryCode),
  phoneDialCode: clean(row.phoneDialCode),
  phoneNationalNumber: clean(row.phoneNationalNumber),
  departmentCode: normalizeDepartmentCatalogCode(row.departmentCode),
  departmentName: clean(row.departmentName),
  districtName: clean(row.districtName),
  municipalityCode: normalizeMunicipalityCatalogCode({
    municipalityCode: row.municipalityCode,
    municipalityName: row.municipalityName
  }),
  municipalityName: clean(row.municipalityName),
  addressComplement: clean(row.addressComplement),
  countryCode: clean(row.countryCode),
  isActive: toBoolean(row.isActive, true),
  ...(validDate(row.createdAt) ? { createdAt: validDate(row.createdAt) } : {}),
  ...(validDate(row.updatedAt) ? { updatedAt: validDate(row.updatedAt) } : {})
});

const importCustomersCsv = async ({ companyId, establishmentId, csvText }) => {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    const error = new Error('El archivo CSV de clientes no contiene registros');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    await validateActiveCompany(companyId, transaction);
    await validateTargetEstablishment({ companyId, establishmentId, transaction });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const payload = buildCustomerPayloadFromCsv({ companyId, establishmentId, row });

      if (!payload.name) {
        skipped += 1;
        errors.push(`Fila ${index + 2}: cliente sin nombre`);
        continue;
      }

      try {
        const existing = await findExistingCustomer({ companyId, establishmentId, row, transaction });
        if (existing) {
          await existing.update(payload, { transaction });
          updated += 1;
        } else {
          await Customer.create(payload, { transaction });
          created += 1;
        }
      } catch (error) {
        skipped += 1;
        errors.push(`Fila ${index + 2}: ${error.message}`);
      }
    }

    return { total: rows.length, created, updated, skipped, errors: errors.slice(0, 25) };
  });
};

const buildProductPayloadFromCsv = ({ companyId, establishmentId, row }) => ({
  companyId,
  establishmentId,
  code: clean(row.code)?.toUpperCase(),
  itemType: clean(row.itemType) === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO',
  name: clean(row.name),
  description: clean(row.description),
  unitOfMeasure: clean(row.unitOfMeasure) || (clean(row.itemType) === 'SERVICIO' ? '99' : '59'),
  unitOfMeasureName: clean(row.unitOfMeasureName) || (clean(row.itemType) === 'SERVICIO' ? 'Servicio' : 'Unidad'),
  purchasePrice: toNullableNumber(row.purchasePrice),
  salePrice: toNullableNumber(row.salePrice),
  unitPrice: toNullableNumber(row.unitPrice),
  appliesIva: toBoolean(row.appliesIva, true),
  stock: toNullableNumber(row.stock),
  isActive: toBoolean(row.isActive, true),
  ...(validDate(row.createdAt) ? { createdAt: validDate(row.createdAt) } : {}),
  ...(validDate(row.updatedAt) ? { updatedAt: validDate(row.updatedAt) } : {})
});

const importProductsCsv = async ({ companyId, establishmentId, csvText }) => {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    const error = new Error('El archivo CSV de productos/servicios no contiene registros');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (transaction) => {
    await validateActiveCompany(companyId, transaction);
    await validateTargetEstablishment({ companyId, establishmentId, transaction });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const payload = buildProductPayloadFromCsv({ companyId, establishmentId, row });

      if (!payload.code || !payload.name) {
        skipped += 1;
        errors.push(`Fila ${index + 2}: código y nombre son obligatorios`);
        continue;
      }

      try {
        const existing = await Product.findOne({
          where: { companyId, establishmentId, code: payload.code },
          transaction
        });

        if (existing) {
          await existing.update(payload, { transaction });
          updated += 1;
        } else {
          await Product.create(payload, { transaction });
          created += 1;
        }
      } catch (error) {
        skipped += 1;
        errors.push(`Fila ${index + 2}: ${error.message}`);
      }
    }

    return { total: rows.length, created, updated, skipped, errors: errors.slice(0, 25) };
  });
};

const getAppendixValue = (json, field) => {
  const appendix = Array.isArray(json?.apendice) ? json.apendice : [];
  return clean(appendix.find((item) => clean(item?.campo) === field)?.valor);
};

const getImportedMetadataValue = (json, keys) => {
  const acceptedKeys = new Set(keys);
  const queue = [
    json,
    json?.respuestaHacienda,
    json?.mhResponse,
    json?.response,
    json?.resultado,
    json?.metadataSistema,
    json?.metadata
  ].filter((value) => value && typeof value === 'object');
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    for (const key of acceptedKeys) {
      const value = clean(current[key]);
      if (value) return value;
    }

    for (const nestedKey of ['body', 'response', 'data', 'resultado']) {
      const nested = current[nestedKey];
      if (nested && typeof nested === 'object' && !visited.has(nested)) {
        queue.push(nested);
      }
    }
  }

  return null;
};

const getImportedReceptionSeal = (json) => {
  return getAppendixValue(json, 'selloRecepcion') ||
    getAppendixValue(json, 'selloRecibido') ||
    getImportedMetadataValue(json, [
      'selloRecibido',
      'selloRecepcion',
      'numeroValidacion',
      'numValidacion'
    ]);
};

const getImportedStatus = (json) => {
  const appendixStatus = String(getAppendixValue(json, 'estadoSistema') || '').toUpperCase();
  if (STATUS_VALUES.has(appendixStatus)) return appendixStatus;

  const metadataStatus = String(
    getImportedMetadataValue(json, ['estado', 'status']) || ''
  ).toUpperCase();

  if (metadataStatus === 'ANULADO') return 'ANULADO';
  if (getImportedReceptionSeal(json)) return 'ACEPTADO';
  if (STATUS_VALUES.has(metadataStatus)) return metadataStatus;

  return 'GENERADO';
};

const normalizeReceiver = (json) => json?.receptor || json?.sujetoExcluido || null;

const mapDteCustomerType = ({ documentTypeCode, receiver }) => {
  if (String(documentTypeCode) === '14') return 'SUJETO_EXCLUIDO';
  if (receiver?.nrc) return 'CONTRIBUYENTE';
  if (String(documentTypeCode) === '11') return 'EXTRANJERO';
  return 'CONSUMIDOR_FINAL';
};

const findOrCreateReceiverCustomer = async ({ companyId, establishmentId, documentTypeCode, receiver, transaction }) => {
  if (!receiver?.nombre) return null;

  const documentNumber = clean(receiver.numDocumento || receiver.documento);
  const mappedDocumentType = DTE_DOCUMENT_TYPE_MAP[String(receiver.tipoDocumento || '')]
    || (documentNumber ? 'OTRO' : 'SIN_DOCUMENTO');

  let customer = null;

  if (documentNumber) {
    customer = await Customer.findOne({
      where: { companyId, documentType: mappedDocumentType, documentNumber },
      transaction
    });
  }

  if (!customer && clean(receiver.telefono)) {
    customer = await Customer.findOne({
      where: { companyId, name: clean(receiver.nombre), phone: clean(receiver.telefono) },
      transaction
    });
  }

  if (!customer && normalizeEmail(receiver.correo)) {
    customer = await Customer.findOne({
      where: { companyId, name: clean(receiver.nombre), email: normalizeEmail(receiver.correo) },
      transaction
    });
  }

  if (!customer) {
    customer = await Customer.findOne({
      where: { companyId, establishmentId, name: clean(receiver.nombre) },
      transaction
    });
  }

  if (customer) return customer;

  const departmentCode = normalizeDepartmentCatalogCode(receiver?.direccion?.departamento);
  const municipalityCode = normalizeMunicipalityCatalogCode({
    municipalityCode: receiver?.direccion?.municipio
  });

  return Customer.create({
    companyId,
    establishmentId,
    customerType: mapDteCustomerType({ documentTypeCode, receiver }),
    documentType: mappedDocumentType,
    documentNumber,
    nrc: clean(receiver.nrc),
    name: clean(receiver.nombre),
    economicActivityCode: clean(receiver.codActividad),
    economicActivityName: clean(receiver.descActividad),
    email: normalizeEmail(receiver.correo),
    phone: clean(receiver.telefono),
    departmentCode,
    municipalityCode,
    addressComplement: clean(receiver?.direccion?.complemento),
    countryCode: clean(receiver.codPais) || '503',
    isActive: true
  }, { transaction });
};

const mapOperationCondition = (value) => {
  if (Number(value) === 2) return 'CREDITO';
  if (Number(value) === 1) return 'CONTADO';
  return 'OTRO';
};

const getTotalIva = (json) => {
  const summary = json?.resumen || {};
  if (summary.totalIva !== undefined && summary.totalIva !== null) return toNumber(summary.totalIva);
  const tributes = Array.isArray(summary.tributos) ? summary.tributos : [];
  const tributeTotal = tributes.reduce((sum, tribute) => sum + toNumber(tribute?.valor), 0);
  if (tributeTotal > 0) return tributeTotal;
  return (json?.cuerpoDocumento || []).reduce((sum, item) => sum + toNumber(item?.ivaItem), 0);
};

const getDteTotals = (json) => {
  const summary = json?.resumen || {};
  return {
    noSuj: toNumber(summary.totalNoSuj),
    exenta: toNumber(summary.totalExenta),
    gravada: toNumber(summary.totalGravada ?? summary.totalCompra),
    subtotal: toNumber(summary.subTotal ?? summary.subTotalVentas ?? summary.totalCompra),
    iva: getTotalIva(json),
    retention1: toNumber(summary.ivaRete1),
    fovial: toNumber(summary.fovial),
    cotrans: toNumber(summary.cotrans),
    total: toNumber(summary.totalPagar ?? summary.montoTotalOperacion ?? summary.totalCompra)
  };
};

const getRelatedDocument = (json) => {
  const related = Array.isArray(json?.documentoRelacionado)
    ? json.documentoRelacionado[0]
    : json?.documentoRelacionado;
  if (!related) return null;

  return {
    controlNumber: clean(related.numeroDocumento),
    generationCode: clean(related.codigoGeneracion),
    documentTypeCode: clean(related.tipoDocumento)
  };
};

const parseControlNumber = (controlNumber) => {
  const match = String(controlNumber || '').match(/^DTE-(\d{2})-([A-Z]\d{3})(P\d{3})-(\d{15})$/i);
  if (!match) return null;
  return {
    documentTypeCode: match[1],
    establishmentCode: match[2].toUpperCase(),
    pointOfSaleCode: match[3].toUpperCase(),
    sequence: Number(match[4])
  };
};

const ensureControlNumberAtLeast = async ({ companyId, year, controlNumber, transaction }) => {
  const parsed = parseControlNumber(controlNumber);
  if (!parsed || !Number.isSafeInteger(parsed.sequence)) return;

  const normalizedYear = Number(year);
  if (!Number.isInteger(normalizedYear)) return;

  const [control] = await ControlNumber.findOrCreate({
    where: {
      companyId,
      year: normalizedYear,
      documentTypeCode: parsed.documentTypeCode,
      establishmentCode: parsed.establishmentCode,
      pointOfSaleCode: parsed.pointOfSaleCode
    },
    defaults: {
      companyId,
      year: normalizedYear,
      documentTypeCode: parsed.documentTypeCode,
      establishmentCode: parsed.establishmentCode,
      pointOfSaleCode: parsed.pointOfSaleCode,
      currentSequence: parsed.sequence
    },
    transaction
  });

  if (Number(control.currentSequence || 0) < parsed.sequence) {
    await control.update({ currentSequence: parsed.sequence }, { transaction });
  }
};

const resolvePointOfSale = async ({ companyId, json, transaction, cache }) => {
  const issuer = json?.emisor || {};
  const identification = json?.identificacion || {};
  const parsedControl = parseControlNumber(identification.numeroControl);
  const establishmentCode = clean(issuer.codEstable || issuer.codEstableMH) || parsedControl?.establishmentCode;
  const pointOfSaleCode = clean(issuer.codPuntoVenta || issuer.codPuntoVentaMH) || parsedControl?.pointOfSaleCode;
  const cacheKey = `${establishmentCode || ''}|${pointOfSaleCode || ''}`;

  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const establishment = await Establishment.findOne({
    where: { companyId, establishmentCode },
    transaction
  });

  if (!establishment) {
    const error = new Error(`No existe el establecimiento ${establishmentCode || '(sin código)'} para ${identification.numeroControl || 'un DTE'}`);
    error.statusCode = 400;
    throw error;
  }

  const pointOfSale = await PointOfSale.findOne({
    where: {
      companyId,
      establishmentId: establishment.id,
      code: pointOfSaleCode
    },
    transaction
  });

  if (!pointOfSale) {
    const error = new Error(`No existe el punto de venta ${establishmentCode}/${pointOfSaleCode || '(sin código)'} para ${identification.numeroControl || 'un DTE'}`);
    error.statusCode = 400;
    throw error;
  }

  const resolved = { establishment, pointOfSale };
  cache.set(cacheKey, resolved);
  return resolved;
};

const resolveInvoiceUserId = async ({ companyId, pointOfSaleId, adminUserId, transaction, cache }) => {
  const key = Number(pointOfSaleId);
  if (cache.has(key)) return cache.get(key);

  const tenantUser = await User.findOne({
    where: { companyId, pointOfSaleId, isActive: true },
    order: [['id', 'ASC']],
    transaction
  });

  const userId = tenantUser?.id || adminUserId;
  cache.set(key, userId);
  return userId;
};

const getUnitName = (code) => {
  if (String(code) === '99') return 'Servicio';
  if (String(code) === '59') return 'Unidad';
  return 'Unidad';
};

const createInvoiceItems = async ({ invoice, json, companyId, establishmentId, transaction }) => {
  const body = Array.isArray(json?.cuerpoDocumento) ? json.cuerpoDocumento : [];

  for (const item of body) {
    const code = clean(item.codigo)?.toUpperCase();
    const product = code
      ? await Product.findOne({ where: { companyId, establishmentId, code }, transaction })
      : null;

    const noSuj = toNumber(item.ventaNoSuj);
    const exenta = toNumber(item.ventaExenta);
    const gravada = toNumber(item.ventaGravada ?? item.compra);
    const iva = toNumber(item.ivaItem);
    const saleType = noSuj > 0 ? 'NO_SUJETA' : (exenta > 0 ? 'EXENTA' : 'GRAVADA');
    const subtotal = noSuj + exenta + gravada;
    // En Factura 01 el precio/venta gravada ya incluye IVA. En los documentos
    // que separan IVA (03/05, etc.) el total de línea sí suma el impuesto.
    const total = String(invoice.documentTypeCode) === '01' ? subtotal : subtotal + iva;
    const itemType = Number(item.tipoItem) === 2 ? 'SERVICIO' : (product?.itemType || 'PRODUCTO');

    await InvoiceItem.create({
      invoiceId: invoice.id,
      productId: product?.id || null,
      itemType,
      code,
      description: clean(item.descripcion) || 'Detalle importado',
      unitOfMeasure: String(item.uniMedida ?? product?.unitOfMeasure ?? (itemType === 'SERVICIO' ? '99' : '59')),
      unitOfMeasureName: product?.unitOfMeasureName || getUnitName(item.uniMedida),
      saleType,
      quantity: toNumber(item.cantidad, 1),
      unitPrice: toNumber(item.precioUni),
      purchasePrice: product?.purchasePrice ?? null,
      noSuj,
      exenta,
      gravada,
      subtotal,
      iva,
      retention1: 0,
      fovial: 0,
      cotrans: 0,
      total
    }, { transaction });
  }
};

const sanitizeStorageFileName = (value) => String(value || 'documento')
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .slice(0, 220);

const storeHistoricalArtifacts = async ({
  document,
  extractDir,
  companyDirName,
  companyStorageDir,
  copiedFiles
}) => {
  const sourceJsonPath = path.join(extractDir, ...document.entry.split('/'));
  const targetJsonName = sanitizeStorageFileName(`${document.controlNumber}.json`);
  const targetJsonPath = path.join(companyStorageDir, targetJsonName);
  await fs.promises.copyFile(sourceJsonPath, targetJsonPath);
  copiedFiles.push(targetJsonPath);

  let pdfRelativePath = null;
  let sourcePdfName = null;

  if (document.pdfEntry) {
    const sourcePdfPath = path.join(extractDir, ...document.pdfEntry.split('/'));
    const targetPdfName = sanitizeStorageFileName(`${document.controlNumber}.pdf`);
    const targetPdfPath = path.join(companyStorageDir, targetPdfName);
    await fs.promises.copyFile(sourcePdfPath, targetPdfPath);
    copiedFiles.push(targetPdfPath);
    pdfRelativePath = path.posix.join(companyDirName, targetPdfName);
    sourcePdfName = path.basename(document.pdfEntry);
  }

  return {
    jsonRelativePath: path.posix.join(companyDirName, targetJsonName),
    pdfRelativePath,
    sourcePdfName
  };
};

const validateZipEntry = (entry) => {
  const normalized = path.posix.normalize(String(entry || '').replace(/\\/g, '/'));
  return normalized
    && !normalized.startsWith('../')
    && !path.posix.isAbsolute(normalized)
    && !normalized.includes('/../');
};

const getMaxExtractedZipBytes = () => {
  const mb = Number(process.env.IMPORT_MAX_EXTRACTED_MB || 1000);
  const safeMb = Number.isFinite(mb) && mb > 0 ? Math.min(mb, 4096) : 1000;
  return Math.floor(safeMb * 1024 * 1024);
};

const validateZipExpandedSize = async (zipPath) => {
  const { stdout } = await execFileAsync('unzip', ['-l', zipPath], { maxBuffer: 10 * 1024 * 1024 });
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = [...lines].reverse().find((line) => /\d+\s+files?$/i.test(line));
  const match = summary?.match(/^(\d+)\s+.*?(\d+)\s+files?$/i);
  const expandedBytes = match ? Number(match[1]) : 0;
  const maxBytes = getMaxExtractedZipBytes();

  if (expandedBytes > maxBytes) {
    const error = new Error(`El contenido descomprimido del ZIP supera el límite permitido de ${Math.round(maxBytes / 1024 / 1024)} MB`);
    error.statusCode = 413;
    throw error;
  }
};

const listZipEntries = async (zipPath) => {
  try {
    await validateZipExpandedSize(zipPath);
    const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath], { maxBuffer: 10 * 1024 * 1024 });
    const entries = stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    const unsafe = entries.find((entry) => !validateZipEntry(entry));
    if (unsafe) {
      const error = new Error(`El ZIP contiene una ruta no segura: ${unsafe}`);
      error.statusCode = 400;
      throw error;
    }
    return entries;
  } catch (error) {
    if (error.statusCode) throw error;
    const wrapped = new Error('No se pudo leer el ZIP. Verifique que sea un archivo ZIP válido con carpetas json/ y pdf/.');
    wrapped.statusCode = 400;
    throw wrapped;
  }
};

const importDteZip = async ({ companyId, adminUserId, zipPath, sourceFileName }) => {
  const company = await validateActiveCompany(companyId);
  const entries = await listZipEntries(zipPath);
  const jsonEntries = entries.filter((entry) => /^json\/[^/]+\.json$/i.test(entry));
  const pdfEntries = entries.filter((entry) => /^pdf\/[^/]+\.pdf$/i.test(entry));

  if (jsonEntries.length === 0) {
    const error = new Error('El ZIP no contiene archivos JSON dentro de la carpeta json/');
    error.statusCode = 400;
    throw error;
  }

  const extractDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dte-import-extract-'));
  const storageDir = await ensureImportStorageDir();
  const companyDirName = `company-${Number(companyId)}`;
  const companyStorageDir = path.join(storageDir, companyDirName);
  const copiedFiles = [];

  try {
    await execFileAsync('unzip', ['-q', zipPath, '-d', extractDir], { maxBuffer: 10 * 1024 * 1024 });

    const parsedDocuments = [];
    const expectedNit = normalizeNit(company.nit);
    const pdfByBase = new Map(pdfEntries.map((entry) => [path.basename(entry, '.pdf').toLowerCase(), entry]));
    const seenControlNumbers = new Set();
    const seenGenerationCodes = new Set();

    for (const entry of jsonEntries) {
      const absoluteJsonPath = path.join(extractDir, ...entry.split('/'));
      const rawJson = await fs.promises.readFile(absoluteJsonPath, 'utf8');
      let json;

      try {
        json = JSON.parse(rawJson.replace(/^\uFEFF/, ''));
      } catch (error) {
        const invalid = new Error(`JSON inválido: ${entry}`);
        invalid.statusCode = 400;
        throw invalid;
      }

      const identification = json?.identificacion || {};
      const issuerNit = normalizeNit(json?.emisor?.nit);
      const documentTypeCode = String(identification.tipoDte || '').padStart(2, '0');
      const controlNumber = clean(identification.numeroControl);
      const generationCode = clean(identification.codigoGeneracion)?.toUpperCase();

      if (!controlNumber || !generationCode || !SUPPORTED_DTE_TYPES.has(documentTypeCode)) {
        const invalid = new Error(`El archivo ${entry} no contiene una identificación DTE soportada (01, 03, 05, 11 o 14)`);
        invalid.statusCode = 400;
        throw invalid;
      }

      if (!issuerNit || issuerNit !== expectedNit) {
        const mismatch = new Error(`El DTE ${controlNumber} pertenece al NIT ${issuerNit || 'desconocido'} y no al contribuyente activo ${expectedNit}`);
        mismatch.statusCode = 400;
        throw mismatch;
      }

      if (seenControlNumbers.has(controlNumber) || seenGenerationCodes.has(generationCode)) {
        const duplicate = new Error(`El ZIP contiene DTE duplicado: ${controlNumber}`);
        duplicate.statusCode = 400;
        throw duplicate;
      }
      seenControlNumbers.add(controlNumber);
      seenGenerationCodes.add(generationCode);

      const baseName = path.basename(entry, '.json').toLowerCase();
      const pdfEntry = pdfByBase.get(baseName) || null;

      parsedDocuments.push({ entry, json, pdfEntry, documentTypeCode, controlNumber, generationCode });
    }

    await fs.promises.mkdir(companyStorageDir, { recursive: true });

    const result = await sequelize.transaction(async (transaction) => {
      let created = 0;
      let skippedExisting = 0;
      let withoutPdf = 0;
      const importedInvoices = [];
      const posCache = new Map();
      const userCache = new Map();

      for (const document of parsedDocuments) {
        const [existingByControl, existingByGeneration] = await Promise.all([
          Invoice.findOne({
            where: { companyId, controlNumber: document.controlNumber },
            transaction
          }),
          Invoice.findOne({
            where: { generationCode: document.generationCode },
            transaction
          })
        ]);

        if (existingByGeneration && Number(existingByGeneration.companyId) !== Number(companyId)) {
          const conflict = new Error(`El código de generación ${document.generationCode} ya pertenece a otro contribuyente`);
          conflict.statusCode = 409;
          throw conflict;
        }

        if (existingByControl && String(existingByControl.generationCode).toUpperCase() !== document.generationCode) {
          const conflict = new Error(`El número de control ${document.controlNumber} ya existe con un código de generación diferente. Revise los correlativos antes de importar.`);
          conflict.statusCode = 409;
          throw conflict;
        }

        if (existingByGeneration && String(existingByGeneration.controlNumber) !== document.controlNumber) {
          const conflict = new Error(`El código de generación ${document.generationCode} ya existe con un número de control diferente`);
          conflict.statusCode = 409;
          throw conflict;
        }

        const existing = existingByControl || existingByGeneration;

        if (existing) {
          const currentArtifact = await InvoiceImportArtifact.findOne({
            where: { companyId, invoiceId: existing.id },
            transaction
          });

          if (!currentArtifact) {
            const storedArtifacts = await storeHistoricalArtifacts({
              document,
              extractDir,
              companyDirName,
              companyStorageDir,
              copiedFiles
            });

            if (!document.pdfEntry) withoutPdf += 1;

            await InvoiceImportArtifact.create({
              companyId,
              invoiceId: existing.id,
              sourceJsonName: path.basename(document.entry),
              sourcePdfName: storedArtifacts.sourcePdfName,
              jsonRelativePath: storedArtifacts.jsonRelativePath,
              pdfRelativePath: storedArtifacts.pdfRelativePath,
              importedAt: new Date()
            }, { transaction });
          }

          await ensureControlNumberAtLeast({
            companyId,
            year: Number(String(document.json?.identificacion?.fecEmi || '').slice(0, 4)),
            controlNumber: document.controlNumber,
            transaction
          });

          skippedExisting += 1;
          continue;
        }

        const { establishment, pointOfSale } = await resolvePointOfSale({
          companyId,
          json: document.json,
          transaction,
          cache: posCache
        });

        const userId = await resolveInvoiceUserId({
          companyId,
          pointOfSaleId: pointOfSale.id,
          adminUserId,
          transaction,
          cache: userCache
        });

        const receiver = normalizeReceiver(document.json);
        const customer = await findOrCreateReceiverCustomer({
          companyId,
          establishmentId: establishment.id,
          documentTypeCode: document.documentTypeCode,
          receiver,
          transaction
        });

        const status = getImportedStatus(document.json);
        const issuedAt = buildIssuedAt(document.json.identificacion);
        const totals = getDteTotals(document.json);
        const related = getRelatedDocument(document.json);
        const receptionSeal = getImportedReceptionSeal(document.json);
        const invalidationSeal = getAppendixValue(document.json, 'selloAnulacion');
        const invalidatedAt = validDate(getAppendixValue(document.json, 'fechaAnulacion'));
        const invalidationReason = getAppendixValue(document.json, 'motivoAnulacion');
        const paymentCode = clean(document.json?.resumen?.pagos?.[0]?.codigo);

        const invoice = await Invoice.create({
          companyId,
          pointOfSaleId: pointOfSale.id,
          userId,
          customerId: customer?.id || null,
          documentTypeCode: document.documentTypeCode,
          documentTypeName: DOCUMENT_TYPE_NAMES[document.documentTypeCode],
          controlNumber: document.controlNumber,
          generationCode: document.generationCode,
          signedJws: null,
          signedAt: null,
          validationStatus: 'VALIDADO',
          validationErrorsJson: null,
          mhResponseJson: {
            imported: true,
            source: sourceFileName || 'ZIP histórico',
            estado: status,
            selloRecibido: receptionSeal || null
          },
          mhObservationsJson: null,
          receptionSeal,
          relatedInvoiceId: null,
          relatedControlNumber: related?.controlNumber || null,
          relatedGenerationCode: related?.generationCode || null,
          relatedDocumentTypeCode: related?.documentTypeCode || null,
          // El ZIP histórico no contiene la hora exacta de recepción de Hacienda.
          // No se inventan esas marcas de tiempo; el estado y sello sí se preservan.
          transmittedAt: null,
          acceptedAt: null,
          rejectedAt: null,
          rejectionReason: getAppendixValue(document.json, 'motivoRechazo'),
          invalidatedAt: status === 'ANULADO' ? (invalidatedAt || issuedAt) : null,
          invalidationReason: status === 'ANULADO' ? invalidationReason : null,
          invalidationReceptionSeal: status === 'ANULADO' ? invalidationSeal : null,
          status,
          issuedAt,
          tipoModelo: toNumber(document.json?.identificacion?.tipoModelo, 1),
          tipoOperacion: toNumber(document.json?.identificacion?.tipoOperacion, 1),
          tipoContingencia: toNullableNumber(document.json?.identificacion?.tipoContingencia),
          motivoContin: clean(document.json?.identificacion?.motivoContin),
          operationCondition: mapOperationCondition(document.json?.resumen?.condicionOperacion),
          paymentMethod: PAYMENT_METHOD_MAP[paymentCode] || 'OTRO',
          saleDescription: null,
          ...totals,
          notes: clean(document.json?.extension?.observaciones)
        }, { transaction });

        await createInvoiceItems({
          invoice,
          json: document.json,
          companyId,
          establishmentId: establishment.id,
          transaction
        });

        const storedArtifacts = await storeHistoricalArtifacts({
          document,
          extractDir,
          companyDirName,
          companyStorageDir,
          copiedFiles
        });

        if (!document.pdfEntry) withoutPdf += 1;

        await InvoiceImportArtifact.create({
          companyId,
          invoiceId: invoice.id,
          sourceJsonName: path.basename(document.entry),
          sourcePdfName: storedArtifacts.sourcePdfName,
          jsonRelativePath: storedArtifacts.jsonRelativePath,
          pdfRelativePath: storedArtifacts.pdfRelativePath,
          importedAt: new Date()
        }, { transaction });

        await ensureControlNumberAtLeast({
          companyId,
          year: Number(String(document.json?.identificacion?.fecEmi || '').slice(0, 4)),
          controlNumber: document.controlNumber,
          transaction
        });

        importedInvoices.push({ invoice, related });
        created += 1;
      }

      for (const imported of importedInvoices) {
        if (!imported.related?.generationCode && !imported.related?.controlNumber) continue;

        const relatedInvoice = await Invoice.findOne({
          where: {
            companyId,
            [Op.or]: [
              ...(imported.related.generationCode ? [{ generationCode: imported.related.generationCode }] : []),
              ...(imported.related.controlNumber ? [{ controlNumber: imported.related.controlNumber }] : [])
            ]
          },
          transaction
        });

        if (relatedInvoice) {
          await imported.invoice.update({ relatedInvoiceId: relatedInvoice.id }, { transaction });
        }
      }

      return {
        totalJson: parsedDocuments.length,
        totalPdf: pdfEntries.length,
        created,
        skippedExisting,
        withoutPdf
      };
    });

    return result;
  } catch (error) {
    for (const filePath of copiedFiles) {
      try { await fs.promises.unlink(filePath); } catch {}
    }
    throw error;
  } finally {
    await fs.promises.rm(extractDir, { recursive: true, force: true });
  }
};

const getImportSummary = async ({ companyId }) => {
  const [customers, products, invoices, artifacts] = await Promise.all([
    Customer.count({ where: { companyId } }),
    Product.count({ where: { companyId } }),
    Invoice.count({ where: { companyId } }),
    InvoiceImportArtifact.count({ where: { companyId } })
  ]);

  let storageReady = false;
  let storageError = null;

  try {
    const storageDir = await ensureImportStorageDir();
    await fs.promises.access(storageDir, fs.constants.R_OK | fs.constants.W_OK);
    storageReady = true;
  } catch (error) {
    storageError = error.message;
  }

  return {
    customers,
    products,
    invoices,
    importedDocuments: artifacts,
    storageReady,
    storageError
  };
};

const createTempUploadPath = (extension = '.tmp') => path.join(
  os.tmpdir(),
  `fe-import-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`
);

module.exports = {
  importCustomersCsv,
  importProductsCsv,
  importDteZip,
  getImportSummary,
  createTempUploadPath
};
