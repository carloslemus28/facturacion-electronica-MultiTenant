const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const invoicesService = require('../invoices/invoices.service');
const { amountToSpanishWords } = require('./dte-json.service');
const { APP_NAME, APP_COMPANY_NAME, PDF_FOOTER_TEXT } = require('../../config/brand');

const PAGE = {
  margin: 24,
  width: 612,
  height: 792,
  contentWidth: 564,
  footerY: 748
};

const LOGO_BOX = {
  xOffset: 10,
  yOffset: 8,
  width: 124,
  height: 62
};

const COLORS = {
  dark: '#111827',
  muted: '#374151',
  soft: '#f8fafc',
  border: '#111827',
  lightBorder: '#cbd5e1',
  success: '#047857',
  danger: '#b91c1c',
  slate: '#334155'
};

const money = (value) => {
  return `$${Number(value || 0).toFixed(2)}`;
};

const quantity = (value) => {
  return Number(value || 0).toFixed(4);
};

const safe = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const cleanFileName = (value) => {
  return String(value || 'documento')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_');
};

const formatDate = (value) => {
  if (!value) return '';

  return new Date(value).toLocaleDateString('es-SV', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const formatDateTime = (value) => {
  if (!value) return '';

  return new Date(value).toLocaleString('es-SV', {
    timeZone: process.env.APP_TIMEZONE || 'America/El_Salvador',
    dateStyle: 'short',
    timeStyle: 'short'
  });
};

const formatIdentifier = (value, chunkSize = 22) => {
  const text = safe(value, '');

  if (!text) return '';

  if (text.length <= chunkSize) {
    return text;
  }

  const chunks = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  return chunks.join('\n');
};

const getPdfBuffer = (doc) => {
  return new Promise((resolve, reject) => {
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.end();
  });
};

const buildQrBuffer = async (payload) => {
  const text = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload);

  const dataUrl = await QRCode.toDataURL(text, {
    margin: 1,
    width: 160
  });

  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

const imageBufferFromDataUrl = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;

  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);

  if (!match) return null;

  return Buffer.from(match[2], 'base64');
};

const drawLogoPlaceholder = (doc, x, y, width, height) => {
  drawBox(doc, x, y, width, height, {
    stroke: COLORS.lightBorder,
    fill: COLORS.soft
  });

  drawText(doc, 'LOGO', x, y + (height / 2) - 4, {
    width,
    align: 'center',
    size: 8,
    bold: true,
    color: COLORS.muted
  });
};

const drawAdaptiveLogo = (doc, logoBuffer, x, y, maxWidth, maxHeight) => {
  if (!logoBuffer) {
    return;
  }

  try {
    const image = doc.openImage(logoBuffer);

    const imageWidth = Number(image.width || maxWidth);
    const imageHeight = Number(image.height || maxHeight);

    const ratio = Math.min(
      maxWidth / imageWidth,
      maxHeight / imageHeight
    );

    const drawWidth = imageWidth * ratio;
    const drawHeight = imageHeight * ratio;

    const drawX = x + ((maxWidth - drawWidth) / 2);
    const drawY = y + ((maxHeight - drawHeight) / 2);

    doc.image(logoBuffer, drawX, drawY, {
      width: drawWidth,
      height: drawHeight
    });
  } catch (error) {
    return;
  }
};

const drawBox = (doc, x, y, w, h, options = {}) => {
  doc
    .save()
    .rect(x, y, w, h)
    .lineWidth(options.lineWidth || 0.7)
    .strokeColor(options.stroke || COLORS.border)
    .fillAndStroke(options.fill || '#ffffff', options.stroke || COLORS.border)
    .restore();
};

const drawText = (doc, text, x, y, options = {}) => {
  doc
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 7)
    .fillColor(options.color || COLORS.dark)
    .text(safe(text, options.fallback || ''), x, y, {
      width: options.width,
      align: options.align || 'left',
      height: options.height,
      ellipsis: options.ellipsis ?? true,
      lineGap: options.lineGap || 0
    });
};

