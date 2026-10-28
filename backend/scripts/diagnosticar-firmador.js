'use strict';
const { isDeepStrictEqual } = require('node:util');

async function diagnose({ company, invoice, builder, signer, auth, checkHacienda = false, log = console.log }) {
  if (!company || !invoice || Number(invoice.companyId) !== Number(company.id)) throw Error('El DTE no pertenece al contribuyente solicitado.');
  const document = builder.buildOfficialStandardDteJson(invoice);
  const issuer = String(document.emisor?.nit || document.emisor?.numDocumento || '').replace(/\D/g, '');
  const nit = String(company.nit || '').replace(/\D/g, '');
  if (issuer !== nit) throw Error('El emisor del JSON no coincide con el contribuyente.');
  if (document.identificacion?.ambiente !== (company.environment === 'PRODUCTION' ? '01' : '00')) throw Error('El ambiente del DTE no coincide con el contribuyente.');
  log(`Contribuyente: ${company.id} | Ambiente: ${company.environment} | DTE de referencia: ${invoice.id}`);
  log('Validando y firmando una copia del JSON. No se guarda ni se transmite el DTE.');
  const { signedJws } = await signer.signDteJson({ company, nit, dteJson: document });
  const parts = typeof signedJws === 'string' ? signedJws.split('.') : [];
  if (parts.length !== 3 || !parts.every(Boolean)) throw Error('El firmador no devolvio un JWS con tres segmentos.');
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw Error('El contenido del JWS no es un JSON legible.'); }
  if (!isDeepStrictEqual(payload, document)) throw Error('El contenido firmado no coincide con el JSON solicitado.');
  log('OK: el firmador devolvio un JWS y su contenido coincide.');
  if (checkHacienda) {
    const result = await auth.getHaciendaAuthorization({ company, forceRefresh: true });
    if (!result?.token) throw Error('Hacienda no devolvio token.');
    log('OK: autenticacion con Hacienda. El token no se muestra.');
  }
  log('Esta prueba no confirma recepcion fiscal ni sello de Hacienda; no se ha enviado ningun DTE.');
  return { signed: true, authenticated: checkHacienda };
}
async function main() {
  const loadModels = require('../src/config/models');
  const { sequelize } = require('../src/config/database');
  try {
    sequelize.options.logging = false;
    const { Company, Invoice } = loadModels();
    const nit = String(process.env.TEST_NIT || '').replace(/\D/g, '');
    if (![9,14].includes(nit.length)) throw Error('Indique TEST_NIT con NIT de 14 digitos o DUI de 9.');
    const company = await Company.findOne({ where: { nit } });
    if (!company) throw Error('No existe el contribuyente solicitado.');
    const requested = process.env.TEST_INVOICE_ID;
    if (requested && !/^\d+$/.test(requested)) throw Error('TEST_INVOICE_ID debe ser numerico.');
    const row = await Invoice.findOne({where:{companyId:company.id,...(requested?{id:Number(requested)}:{})},order:[['id','DESC']]});
    if (!row) throw Error('No hay DTE de referencia. Genere un borrador valido para este contribuyente o indique TEST_INVOICE_ID.');
    const invoice = await require('../src/modules/invoices/invoices.service').getInvoiceById(row.id);
    await diagnose({company,invoice,builder:require('../src/modules/dte/dte-json.service'),signer:require('../src/modules/dte/dte-signer.service'),auth:require('../src/modules/dte/dte-hacienda-auth.service'),checkHacienda:process.env.TEST_HACIENDA_AUTH==='true'});
  } finally { await sequelize.close(); }
}
if (require.main === module) main().catch(error => {
  console.error('DIAGNOSTICO FALLIDO:', String(error.message).slice(0,1000));
  if (error.validationErrors) console.error('Campos:', error.validationErrors.map(e=>e.campo).join(', '));
  process.exitCode = 1;
});
module.exports = { diagnose };
