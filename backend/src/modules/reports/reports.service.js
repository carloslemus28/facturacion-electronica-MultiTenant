const ExcelJS = require('exceljs');
const { Op } = require('sequelize');

const Invoice = require('../invoices/invoice.model');
const Customer = require('../customers/customer.model');
const PointOfSale = require('../companies/point-of-sale.model');

const REPORT_HEADERS = [
  'Fecha', 'Número control', 'Cod. Generación', 'Sello recepción', 'NIT', 'NRC',
  'Receptor', 'NoSuj', 'Exenta', 'Subtotal', 'IVA', 'Ret.1%', 'FOVIAL', 'COTRANS',
  'Total a pagar', 'Estado', 'Est. pago', 'Observaciones'
];

const DOCUMENT_REPORT_NAMES = { '01': 'FAC', '03': 'CCF', '05': 'NC', '11': 'FEx' };

const getBoundedInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const DEFAULT_BATCH_SIZE = getBoundedInteger(process.env.REPORT_EXPORT_BATCH_SIZE, 500, 100, 2000);
const DEFAULT_PREVIEW_LIMIT = getBoundedInteger(process.env.REPORT_PREVIEW_LIMIT, 200, 50, 500);

const formatDateForExcel = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const removeHyphensForExcel = (value) => value ? String(value).replace(/-/g, '') : '';
const normalizePaymentStatus = (invoice) => invoice.status === 'ANULADO' ? 'Anulado' : 'No pagado';
const normalizeDocumentStatus = (status) => ({
  BORRADOR: 'Borrador', GENERADO: 'Generado', FIRMADO: 'Firmado', TRANSMITIDO: 'Transmitido',
  ACEPTADO: 'Enviado', RECHAZADO: 'Rechazado', ANULADO: 'Anulado'
}[status] || status);

const buildReportFileName = ({ documentTypeCode, startDate, endDate }) => {
  const reportName = DOCUMENT_REPORT_NAMES[documentTypeCode] || 'DTE';
  return `Lista_${reportName}_${startDate || 'inicio'}_al_${endDate || 'fin'}.xlsx`;
};

const buildReportWhere = ({ companyId, documentTypeCode, startDate, endDate, status }) => {
  if (!companyId) {
    const error = new Error('No se pudo determinar el contribuyente del reporte');
    error.statusCode = 400;
    throw error;
  }

  const where = { companyId };
  if (documentTypeCode) where.documentTypeCode = documentTypeCode;
  if (status) where.status = status;

  if (startDate || endDate) where.issuedAt = {};
  if (startDate) where.issuedAt[Op.gte] = new Date(`${startDate}T00:00:00`);
  if (endDate) where.issuedAt[Op.lte] = new Date(`${endDate}T23:59:59.999`);
  return where;
};

const getInvoiceAttributes = () => [
  'id', 'issuedAt', 'documentTypeCode', 'documentTypeName', 'controlNumber', 'generationCode',
  'receptionSeal', 'noSuj', 'exenta', 'gravada', 'subtotal', 'iva', 'retention1', 'fovial',
  'cotrans', 'total', 'status', 'notes'
];

const customerInclude = {
  model: Customer,
  as: 'customer',
  attributes: ['id', 'documentNumber', 'nrc', 'name'],
  required: false
};

const cursorCondition = (cursor) => {
  if (!cursor) return null;
  return {
    [Op.or]: [
      { issuedAt: { [Op.gt]: cursor.issuedAt } },
      { issuedAt: cursor.issuedAt, id: { [Op.gt]: cursor.id } }
    ]
  };
};

const getInvoiceBatch = async ({ where, establishmentId = null, cursor = null, limit = DEFAULT_BATCH_SIZE }) => {
  const batchWhere = { ...where };
  const cursorWhere = cursorCondition(cursor);
  if (cursorWhere) batchWhere[Op.and] = [cursorWhere];

  const include = [customerInclude];
  if (establishmentId) {
    include.push({
      model: PointOfSale,
      as: 'pointOfSale',
      attributes: [],
      where: { establishmentId },
      required: true
    });
  }

  return Invoice.findAll({
    where: batchWhere,
    attributes: getInvoiceAttributes(),
    include,
    order: [['issuedAt', 'ASC'], ['id', 'ASC']],
    limit,
    subQuery: false
  });
};