const drawLabelValue = (doc, label, value, x, y, labelWidth, valueWidth, options = {}) => {
  drawText(doc, `${label}:`, x, y, {
    width: labelWidth,
    size: options.size || 6.7,
    bold: true
  });

  drawText(doc, value || '-', x + labelWidth + 2, y, {
    width: valueWidth,
    size: options.size || 6.7,
    bold: options.valueBold || false,
    height: options.height,
    ellipsis: options.ellipsis ?? true,
    lineGap: options.lineGap || 0
  });
};

const drawStackedLabelValue = (doc, label, value, x, y, width, options = {}) => {
  drawText(doc, `${label}:`, x, y, {
    width,
    size: options.labelSize || 5.7,
    bold: true,
    ellipsis: false
  });

  drawText(doc, value || '-', x, y + (options.labelGap || 7), {
    width,
    size: options.valueSize || 5,
    bold: options.valueBold || false,
    height: options.height || 16,
    ellipsis: false,
    lineGap: options.lineGap || 0
  });
};

const getDteVersion = (documentTypeCode) => {
  const versions = {
    '01': 1,
    '03': 3,
    '05': 3,
    '11': 1,
    '14': 1
  };

  return versions[documentTypeCode] || 1;
};

const getEnvironmentName = (environment) => {
  return environment === 'PRODUCTION' ? 'PRODUCCIÓN' : 'PRUEBAS';
};

const getEnvironmentCode = (environment) => {
  return environment === 'PRODUCTION' ? '01' : '00';
};

const formatPublicQueryDate = (value) => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(safeDate);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const buildPublicQueryUrl = ({ invoice, generationCode, issuedAt }) => {
  const params = new URLSearchParams({
    ambiente: getEnvironmentCode(invoice.company?.environment),
    codGen: safe(generationCode || invoice.generationCode),
    fechaEmi: formatPublicQueryDate(issuedAt || invoice.issuedAt)
  });

  return `https://admin.factura.gob.sv/consultaPublica?${params.toString()}`;
};

const getModelName = () => 'PREVIO';
const getOperationName = () => 'NORMAL';
const getTransmissionName = () => 'NORMAL';

const getStatusColor = (status) => {
  if (status === 'ACEPTADO') return COLORS.success;
  if (status === 'RECHAZADO') return COLORS.danger;
  if (status === 'ANULADO') return COLORS.slate;
  return COLORS.dark;
};

const companyUsesFuelTaxes = (invoice) => {
  return Boolean(invoice.company?.usesFuelTaxes);
};

const drawFooter = (doc, invoice) => {
  const y = PAGE.footerY;

  doc
    .moveTo(PAGE.margin, y - 8)
    .lineTo(PAGE.width - PAGE.margin, y - 8)
    .strokeColor(COLORS.lightBorder)
    .lineWidth(0.6)
    .stroke();

  drawText(doc, PDF_FOOTER_TEXT, PAGE.margin, y, {
  width: 300,
  size: 6.7,
  bold: true
});

  drawText(doc, `Documento: ${safe(invoice.controlNumber)} | Estado: ${safe(invoice.status)}`, PAGE.margin, y + 11, {
    width: 330,
    size: 6.5,
    ellipsis: false
  });

  drawText(doc, 'Representación gráfica del Documento Tributario Electrónico.', 360, y, {
    width: 228,
    align: 'right',
    size: 6.5
  });

  if (invoice.receptionSeal) {
    drawText(doc, `Sello: ${invoice.receptionSeal}`, 300, y + 11, {
      width: 288,
      align: 'right',
      size: 5.8,
      ellipsis: false
    });
  }
};

const addPage = (doc, invoice) => {
  drawFooter(doc, invoice);
  doc.addPage();
};

const ensureSpace = (doc, invoice, y, neededHeight) => {
  if (y + neededHeight <= PAGE.footerY - 12) {
    return y;
  }

  addPage(doc, invoice);
  return PAGE.margin;
};

const drawWatermark = (doc, status) => {
  if (!['ANULADO', 'RECHAZADO'].includes(status)) return;

  const text = status === 'ANULADO' ? 'DOCUMENTO ANULADO' : 'DOCUMENTO RECHAZADO';
  const color = status === 'ANULADO' ? '#475569' : '#b91c1c';

  doc.save();
  doc.opacity(0.16);
  doc.rotate(-28, { origin: [PAGE.width / 2, PAGE.height / 2] });

  doc
    .font('Helvetica-Bold')
    .fontSize(54)
    .fillColor(color)
    .text(text, 30, 378, {
      width: 560,
      align: 'center',
      lineGap: 2
    });

  doc.restore();
  doc.opacity(1);
};

