export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Facturación C&M';

export const APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE
  || '';

export const APP_COMPANY_NAME = import.meta.env.VITE_APP_COMPANY_NAME
  || 'C&M Soluciones Tecnológicas';

export const PDF_FOOTER_TEXT = import.meta.env.VITE_PDF_FOOTER_TEXT
  || `Representación gráfica generada por ${APP_NAME}, desarrollado por ${APP_COMPANY_NAME}.`;