const nodemailer = require('nodemailer');

const invoicesService = require('../invoices/invoices.service');
const dtePdfService = require('../dte/dte-pdf.service');
const dteJsonService = require('../dte/dte-json.service');
const EmailLog = require('./email-log.model');

const sanitizeFileName = (value) => {
  return String(value || 'documento')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_');
};

const escapeHtml = (value) => {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

const getUserId = (user) => {
  return user?.id || user?.sub || null;
};

const getSenderUsername = (user) => {
  return user?.username || user?.email || user?.name || null;
};

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromName = process.env.SMTP_FROM_NAME || 'Facturación Electrónica';
  const fromEmail = process.env.SMTP_FROM_EMAIL || user;

  if (!host || !user || !pass || !fromEmail) {
    const error = new Error(
      'No se ha configurado SMTP correctamente. Revise SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM_EMAIL en el archivo .env'
    );
    error.statusCode = 500;
    throw error;
  }

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass
    },
    fromName,
    fromEmail
  };
};

const createTransporter = () => {
  const config = getSmtpConfig();

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    tls: {
      rejectUnauthorized: false
    }
  });
};

const getJsonFileName = ({ invoice, type = 'document' }) => {
  if (type === 'invalidation') {
    return sanitizeFileName(`ANULACION-${invoice.controlNumber}.json`);
  }

  return sanitizeFileName(`${invoice.controlNumber}.json`);
};