const drawWatermarkOnAllPages = (doc, status) => {
  if (!['ANULADO', 'RECHAZADO'].includes(status)) return;

  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    drawWatermark(doc, status);
  }
};

const drawHeader = async (doc, invoice) => {
  const company = invoice.company || {};
  const pointOfSale = invoice.pointOfSale || {};
  const establishment = pointOfSale.establishment || {};

  const x = PAGE.margin;
  const y = PAGE.margin;

  drawBox(doc, x, y, PAGE.contentWidth, 152);

const shouldDrawLogo = company.useLogoInPdf !== false && Boolean(company.logoDataUrl);
const logoBuffer = shouldDrawLogo ? imageBufferFromDataUrl(company.logoDataUrl) : null;

if (logoBuffer) {
  drawAdaptiveLogo(
    doc,
    logoBuffer,
    x + LOGO_BOX.xOffset,
    y + LOGO_BOX.yOffset,
    LOGO_BOX.width,
    LOGO_BOX.height
  );
}

const issuerInfoX = logoBuffer ? x + 146 : x + 10;
const issuerInfoWidth = logoBuffer ? 168 : 304;

drawText(doc, company.commercialName || company.legalName, issuerInfoX, y + 12, {
  width: issuerInfoWidth,
  size: 9.6,
  bold: true,
  height: 28,
  ellipsis: false,
  lineGap: 1
});

drawText(doc, company.legalName, issuerInfoX, y + 43, {
  width: issuerInfoWidth,
  size: 6.8,
  height: 16,
  ellipsis: false
});

  drawLabelValue(doc, 'Giro', company.economicActivityName, x + 10, y + 76, 32, 276, {
    size: 6.4,
    height: 15,
    ellipsis: false
  });
  drawLabelValue(doc, 'NIT', company.nit, x + 10, y + 94, 32, 110, { size: 6.4 });
  drawLabelValue(doc, 'NRC', company.nrc, x + 145, y + 94, 32, 100, { size: 6.4 });
  drawLabelValue(doc, 'Dirección', establishment.addressComplement || company.addressComplement, x + 10, y + 110, 52, 252, {
    size: 6.4,
    ellipsis: false
  });
  drawLabelValue(doc, 'Correo', company.email, x + 10, y + 126, 42, 145, {
    size: 6.4,
    ellipsis: false
  });
  drawLabelValue(doc, 'Tel.', company.phone, x + 190, y + 126, 24, 90, { size: 6.4 });

  const qrUrl = buildPublicQueryUrl({
    invoice,
    generationCode: invoice.generationCode,
    issuedAt: invoice.issuedAt
  });

  const qrBuffer = await buildQrBuffer(qrUrl);

  drawBox(doc, x + 324, y + 12, 82, 82, {
    stroke: COLORS.lightBorder,
    fill: '#ffffff'
  });

  doc.image(qrBuffer, x + 331, y + 19, {
    width: 68,
    height: 68
  });

  drawText(doc, 'CÓDIGO QR', x + 324, y + 98, {
    width: 82,
    align: 'center',
    size: 6.5,
    bold: true
  });

  drawText(doc, safe(invoice.status), x + 324, y + 111, {
    width: 82,
    align: 'center',
    size: 7,
    bold: true,
    color: getStatusColor(invoice.status)
  });

  drawText(doc, 'DOCUMENTO TRIBUTARIO ELECTRÓNICO', x + 416, y + 12, {
    width: 138,
    size: 7.2,
    bold: true,
    align: 'center',
    ellipsis: false
  });

  drawText(doc, invoice.documentTypeName, x + 416, y + 27, {
    width: 138,
    size: 8.2,
    bold: true,
    align: 'center',
    height: 22,
    ellipsis: false
  });

  drawStackedLabelValue(
    doc,
    'Código generación',
    formatIdentifier(invoice.generationCode, 22),
    x + 416,
    y + 52,
    138,
    {
      labelSize: 5.5,
      valueSize: 4.8,
      valueBold: true,
      height: 16
    }
  );

  drawStackedLabelValue(
    doc,
    'Número control',
    formatIdentifier(invoice.controlNumber, 24),
    x + 416,
    y + 76,
    138,
    {
      labelSize: 5.5,
      valueSize: 4.8,
      valueBold: true,
      height: 16
    }
  );

  drawStackedLabelValue(
    doc,
    'Sello recepción',
    formatIdentifier(invoice.receptionSeal || 'Pendiente', 22),
    x + 416,
    y + 100,
    138,
    {
      labelSize: 5.5,
      valueSize: 4.65,
      valueBold: Boolean(invoice.receptionSeal),
      height: 17
    }
  );

  drawLabelValue(doc, 'Moneda', 'USD', x + 416, y + 128, 34, 30, { size: 5.7 });
  drawLabelValue(doc, 'Versión', getDteVersion(invoice.documentTypeCode), x + 486, y + 128, 36, 22, { size: 5.7 });
  drawLabelValue(doc, 'Ambiente', getEnvironmentName(company.environment), x + 416, y + 140, 44, 70, { size: 5.7 });

  return y + 162;
};