const invoiceToRow = (invoice) => {
  const customer = invoice.customer;
  return [
    formatDateForExcel(invoice.issuedAt),
    removeHyphensForExcel(invoice.controlNumber),
    removeHyphensForExcel(invoice.generationCode),
    invoice.receptionSeal || '',
    customer?.documentNumber || '',
    customer?.nrc || '',
    customer?.name || '',
    Number(invoice.noSuj || 0),
    Number(invoice.exenta || 0),
    Number(invoice.gravada || invoice.subtotal || 0),
    Number(invoice.iva || 0),
    Number(invoice.retention1 || 0),
    Number(invoice.fovial || 0),
    Number(invoice.cotrans || 0),
    Number(invoice.total || 0),
    normalizeDocumentStatus(invoice.status),
    normalizePaymentStatus(invoice),
    invoice.notes || ''
  ];
};

const configureWorksheet = (worksheet) => {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: 'R1' };
  const widths = [22, 36, 36, 42, 18, 14, 48, 12, 12, 14, 14, 14, 12, 12, 16, 14, 14, 60];
  widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
  [8, 9, 10, 11, 12, 13, 14, 15].forEach((column) => { worksheet.getColumn(column).numFmt = '#,##0.00'; });
  [2, 3].forEach((column) => { worksheet.getColumn(column).numFmt = '@'; });

  const header = worksheet.addRow(REPORT_HEADERS);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 22;
  header.commit();
};

const streamExcelReport = async ({ outputStream, companyId, establishmentId, documentTypeCode, startDate, endDate, status }) => {
  const where = buildReportWhere({ companyId, documentTypeCode, startDate, endDate, status });
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: outputStream,
    useStyles: true,
    useSharedStrings: false
  });
  workbook.creator = 'Sistema de Facturación Electrónica SV';
  const worksheet = workbook.addWorksheet('DTE Clientes');
  configureWorksheet(worksheet);

  let cursor = null;
  let totalRows = 0;

  while (true) {
    const invoices = await getInvoiceBatch({ where, establishmentId, cursor });
    if (invoices.length === 0) break;

    for (const invoice of invoices) {
      const row = worksheet.addRow(invoiceToRow(invoice));
      row.alignment = { vertical: 'top', wrapText: true };
      row.commit();
      totalRows += 1;
    }

    const last = invoices[invoices.length - 1];
    cursor = { issuedAt: last.issuedAt, id: last.id };
    if (invoices.length < DEFAULT_BATCH_SIZE) break;
  }

  worksheet.commit();
  await workbook.commit();
  return totalRows;
};

const listInvoicesForReportPreview = async (params) => {
  const where = buildReportWhere(params);
  const limit = getBoundedInteger(params.limit, DEFAULT_PREVIEW_LIMIT, 1, DEFAULT_PREVIEW_LIMIT);
  const invoices = await getInvoiceBatch({ where, establishmentId: params.establishmentId, limit: limit + 1 });
  const hasMore = invoices.length > limit;
  const visible = hasMore ? invoices.slice(0, limit) : invoices;

  return {
    invoices: visible.map((invoice) => ({
      id: invoice.id,
      issuedAt: invoice.issuedAt,
      documentTypeCode: invoice.documentTypeCode,
      documentTypeName: invoice.documentTypeName,
      controlNumber: invoice.controlNumber,
      generationCode: invoice.generationCode,
      receptionSeal: invoice.receptionSeal || '',
      customerName: invoice.customer?.name || '',
      customerDocument: invoice.customer?.documentNumber || '',
      customerNrc: invoice.customer?.nrc || '',
      noSuj: Number(invoice.noSuj || 0),
      exenta: Number(invoice.exenta || 0),
      gravada: Number(invoice.gravada || invoice.subtotal || 0),
      subtotal: Number(invoice.subtotal || 0),
      iva: Number(invoice.iva || 0),
      retention1: Number(invoice.retention1 || 0),
      fovial: Number(invoice.fovial || 0),
      cotrans: Number(invoice.cotrans || 0),
      total: Number(invoice.total || 0),
      status: invoice.status,
      paymentStatus: normalizePaymentStatus(invoice),
      notes: invoice.notes || ''
    })),
    hasMore,
    limit
  };
};

module.exports = { streamExcelReport, buildReportFileName, listInvoicesForReportPreview };
