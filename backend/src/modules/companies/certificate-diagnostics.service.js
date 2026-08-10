const crypto = require('crypto');

const companyCredentialsService = require('./company-credentials.service');

const cleanDigits = (value) => String(value || '').replace(/\D/g, '');

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const getFileIdentifier = (fileName) => {
  const baseName = String(fileName || '').split(/[\\/]/).pop()?.trim() || '';
  if (!/\.crt$/i.test(baseName)) return null;
  return cleanDigits(baseName.replace(/\.crt$/i, '')) || null;
};

const extractCertificateIdentifier = (certificateText) => {
  const match = String(certificateText || '').match(/<nit\b[^>]*>\s*([^<]+?)\s*<\/nit>/i);
  return cleanDigits(match?.[1]) || null;
};

const extractPrivateKeyHash = (certificateText) => {
  const privateKeyBlock = String(certificateText || '').match(/<privateKey\b[^>]*>([\s\S]*?)<\/privateKey>/i)?.[1];
  if (!privateKeyBlock) return null;

  const clave = privateKeyBlock.match(/<clave\b[^>]*>\s*([^<]+?)\s*<\/clave>/i)?.[1];
  return normalizeText(clave)?.toLowerCase() || null;
};

const extractCertificateActive = (certificateText) => {
  const match = String(certificateText || '').match(/<activo\b[^>]*>\s*([^<]+?)\s*<\/activo>/i);
  if (!match) return null;
  return String(match[1]).trim().toLowerCase() === 'true';
};

const safeHashEquals = (left, right) => {
  if (!left || !right || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
  } catch {
    return false;
  }
};

const diagnoseCompanyCertificate = async ({ company, data = {} }) => {
  if (!company?.id) {
    const error = new Error('Contribuyente no disponible para validar el certificado');
    error.statusCode = 400;
    throw error;
  }

  const certificateText = normalizeText(data.certificateText);
  if (!certificateText) {
    const error = new Error('Seleccione el archivo .crt que desea validar');
    error.statusCode = 400;
    throw error;
  }

  if (Buffer.byteLength(certificateText, 'utf8') > 1024 * 1024) {
    const error = new Error('El archivo .crt supera el tamaño máximo permitido para diagnóstico (1 MB)');
    error.statusCode = 400;
    throw error;
  }

  if (!/<CertificadoMH\b/i.test(certificateText)) {
    const error = new Error('El archivo seleccionado no tiene la estructura esperada de un CertificadoMH');
    error.statusCode = 400;
    throw error;
  }

  const runtimeCredentials = await companyCredentialsService.getRuntimeCompanyCredentials(company);
  const password = normalizeText(data.signerPrivateKeyPassword) || runtimeCredentials.signerPrivateKeyPassword;
  const certificateIdentifier = extractCertificateIdentifier(certificateText);
  const companyIdentifier = cleanDigits(company.nit);
  const configuredFileName = normalizeText(data.certificateFileName) || runtimeCredentials.certificateFileName;
  const fileIdentifier = getFileIdentifier(configuredFileName);
  const privateKeyHash = extractPrivateKeyHash(certificateText);
  const certificateActive = extractCertificateActive(certificateText);

  if (!certificateIdentifier) {
    const error = new Error('No se pudo leer el NIT/DUI interno del certificado');
    error.statusCode = 400;
    throw error;
  }

  if (!privateKeyHash) {
    const error = new Error('No se pudo leer la huella de la llave privada dentro del certificado');
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = password
    ? crypto.createHash('sha512').update(password, 'utf8').digest('hex').toLowerCase()
    : null;

  const passwordMatches = passwordHash ? safeHashEquals(passwordHash, privateKeyHash) : false;
  const companyIdentifierMatches = Boolean(companyIdentifier && certificateIdentifier === companyIdentifier);
  const fileIdentifierMatches = Boolean(fileIdentifier && certificateIdentifier === fileIdentifier);
  const recommendedFileName = `${certificateIdentifier}.crt`;

  const warnings = [];
  if (!companyIdentifierMatches) {
    warnings.push(`El certificado pertenece a ${certificateIdentifier}, pero el contribuyente está configurado como ${companyIdentifier || 'sin identificador'}.`);
  }
  if (!fileIdentifierMatches) {
    warnings.push(`El firmador buscará ${recommendedFileName}; el nombre configurado actualmente es ${configuredFileName || 'ninguno'}.`);
  }
  if (!password) {
    warnings.push('No hay una contraseña privada configurada para poder compararla con el certificado.');
  } else if (!passwordMatches) {
    warnings.push('La contraseña privada configurada NO coincide criptográficamente con la llave privada de este certificado.');
  }
  if (certificateActive === false) {
    warnings.push('El certificado está marcado como inactivo.');
  }

  const ok = companyIdentifierMatches && fileIdentifierMatches && passwordMatches && certificateActive !== false;

  return {
    ok,
    certificateIdentifier,
    companyIdentifier,
    fileIdentifier,
    configuredFileName: configuredFileName || null,
    recommendedFileName,
    certificateActive,
    passwordConfigured: Boolean(password),
    passwordMatches,
    companyIdentifierMatches,
    fileIdentifierMatches,
    identifierType: certificateIdentifier.length === 9 ? 'DUI' : certificateIdentifier.length === 14 ? 'NIT' : 'OTRO',
    warnings,
    message: ok
      ? 'El certificado, su NIT/DUI, nombre de archivo y contraseña privada son compatibles con el firmador.'
      : 'El certificado tiene inconsistencias que deben corregirse antes de firmar DTE.'
  };
};

module.exports = {
  diagnoseCompanyCertificate,
  extractCertificateIdentifier,
  extractPrivateKeyHash,
  getFileIdentifier
};