const drawTechnicalInfo = (doc, invoice, y) => {
  drawBox(doc, PAGE.margin, y, PAGE.contentWidth, 24, {
    fill: COLORS.soft
  });

  drawLabelValue(doc, 'Tipo modelo', getModelName(), PAGE.margin + 8, y + 8, 60, 70, { size: 6.2 });
  drawLabelValue(doc, 'Tipo operación', getOperationName(), PAGE.margin + 150, y + 8, 72, 70, { size: 6.2 });
  drawLabelValue(doc, 'Tipo transmisión', getTransmissionName(), PAGE.margin + 310, y + 8, 82, 70, { size: 6.2 });
  drawLabelValue(doc, 'Fecha emisión', formatDate(invoice.issuedAt), PAGE.margin + 462, y + 8, 68, 45, { size: 6.2 });

  return y + 31;
};

const drawReceiverAndSaleInfo = (doc, invoice, y) => {
  const customer = invoice.customer || {};

  drawBox(doc, PAGE.margin, y, PAGE.contentWidth, 106);

  drawText(doc, 'DATOS DEL RECEPTOR', PAGE.margin + 10, y + 8, {
    width: 260,
    size: 8,
    bold: true
  });

  drawLabelValue(doc, 'Cliente', customer.name, PAGE.margin + 10, y + 25, 46, 245, {
    size: 6.3,
    height: 15,
    ellipsis: false
  });
  drawLabelValue(doc, 'NIT/Doc.', customer.documentNumber, PAGE.margin + 10, y + 42, 46, 120, { size: 6.3 });
  drawLabelValue(doc, 'NRC', customer.nrc, PAGE.margin + 184, y + 42, 25, 80, { size: 6.3 });
  drawLabelValue(doc, 'Giro', customer.economicActivityName, PAGE.margin + 10, y + 57, 46, 245, {
    size: 6.3,
    height: 15,
    ellipsis: false
  });
  drawLabelValue(doc, 'Dirección', customer.addressComplement, PAGE.margin + 10, y + 74, 46, 245, {
    size: 6.3,
    height: 15,
    ellipsis: false
  });
  drawLabelValue(doc, 'Correo', customer.email, PAGE.margin + 10, y + 91, 46, 150, {
    size: 6.3,
    ellipsis: false
  });

  drawText(doc, 'DATOS DE LA VENTA', PAGE.margin + 310, y + 8, {
    width: 240,
    size: 8,
    bold: true
  });

  drawLabelValue(doc, 'Condición', invoice.operationCondition, PAGE.margin + 310, y + 25, 62, 130, { size: 6.3 });
  drawLabelValue(doc, 'Forma pago', invoice.paymentMethod, PAGE.margin + 310, y + 42, 62, 130, { size: 6.3 });
  drawLabelValue(doc, 'Vendedor', invoice.user ? `${invoice.user.firstName || ''} ${invoice.user.lastName || ''}` : '', PAGE.margin + 310, y + 59, 62, 130, {
    size: 6.3,
    ellipsis: false
  });
  drawLabelValue(doc, 'Teléfono', customer.phone, PAGE.margin + 310, y + 76, 62, 130, {
    size: 6.3,
    ellipsis: false
  });

  if (invoice.notes) {
    drawLabelValue(doc, 'Observación', invoice.notes, PAGE.margin + 310, y + 91, 62, 165, {
      size: 6.2,
      height: 13,
      ellipsis: false
    });
  }

  return y + 116;
};

