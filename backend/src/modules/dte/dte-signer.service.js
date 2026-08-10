const companyCredentialsService = require('../companies/company-credentials.service');

const cleanDigits = (value) => String(value || '').replace(/\D/g, '');

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
  const cleanNit = cleanDigits(nit || company?.nit);
  if (!cleanNit) {
    const error = new Error('El NIT del emisor es obligatorio para firmar el DTE');
    error.statusCode = 400;
    throw error;
  }
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
      body: JSON.stringify({ nit: cleanNit, activo: true, passwordPri: config.privateKeyPassword, dteJson }),
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
    const error = new Error(`No se pudo firmar el DTE: ${parseSignerErrorMessage(data?.body || data)}`);
    error.statusCode = 502;
    error.signerResponse = data;
    throw error;
  }
  return { signedJws: data.body, signerResponse: data };
};

const checkSignerStatus = async () => {
  const signerUrl = (process.env.SIGNER_URL || 'http://svfe-api-firmador:8113').replace(/\/+$/, '');
  const response = await fetch(`${signerUrl}/firmardocumento/status`);
  const text = await response.text();
  return { ok: response.ok, status: response.status, message: text };
};

module.exports = { signDteJson, checkSignerStatus };
