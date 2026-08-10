const APP_NAME = process.env.APP_NAME || 'Facturación C&M';

const APP_TAGLINE = process.env.APP_TAGLINE
  || '';

const APP_COMPANY_NAME = process.env.APP_COMPANY_NAME
  || 'C&M Soluciones Tecnológicas';

const PDF_FOOTER_TEXT = process.env.PDF_FOOTER_TEXT
  || `DTE emitido por ${APP_NAME}, desarrollado por ${APP_COMPANY_NAME}`;

module.exports = {
  APP_NAME,
  APP_TAGLINE,
  APP_COMPANY_NAME,
  PDF_FOOTER_TEXT
};