const getTableColumns = (invoice) => {
  const isConsumerFinal = invoice.documentTypeCode === '01';

  if (companyUsesFuelTaxes(invoice)) {
    return [
      { key: 'quantity', title: 'Cant.', w: 36, align: 'right' },
      {
        key: 'description',
        title: 'Descripción',
        w: isConsumerFinal ? 197 : 155,
        align: 'left'
      },
      { key: 'unitPrice', title: 'Valor unit.', w: 50, align: 'right' },
      { key: 'noSuj', title: 'No suj.', w: 44, align: 'right' },
      { key: 'exenta', title: 'Exenta', w: 44, align: 'right' },
      { key: 'gravada', title: 'Afecta', w: 50, align: 'right' },
      ...(!isConsumerFinal
        ? [{ key: 'iva', title: 'IVA', w: 42, align: 'right' }]
        : []),
      { key: 'fovial', title: 'FOVIAL', w: 42, align: 'right' },
      { key: 'cotrans', title: 'COTRANS', w: 44, align: 'right' },
      { key: 'total', title: 'Total', w: 57, align: 'right' }
    ];
  }

  return [
    { key: 'quantity', title: 'Cant.', w: 42, align: 'right' },
    {
      key: 'description',
      title: 'Descripción',
      w: isConsumerFinal ? 245 : 207,
      align: 'left'
    },
    { key: 'unitPrice', title: 'Valor unit.', w: 58, align: 'right' },
    { key: 'noSuj', title: 'No sujetas', w: 58, align: 'right' },
    { key: 'exenta', title: 'Exentas', w: 58, align: 'right' },
    { key: 'gravada', title: 'Afectas', w: 62, align: 'right' },
    ...(!isConsumerFinal
      ? [{ key: 'iva', title: 'IVA', w: 38, align: 'right' }]
      : []),
    { key: 'total', title: 'Total', w: 41, align: 'right' }
  ];
};

const getItemDescriptionForPdf = (item) => {
  const productName = safe(item?.product?.name);
  const description = safe(item?.description);

  if (productName && description) {
    return `${productName} - ${description}`;
  }

  return productName || description;
};

const getItemValue = (item, key) => {
  if (key === 'quantity') return quantity(item.quantity);
  if (key === 'description') return getItemDescriptionForPdf(item);
  if (key === 'quantity') return quantity(item.quantity);
  if (key === 'description') return `${safe(item.code)} ${safe(item.description)}`.trim();
  if (key === 'unitPrice') return quantity(item.unitPrice);
  if (key === 'noSuj') return money(item.noSuj);
  if (key === 'exenta') return money(item.exenta);
  if (key === 'gravada') return money(item.gravada);
  if (key === 'iva') return money(item.iva);
  if (key === 'fovial') return money(item.fovial);
  if (key === 'cotrans') return money(item.cotrans);
  if (key === 'total') return money(item.total);

  return '';
};

const drawTableHeader = (doc, invoice, y) => {
  const columns = getTableColumns(invoice);
  const x = PAGE.margin;

  drawBox(doc, x, y, PAGE.contentWidth, 24, {
    fill: COLORS.soft
  });

  let cursorX = x;

  columns.forEach((column) => {
    drawText(doc, column.title.toUpperCase(), cursorX + 3, y + 7, {
      width: column.w - 6,
      align: column.align,
      size: 5.9,
      bold: true,
      height: 12
    });

    cursorX += column.w;
  });

  return y + 24;
};