const buildDocumentAttachments = async ({ invoice, user }) => {
  const attachments = [];

  const documentPdf = await dtePdfService.getDtePdfByInvoiceId({
    id: invoice.id,
    user,
    type: 'document'
  });

  const documentJson = await dteJsonService.getDteJsonByInvoiceId({
    id: invoice.id,
    user,
    type: 'document'
  });

  attachments.push({
    filename: documentPdf.fileName,
    content: documentPdf.buffer,
    contentType: 'application/pdf'
  });

  attachments.push({
    filename: getJsonFileName({
      invoice,
      type: 'document'
    }),
    content: Buffer.from(JSON.stringify(documentJson, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  if (invoice.status === 'ANULADO') {
    const invalidationPdf = await dtePdfService.getDtePdfByInvoiceId({
      id: invoice.id,
      user,
      type: 'invalidation'
    });

    const invalidationJson = await dteJsonService.getDteJsonByInvoiceId({
      id: invoice.id,
      user,
      type: 'invalidation'
    });

    attachments.push({
      filename: invalidationPdf.fileName,
      content: invalidationPdf.buffer,
      contentType: 'application/pdf'
    });

    attachments.push({
      filename: getJsonFileName({
        invoice,
        type: 'invalidation'
      }),
      content: Buffer.from(JSON.stringify(invalidationJson, null, 2), 'utf8'),
      contentType: 'application/json'
    });
  }

  return attachments;
};

const getDefaultSubject = (invoice) => {
  if (invoice.status === 'ANULADO') {
    return `Anulación de DTE ${invoice.controlNumber}`;
  }

  return `Documento Tributario Electrónico ${invoice.controlNumber}`;
};

const getDefaultMessage = (invoice) => {
  const companyName = invoice.company?.commercialName || invoice.company?.legalName || 'la empresa emisora';

  if (invoice.status === 'ANULADO') {
    return `Estimado(a), se remite la documentación correspondiente a la anulación del DTE ${invoice.controlNumber}, emitido por ${companyName}.`;
  }

  return `Estimado(a), se remite el Documento Tributario Electrónico ${invoice.controlNumber}, emitido por ${companyName}.`;
};

const buildPlainText = ({ invoice, message }) => {
  const lines = [
    message,
    '',
    `Documento: ${invoice.controlNumber}`,
    `Código de generación: ${invoice.generationCode}`,
    `Tipo: ${invoice.documentTypeName}`,
    `Estado: ${invoice.status}`,
    `Total: $${Number(invoice.total || 0).toFixed(2)}`
  ];

  if (invoice.receptionSeal) {
    lines.push(`Sello de recepción: ${invoice.receptionSeal}`);
  }

  if (invoice.status === 'ANULADO') {
    lines.push('');
    lines.push('Información de anulación:');

    if (invoice.invalidationReason) {
      lines.push(`Motivo: ${invoice.invalidationReason}`);
    }

    if (invoice.invalidationGenerationCode) {
      lines.push(`Código de generación de anulación: ${invoice.invalidationGenerationCode}`);
    }

    if (invoice.invalidationReceptionSeal) {
      lines.push(`Sello de anulación: ${invoice.invalidationReceptionSeal}`);
    }
  }

  lines.push('');
  lines.push('Se adjuntan los archivos PDF y JSON correspondientes.');
  lines.push('');
  lines.push('Este correo fue generado automáticamente por el sistema de facturación electrónica.');

  return lines.join('\n');
};

const buildHtml = ({ invoice, message, attachments }) => {
  const customerName = invoice.customer?.name || 'Cliente';
  const companyName = invoice.company?.commercialName || invoice.company?.legalName || 'Empresa emisora';

  const attachmentList = attachments
    .map((attachment) => `<li>${escapeHtml(attachment.filename)}</li>`)
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2 style="margin: 0 0 12px 0;">${escapeHtml(companyName)}</h2>

      <p>Estimado(a) <strong>${escapeHtml(customerName)}</strong>,</p>

      <p>${escapeHtml(message)}</p>

      <table style="border-collapse: collapse; width: 100%; max-width: 680px; margin-top: 16px;">
        <tbody>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">Documento</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${escapeHtml(invoice.controlNumber)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">Código de generación</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${escapeHtml(invoice.generationCode)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">Tipo</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${escapeHtml(invoice.documentTypeName)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">Estado</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">${escapeHtml(invoice.status)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">Total</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">$${Number(invoice.total || 0).toFixed(2)}</td>
          </tr>
          ${
            invoice.receptionSeal
              ? `
                <tr>
                  <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">Sello de recepción</td>
                  <td style="border: 1px solid #d1d5db; padding: 8px;">${escapeHtml(invoice.receptionSeal)}</td>
                </tr>
              `
              : ''
          }
        </tbody>
      </table>

      ${
        invoice.status === 'ANULADO'
          ? `
            <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 12px; margin-top: 16px; max-width: 680px;">
              <p style="margin: 0 0 8px 0; font-weight: bold;">Información de anulación</p>
              <p style="margin: 0;"><strong>Motivo:</strong> ${escapeHtml(invoice.invalidationReason || 'Sin motivo registrado')}</p>
              <p style="margin: 4px 0 0 0;"><strong>Código de anulación:</strong> ${escapeHtml(invoice.invalidationGenerationCode || '-')}</p>
              <p style="margin: 4px 0 0 0;"><strong>Sello de anulación:</strong> ${escapeHtml(invoice.invalidationReceptionSeal || '-')}</p>
            </div>
          `
          : ''
      }

      <p style="margin-top: 16px;">Se adjuntan los siguientes archivos:</p>
      <ul>
        ${attachmentList}
      </ul>

      <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
        Este correo fue generado automáticamente por el sistema de facturación electrónica.
      </p>
    </div>
  `;
};

const validateInvoiceStatusForEmail = (invoice) => {
  if (!['ACEPTADO', 'ANULADO'].includes(invoice.status)) {
    const error = new Error('Solo se pueden enviar por correo documentos ACEPTADOS o ANULADOS');
    error.statusCode = 400;
    throw error;
  }
};

const normalizeRecipients = (to) => {
  const source = Array.isArray(to)
    ? to
    : String(to || '')
      .split(/[;,]/g);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = [...new Set(
    source
      .map((email) => String(email || '').trim())
      .filter(Boolean)
  )];

  if (recipients.length === 0) {
    const error = new Error('Debe indicar el correo destinatario');
    error.statusCode = 400;
    throw error;
  }

  const invalidEmail = recipients.find((email) => !emailRegex.test(email));

  if (invalidEmail) {
    const error = new Error(`El correo destinatario no tiene un formato válido: ${invalidEmail}`);
    error.statusCode = 400;
    throw error;
  }

  return recipients;
};

const createEmailLog = async ({
  invoice,
  user,
  recipient,
  subject,
  message,
  status,
  providerMessageId = null,
  errorMessage = null,
  attachments = []
}) => {
  return EmailLog.create({
    invoiceId: invoice.id,
    userId: getUserId(user),
    senderUsername: getSenderUsername(user),
    toEmail: recipient,
    subject,
    message,
    status,
    providerMessageId,
    errorMessage,
    attachmentsJson: attachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType
    })),
    sentAt: status === 'ENVIADO' ? new Date() : null
  });
};

const sendInvoiceEmail = async ({ id, user, to, subject, message }) => {
  const invoice = await invoicesService.getInvoiceById(id, {
    user
  });

  validateInvoiceStatusForEmail(invoice);

  const recipients = normalizeRecipients(to || [
    invoice.customer?.email,
    invoice.customer?.secondaryEmail
  ]);
  const recipient = recipients.join(', ');

  const finalSubject = subject && String(subject).trim()
    ? String(subject).trim()
    : getDefaultSubject(invoice);

  const finalMessage = message && String(message).trim()
    ? String(message).trim()
    : getDefaultMessage(invoice);

  const attachments = await buildDocumentAttachments({
    invoice,
    user
  });

  try {
    const smtpConfig = getSmtpConfig();
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
      to: recipients,
      subject: finalSubject,
      text: buildPlainText({
        invoice,
        message: finalMessage
      }),
      html: buildHtml({
        invoice,
        message: finalMessage,
        attachments
      }),
      attachments
    };

    const result = await transporter.sendMail(mailOptions);

    await createEmailLog({
      invoice,
      user,
      recipient,
      subject: finalSubject,
      message: finalMessage,
      status: 'ENVIADO',
      providerMessageId: result.messageId,
      attachments
    });

    return {
      messageId: result.messageId,
      accepted: result.accepted || [],
      rejected: result.rejected || [],
      recipient,
      subject: finalSubject,
      attachments: attachments.map((attachment) => attachment.filename)
    };
  } catch (error) {
    await createEmailLog({
      invoice,
      user,
      recipient,
      subject: finalSubject,
      message: finalMessage,
      status: 'ERROR',
      errorMessage: error.message,
      attachments
    });

    const nextError = new Error(`No se pudo enviar el correo: ${error.message}`);
    nextError.statusCode = error.statusCode || 500;
    throw nextError;
  }
};

const listInvoiceEmailLogs = async ({ id, user }) => {
  await invoicesService.getInvoiceById(id, {
    user
  });

  const logs = await EmailLog.findAll({
    where: {
      invoiceId: id
    },
    order: [['createdAt', 'DESC']]
  });

  return logs;
};

module.exports = {
  sendInvoiceEmail,
  listInvoiceEmailLogs,
  getDefaultSubject,
  getDefaultMessage
};