const companyCredentialsService = require('../companies/company-credentials.service');

const cleanDigits = (value) => String(value || '').replace(/\D/g, '');

const getCertificateIdentifier = (certificateFileName) => {
  const fileName = String(certificateFileName || '').split(/[\\/]/).pop()?.trim();
  if (!fileName || !/\.crt$/i.test(fileName)) return null;
  return cleanDigits(fileName.replace(/\.crt$/i, '')) || null;
};

const getSignerTimeoutMs = () => {
  const value = Number(process.env.SIGNER_TIMEOUT_MS || process.env.MH_TIMEOUT_MS || 30000);
  return Number.isFinite(value) && value > 0 ? value : 30000;
};

const getSignerConfig = async (company) => {
  const enabled = String(process.env.SIGNER_ENABLED || 'false').toLowerCase() === 'true';
  const signerUrl = process.env.SIGNER_URL || 'http://svfe-api-firmador:8113';
  if (!enabled) {
    const error = new Error('El firmador no está habilitado. Configure SIGNER_ENABLED=true');
    error.statusCode = 500;
    throw error;
  }
  if (!company?.id) {
    const error = new Error('No se pudo determinar el contribuyente para firmar el DTE');
    error.statusCode = 500;
    throw error;
  }

  const credentials = await companyCredentialsService.getRuntimeCompanyCredentials(company);
  if (!credentials.signerPrivateKeyPassword) {
    const error = new Error('El contribuyente activo no tiene configurada la contraseña privada de su certificado');
    error.statusCode = 500;
    throw error;
  }

  return {
    signerUrl: signerUrl.replace(/\/+$/, ''),
    privateKeyPassword: credentials.signerPrivateKeyPassword,
    certificateFileName: credentials.certificateFileName
  };
};

const parseSignerErrorMessage = (body) => {
  if (!body) return 'Error desconocido del firmador';
  if (typeof body === 'string') return body;
  if (body.mensaje) return body.mensaje;
  try { return JSON.stringify(body); } catch { return 'Error desconocido del firmador'; }
};

const signDteJson = async ({ company, nit, dteJson }) => {
  const config = await getSignerConfig(company);
  const companyIdentifier = cleanDigits(company?.nit);
  const requestedIdentifier = cleanDigits(nit);
  const certificateIdentifier = getCertificateIdentifier(config.certificateFileName);

  if (!companyIdentifier) {
    const error = new Error('El NIT o DUI del emisor es obligatorio para firmar el DTE');
    error.statusCode = 400;
    throw error;
  }

  if (![9, 14].includes(companyIdentifier.length)) {
    const error = new Error(`El identificador fiscal del emisor debe ser DUI de 9 dígitos o NIT de 14 dígitos. Valor recibido: ${companyIdentifier}`);
    error.statusCode = 400;
    throw error;
  }

  if (requestedIdentifier && requestedIdentifier !== companyIdentifier) {
    const error = new Error(`El identificador solicitado para firmar (${requestedIdentifier}) no coincide con el NIT/DUI del contribuyente (${companyIdentifier})`);
    error.statusCode = 400;
    throw error;
  }

  if (certificateIdentifier && certificateIdentifier !== companyIdentifier) {
    const error = new Error(
      `El certificado configurado (${config.certificateFileName}) pertenece a ${certificateIdentifier}, ` +
      `pero el contribuyente está registrado como ${companyIdentifier}.`
    );
    error.statusCode = 400;
    error.signerDiagnostics = { companyIdentifier, certificateIdentifier, certificateFileName: config.certificateFileName };
    throw error;
  }

  // El firmador busca literalmente /uploads/<nit>.crt. Para personas naturales
  // el identificador puede ser el DUI de 9 dígitos; usamos primero el nombre
  // del certificado configurado para que archivo y payload siempre coincidan.
  const signerIdentifier = certificateIdentifier || companyIdentifier;
  if (!dteJson || typeof dteJson !== 'object') {
    const error = new Error('El JSON del DTE es obligatorio para firmar');
    error.statusCode = 400;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getSignerTimeoutMs());
  let response;

  try {
    response = await fetch(`${config.signerUrl}/firmardocumento/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nit: signerIdentifier, activo: true, passwordPri: config.privateKeyPassword, dteJson }),
      signal: controller.signal
    });
  } catch (error) {
    const signerError = new Error(error.name === 'AbortError'
      ? 'Tiempo de espera agotado al comunicarse con el firmador'
      : `No fue posible comunicarse con el firmador: ${error.message}`);
    signerError.statusCode = 502;
    throw signerError;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`El firmador respondió con error HTTP ${response.status}`);
    error.statusCode = 502;
    error.signerResponse = data;
    throw error;
  }
  if (!data || data.status !== 'OK' || !data.body) {
    const code = String(data?.body?.codigo ?? data?.codigo ?? '').trim();
    let message = `No se pudo firmar el DTE: ${parseSignerErrorMessage(data?.body || data)}`;

    if (code === '803') {
      message =
        `El firmador leyó el certificado ${signerIdentifier}.crt, pero la clave privada enviada no coincide con la llave privada del archivo. ` +
        'En esta versión del firmador el código 803 se muestra como “No existe llave publica para este nit”, aunque también se produce cuando passwordPri no coincide.';
    } else if (code === '812') {
      message = `El firmador no encontró /uploads/${signerIdentifier}.crt. Verifique el nombre y el volumen persistente.`;
    }

    const error = new Error(message);
    error.statusCode = 502;
    error.signerResponse = data;
    error.signerDiagnostics = {
      companyId: company.id,
      companyIdentifier,
      requestedIdentifier: requestedIdentifier || null,
      signerIdentifier,
      certificateFileName: config.certificateFileName || null,
      signerCode: code || null
    };
    throw error;
  }
  return { signedJws: data.body, signerResponse: data, signerIdentifier };
};

const checkSignerStatus = async () => {
  const signerUrl = (process.env.SIGNER_URL || 'http://svfe-api-firmador:8113').replace(/\/+$/, '');
  const response = await fetch(`${signerUrl}/firmardocumento/status`);
  const text = await response.text();
  return { ok: response.ok, status: response.status, message: text };
};

module.exports = { signDteJson, checkSignerStatus, getCertificateIdentifier };