const drawItemsTable = (doc, invoice, startY) => {
  const columns = getTableColumns(invoice);
  let y = ensureSpace(doc, invoice, startY, 55);

  y = drawTableHeader(doc, invoice, y);

  (invoice.items || []).forEach((item) => {
    const descriptionColumn = columns.find((column) => column.key === 'description');
    const description = getItemValue(item, 'description');

    doc.font('Helvetica').fontSize(6.4);
    const descHeight = doc.heightOfString(description, {
      width: descriptionColumn.w - 6
    });

    const rowHeight = Math.max(30, Math.min(68, descHeight + 12));

    y = ensureSpace(doc, invoice, y, rowHeight + 10);

    if (y === PAGE.margin) {
      y = drawTableHeader(doc, invoice, y);
    }

    drawBox(doc, PAGE.margin, y, PAGE.contentWidth, rowHeight, {
      stroke: COLORS.lightBorder,
      fill: '#ffffff'
    });

    let cellX = PAGE.margin;

    columns.forEach((column) => {
      drawText(doc, getItemValue(item, column.key), cellX + 3, y + 7, {
        width: column.w - 6,
        height: rowHeight - 10,
        align: column.align,
        size: column.key === 'description' ? 6.5 : 6.1,
        bold: column.key === 'description',
        ellipsis: column.key !== 'description'
      });

      cellX += column.w;
    });

    y += rowHeight;
  });

  return y + 8;
};

const drawTotals = (doc, invoice, y) => {
  y = ensureSpace(doc, invoice, y, 138);

  const leftX = PAGE.margin;
  const rightX = PAGE.margin + 344;

  drawBox(doc, leftX, y, 330, 126);
  drawBox(doc, rightX, y, 220, 126);

  drawText(doc, 'CANTIDAD EN LETRAS:', leftX + 10, y + 10, {
    width: 250,
    size: 7.2,
    bold: true
  });

  drawText(doc, amountToSpanishWords(invoice.total), leftX + 10, y + 27, {
    width: 306,
    size: 7.2,
    height: 32,
    ellipsis: false
  });

  if (invoice.notes) {
    drawText(doc, 'OBSERVACIONES:', leftX + 10, y + 68, {
      width: 250,
      size: 7.2,
      bold: true
    });

    drawText(doc, invoice.notes, leftX + 10, y + 84, {
      width: 306,
      size: 6.8,
      height: 30,
      ellipsis: false
    });
  }

  const usesFuelTaxes = companyUsesFuelTaxes(invoice);
  const isConsumerFinal = invoice.documentTypeCode === '01';

  const rows = [
    ['Ventas no sujetas', invoice.noSuj],
    ['Ventas exentas', invoice.exenta],
    ['Ventas afectas', invoice.gravada],
    [
      'SUMAS',
      Number(invoice.noSuj || 0)
        + Number(invoice.exenta || 0)
        + Number(invoice.gravada || 0)
    ],
    ...(!isConsumerFinal
      ? [['13% de IVA', invoice.iva]]
      : []),
    ['Sub-Total', invoice.subtotal],
    ...(!isConsumerFinal
      ? [['(-) IVA Retenido', Number(invoice.retention1 || 0) * -1]]
      : []),
    ...(usesFuelTaxes ? [
      ['(+) FOVIAL', invoice.fovial],
      ['(+) COTRANS', invoice.cotrans]
    ] : []),
    ['Venta Total', invoice.total]
  ];

  let rowY = y + 8;

  rows.forEach(([label, value]) => {
    if (Number(value || 0) === 0 && !['Ventas no sujetas', 'Ventas exentas', 'Ventas afectas', 'SUMAS', 'Sub-Total', 'Venta Total'].includes(label)) {
      return;
    }

    drawText(doc, label, rightX + 10, rowY, {
      width: 120,
      size: label === 'Venta Total' ? 7.6 : 6.8,
      bold: label === 'Venta Total'
    });

    drawText(doc, money(Math.abs(value)), rightX + 130, rowY, {
      width: 78,
      align: 'right',
      size: label === 'Venta Total' ? 7.6 : 6.8,
      bold: true,
      color: Number(value) < 0 ? COLORS.danger : COLORS.dark
    });

    rowY += 12;
  });

  return y + 136;
};

const buildDocumentPdf = async (invoice) => {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'portrait',
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: invoice.controlNumber,
      Author: `${APP_NAME} - ${APP_COMPANY_NAME}`,
      Subject: invoice.documentTypeName
    }
  });

  let y = await drawHeader(doc, invoice);
  y = drawTechnicalInfo(doc, invoice, y);
  y = drawReceiverAndSaleInfo(doc, invoice, y);
  y = drawItemsTable(doc, invoice, y);
  y = drawTotals(doc, invoice, y);

  drawFooter(doc, invoice);
  drawWatermarkOnAllPages(doc, invoice.status);

  return getPdfBuffer(doc);
};

