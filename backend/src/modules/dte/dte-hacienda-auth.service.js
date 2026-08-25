const companyCredentialsService = require('../companies/company-credentials.service');

const cleanDigits = (value) => String(value || '').replace(/\D/g, '');
const tokenCache = new Map();

const getTimeoutMs = () => {
  const value = Number(process.env.MH_TIMEOUT_MS || 30000);
  return Number.isFinite(value) && value > 0 ? value : 30000;
};

const environmentPrefix = (company) => String(company?.environment || 'TEST').toUpperCase() === 'PRODUCTION'
  ? 'MH_PRODUCTION'
  : 'MH_TEST';

const getEnvironmentValue = (company, suffix, legacyName) => {
  return process.env[`${environmentPrefix(company)}_${suffix}`] || process.env[legacyName] || null;
};

const OFFICIAL_AUTH_URLS = {
  MH_TEST: 'https://apitest.dtes.mh.gob.sv/seguridad/auth',
  MH_PRODUCTION: 'https://api.dtes.mh.gob.sv/seguridad/auth'
};

const resolveOfficialAuthUrl = (company, configured) => {
  const prefix = environmentPrefix(company);
  const expected = OFFICIAL_AUTH_URLS[prefix];
  const value = String(configured || expected || '').trim();
  if (value !== expected) {
    const error = new Error('La URL de autenticación no coincide con el endpoint publicado en el Manual Tecnológico v2.0');
    error.statusCode = 500;
    throw error;
  }
  return expected;
};

const getHaciendaAuthConfig = async (company) => {
  if (!company?.id) {
    const error = new Error('No se pudo determinar el contribuyente para autenticar contra Hacienda');
    error.statusCode = 500;
    throw error;
  }

  const credentials = await companyCredentialsService.getRuntimeCompanyCredentials(company);
  const authUrl = resolveOfficialAuthUrl(company, getEnvironmentValue(company, 'AUTH_URL', 'MH_AUTH_URL'));
  const user = credentials.mhUser || cleanDigits(company.nit);
  const password = credentials.mhPassword;

  if (!authUrl) {
    const error = new Error(`No se ha configurado la URL de autenticación de Hacienda para ${company.environment || 'TEST'}`);
    error.statusCode = 500;
    throw error;
  }
  if (!user || !password) {
    const error = new Error('El contribuyente activo no tiene configuradas sus credenciales de Hacienda');
    error.statusCode = 500;
    throw error;
  }

  return { authUrl, user: cleanDigits(user) || user, password, timeoutMs: getTimeoutMs() };
};

const clearHaciendaAuthCache = (companyId = null) => {
  if (companyId === null || companyId === undefined) tokenCache.clear();
  else tokenCache.delete(String(companyId));
};

const parseJsonSafely = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
};

const extractToken = (data) => {
  const body = data?.body || data;
  return body?.token || body?.access_token || body?.accessToken || data?.token || data?.access_token || data?.accessToken || null;
};

const normalizeAuthorizationHeader = (token) => {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return null;
  return /^Bearer\s+/i.test(cleanToken) ? cleanToken : `Bearer ${cleanToken}`;
};

const buildAuthorizationVariants = (token) => {
  const raw = String(token || '').trim();
  if (!raw) return [];
  const stripped = raw.replace(/^Bearer\s+/i, '').trim();
  return [...new Set([stripped ? `Bearer ${stripped}` : raw, raw, stripped].filter(Boolean))];
};

const requestHaciendaToken = async (company) => {
  const config = await getHaciendaAuthConfig(company);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const form = new URLSearchParams();
  form.set('user', config.user);
  form.set('pwd', config.password);

  let response;
  let data;
  try {
    response = await fetch(config.authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': process.env.MH_USER_AGENT || 'FacturacionElectronicaSV/1.0' },
      body: form.toString(),
      signal: controller.signal
    });
    data = await parseJsonSafely(response);
  } catch (error) {
    const requestError = new Error(error.name === 'AbortError'
      ? 'Tiempo de espera agotado al autenticar contra Hacienda'
      : `No fue posible autenticar contra Hacienda: ${error.message}`);
    requestError.statusCode = 502;
    throw requestError;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = new Error(`Hacienda respondió con error HTTP ${response.status} al autenticar`);
    error.statusCode = 502;
    error.mhResponse = data;
    throw error;
  }

  const rawToken = String(extractToken(data) || '').trim();
  const authorization = normalizeAuthorizationHeader(rawToken);
  if (!authorization) {
    const error = new Error('Hacienda no devolvió token de autenticación');
    error.statusCode = 502;
    error.mhResponse = data;
    throw error;
  }

  const cached = {
    token: authorization,
    authorization,
    rawToken,
    authVariants: buildAuthorizationVariants(rawToken),
    expiresAt: Date.now() + (20 * 60 * 1000),
    rawResponse: data
  };
  tokenCache.set(String(company.id), cached);
  return cached;
};

const getHaciendaAuthorization = async ({ company, forceRefresh = false } = {}) => {
  if (!company?.id) {
    const error = new Error('El contribuyente es obligatorio para obtener autorización de Hacienda');
    error.statusCode = 500;
    throw error;
  }
  const cached = tokenCache.get(String(company.id));
  if (!forceRefresh && cached?.token && Date.now() < cached.expiresAt) return cached;
  return requestHaciendaToken(company);
};

module.exports = { getHaciendaAuthorization, clearHaciendaAuthCache, getEnvironmentValue };