const buildInvalidationPdf = async (invoice) => {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'portrait',
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: `ANULACION-${invoice.controlNumber}`,
      Author: `${APP_NAME} - ${APP_COMPANY_NAME}`,
      Subject: 'Evento de anulación'
    }
  });

  drawText(doc, 'COMPROBANTE DE ANULACIÓN DE DTE', PAGE.margin, 36, {
    width: PAGE.contentWidth,
    align: 'center',
    size: 15,
    bold: true,
    color: COLORS.slate
  });

  const qrUrl = buildPublicQueryUrl({
    invoice,
    generationCode: invoice.invalidationGenerationCode || invoice.generationCode,
    issuedAt: invoice.invalidatedAt || invoice.issuedAt
  });

  const qrBuffer = await buildQrBuffer(qrUrl);

  drawBox(doc, 430, 78, 112, 112);
  doc.image(qrBuffer, 442, 90, {
    width: 88,
    height: 88
  });

  drawBox(doc, PAGE.margin, 78, 390, 112, {
    fill: COLORS.soft
  });

  drawLabelValue(doc, 'Documento anulado', formatIdentifier(invoice.controlNumber, 32), 42, 98, 105, 235, {
    size: 7,
    ellipsis: false,
    height: 16
  });
  drawLabelValue(doc, 'Código generación DTE', formatIdentifier(invoice.generationCode, 32), 42, 122, 105, 235, {
    size: 7,
    ellipsis: false,
    height: 16
  });
  drawLabelValue(doc, 'Código anulación', formatIdentifier(invoice.invalidationGenerationCode, 32), 42, 146, 105, 235, {
    size: 7,
    ellipsis: false,
    height: 16
  });
  drawLabelValue(doc, 'Sello anulación', formatIdentifier(invoice.invalidationReceptionSeal, 32), 42, 170, 105, 235, {
    size: 7,
    ellipsis: false,
    height: 16
  });

  drawBox(doc, PAGE.margin, 214, PAGE.contentWidth, 110);

  drawText(doc, 'MOTIVO DE ANULACIÓN', 42, 234, {
    width: 520,
    size: 10,
    bold: true
  });

  drawText(doc, safe(invoice.invalidationReason, 'Sin motivo registrado'), 42, 256, {
    width: 520,
    size: 8.5,
    height: 44,
    ellipsis: false
  });

  drawBox(doc, PAGE.margin, 350, PAGE.contentWidth, 110);

  drawText(doc, 'DATOS GENERALES', 42, 370, {
    width: 520,
    size: 10,
    bold: true
  });

  drawLabelValue(doc, 'Emisor', invoice.company?.legalName, 42, 394, 70, 220, {
    size: 7,
    ellipsis: false
  });
  drawLabelValue(doc, 'NIT emisor', invoice.company?.nit, 42, 416, 70, 150, { size: 7 });
  drawLabelValue(doc, 'Receptor', invoice.customer?.name, 310, 394, 70, 170, {
    size: 7,
    ellipsis: false
  });
  drawLabelValue(doc, 'Doc. receptor', invoice.customer?.documentNumber, 310, 416, 70, 170, { size: 7 });
  drawLabelValue(doc, 'Fecha anulación', formatDateTime(invoice.invalidatedAt), 42, 438, 90, 150, { size: 7 });

drawFooter(doc, invoice);
drawWatermarkOnAllPages(doc, 'ANULADO');

return getPdfBuffer(doc);
};

const getDtePdfByInvoiceId = async ({ id, user, type = 'document' }) => {
  const invoice = await invoicesService.getInvoiceById(id, {
    user
  });

  if (type === 'invalidation') {
    if (invoice.status !== 'ANULADO') {
      const error = new Error('Solo se puede generar PDF de anulación para documentos anulados');
      error.statusCode = 400;
      throw error;
    }

    const buffer = await buildInvalidationPdf(invoice);

    return {
      buffer,
      fileName: cleanFileName(`ANULACION-${invoice.controlNumber}.pdf`)
    };
  }

  const buffer = await buildDocumentPdf(invoice);

  return {
    buffer,
    fileName: cleanFileName(`${invoice.controlNumber}.pdf`)
  };
};

module.exports = {
  getDtePdfByInvoiceId
};