const crypto = require('crypto');

const CompanyCredential = require('./company-credential.model');

const CACHE_TTL_MS = Number(process.env.TENANT_CREDENTIAL_CACHE_MS || 300000);
const runtimeCache = new Map();
let developmentFallbackWarningShown = false;

const cleanDigits = (value) => String(value || '').replace(/\D/g, '');

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizePort = (value, fallback = 587) => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['true', '1', 'yes', 'si', 'sí'].includes(String(value).toLowerCase());
};

const isGlobalSmtpFallbackEnabled = () => {
  const configured = process.env.SMTP_ALLOW_GLOBAL_FALLBACK;

  if (configured !== undefined) {
    return normalizeBoolean(configured, false);
  }

  return String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';
};

const getEncryptionKey = ({ required = false } = {}) => {
  const explicitSecret = normalizeText(process.env.TENANT_SECRETS_KEY);
  const isProduction = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';

  // En producción la clave maestra debe ser explícita y estable.
  // En desarrollo local permitimos reutilizar una clave privada ya existente
  // para que el entorno de pruebas pueda registrar contribuyentes sin añadir
  // todavía variables específicas de Railway.
  const developmentFallback = !isProduction
    ? normalizeText(process.env.COOKIE_SECRET) ||
      normalizeText(process.env.JWT_REFRESH_SECRET) ||
      normalizeText(process.env.JWT_ACCESS_SECRET)
    : null;

  const secret = explicitSecret || developmentFallback;

  if (!explicitSecret && developmentFallback && !developmentFallbackWarningShown) {
    developmentFallbackWarningShown = true;
    console.warn(
      '⚠️ TENANT_SECRETS_KEY no está definida. En desarrollo local se usará una clave privada existente como respaldo para cifrar credenciales de contribuyentes.'
    );
  }

  if (!secret) {
    if (required) {
      const error = new Error(
        isProduction
          ? 'Configure TENANT_SECRETS_KEY antes de guardar credenciales de contribuyentes en producción'
          : 'Configure TENANT_SECRETS_KEY, COOKIE_SECRET o una clave JWT para guardar credenciales de contribuyentes en local'
      );
      error.statusCode = 500;
      throw error;
    }

    return null;
  }

  return crypto.createHash('sha256').update(secret, 'utf8').digest();
};

const encryptSecret = (plainValue) => {
  const normalized = normalizeText(plainValue);
  if (!normalized) return null;

  const key = getEncryptionKey({ required: true });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
};

const decryptSecret = (encryptedValue) => {
  const normalized = normalizeText(encryptedValue);
  if (!normalized) return null;

  const [version, ivBase64, tagBase64, payloadBase64] = normalized.split(':');

  if (version !== 'v1' || !ivBase64 || !tagBase64 || !payloadBase64) {
    const error = new Error('Formato de credencial cifrada no válido');
    error.statusCode = 500;
    throw error;
  }

  const key = getEncryptionKey({ required: true });
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivBase64, 'base64')
  );

  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, 'base64')),
    decipher.final()
  ]).toString('utf8');
};

const getDefaultCertificateFileName = (nit) => {
  const digits = cleanDigits(nit);
  return digits ? `${digits}.crt` : null;
};

const clearCompanyCredentialCache = (companyId = null) => {
  if (companyId === null || companyId === undefined) {
    runtimeCache.clear();
    return;
  }

  runtimeCache.delete(String(companyId));
};

const getCredentialRecord = async (companyId) => {
  if (!companyId) return null;

  return CompanyCredential.findOne({
    where: { companyId },
    attributes: [
      'id',
      'companyId',
      'mhUser',
      'mhPasswordEncrypted',
      'signerPrivateKeyPasswordEncrypted',
      'certificateFileName',
      'smtpHost',
      'smtpPort',
      'smtpSecure',
      'smtpUser',
      'smtpPasswordEncrypted',
      'smtpFromName',
      'smtpFromEmail',
      'updatedAt'
    ]
  });
};

const getPublicCredentialStatus = async (company) => {
  if (!company?.id) {
    return {
      mhUser: null,
      certificateFileName: getDefaultCertificateFileName(company?.nit),
      hasMhPassword: false,
      hasSignerPrivateKeyPassword: false
    };
  }

  const record = await getCredentialRecord(company.id);
  const legacyNit = cleanDigits(process.env.MH_USER || process.env.MH_NIT);
  const companyNit = cleanDigits(company.nit);
  const legacyMatchesCompany = Boolean(legacyNit && companyNit && legacyNit === companyNit);

  return {
    mhUser: record?.mhUser || (legacyMatchesCompany ? process.env.MH_USER || process.env.MH_NIT || null : null),
    certificateFileName: record?.certificateFileName || getDefaultCertificateFileName(company.nit),
    hasMhPassword: Boolean(record?.mhPasswordEncrypted || (legacyMatchesCompany && process.env.MH_PASSWORD)),
    hasSignerPrivateKeyPassword: Boolean(
      record?.signerPrivateKeyPasswordEncrypted ||
      (legacyMatchesCompany && process.env.SIGNER_PRIVATE_KEY_PASSWORD)
    ),
    smtpHost: record?.smtpHost || 'smtp.gmail.com',
    smtpPort: record?.smtpPort || 587,
    smtpSecure: Boolean(record?.smtpSecure),
    smtpUser: record?.smtpUser || null,
    smtpFromName: record?.smtpFromName || company.commercialName || company.legalName || 'Facturación Electrónica',
    smtpFromEmail: record?.smtpFromEmail || record?.smtpUser || company.email || null,
    hasSmtpPassword: Boolean(record?.smtpPasswordEncrypted)
  };
};

const updateCompanyCredentials = async ({ company, data = {}, transaction = null }) => {
  if (!company?.id) {
    const error = new Error('Empresa emisora no disponible para guardar credenciales');
    error.statusCode = 400;
    throw error;
  }

  const mhUserProvided = data.mhUser !== undefined;
  const mhPasswordProvided = data.mhPassword !== undefined && String(data.mhPassword || '').trim() !== '';
  const signerPasswordProvided = data.signerPrivateKeyPassword !== undefined &&
    String(data.signerPrivateKeyPassword || '').trim() !== '';
  const certificateProvided = data.certificateFileName !== undefined;
  const smtpHostProvided = data.smtpHost !== undefined;
  const smtpPortProvided = data.smtpPort !== undefined;
  const smtpSecureProvided = data.smtpSecure !== undefined;
  const smtpUserProvided = data.smtpUser !== undefined;
  const smtpPasswordProvided = data.smtpPassword !== undefined && String(data.smtpPassword || '').trim() !== '';
  const smtpFromNameProvided = data.smtpFromName !== undefined;
  const smtpFromEmailProvided = data.smtpFromEmail !== undefined;

  if (
    !mhUserProvided && !mhPasswordProvided && !signerPasswordProvided && !certificateProvided &&
    !smtpHostProvided && !smtpPortProvided && !smtpSecureProvided && !smtpUserProvided &&
    !smtpPasswordProvided && !smtpFromNameProvided && !smtpFromEmailProvided
  ) {
    return getPublicCredentialStatus(company);
  }

  const existing = await CompanyCredential.findOne({
    where: { companyId: company.id },
    transaction
  });

  const payload = {
    companyId: company.id,
    mhUser: mhUserProvided
      ? normalizeText(data.mhUser)
      : existing?.mhUser || cleanDigits(company.nit),
    mhPasswordEncrypted: mhPasswordProvided
      ? encryptSecret(data.mhPassword)
      : existing?.mhPasswordEncrypted || null,
    signerPrivateKeyPasswordEncrypted: signerPasswordProvided
      ? encryptSecret(data.signerPrivateKeyPassword)
      : existing?.signerPrivateKeyPasswordEncrypted || null,
    certificateFileName: certificateProvided
      ? normalizeText(data.certificateFileName) || getDefaultCertificateFileName(company.nit)
      : existing?.certificateFileName || getDefaultCertificateFileName(company.nit),
    smtpHost: smtpHostProvided
      ? normalizeText(data.smtpHost) || 'smtp.gmail.com'
      : existing?.smtpHost || 'smtp.gmail.com',
    smtpPort: smtpPortProvided
      ? normalizePort(data.smtpPort, 587)
      : existing?.smtpPort || 587,
    smtpSecure: smtpSecureProvided
      ? normalizeBoolean(data.smtpSecure, false)
      : Boolean(existing?.smtpSecure),
    smtpUser: smtpUserProvided
      ? normalizeText(data.smtpUser)
      : existing?.smtpUser || null,
    smtpPasswordEncrypted: smtpPasswordProvided
      ? encryptSecret(data.smtpPassword)
      : existing?.smtpPasswordEncrypted || null,
    smtpFromName: smtpFromNameProvided
      ? normalizeText(data.smtpFromName)
      : existing?.smtpFromName || company.commercialName || company.legalName || 'Facturación Electrónica',
    smtpFromEmail: smtpFromEmailProvided
      ? normalizeText(data.smtpFromEmail)
      : existing?.smtpFromEmail || existing?.smtpUser || normalizeText(data.smtpUser) || company.email || null
  };

  if (existing) {
    await existing.update(payload, { transaction });
  } else {
    await CompanyCredential.create(payload, { transaction });
  }

  clearCompanyCredentialCache(company.id);
  return {
    mhUser: payload.mhUser,
    certificateFileName: payload.certificateFileName,
    hasMhPassword: Boolean(payload.mhPasswordEncrypted),
    hasSignerPrivateKeyPassword: Boolean(payload.signerPrivateKeyPasswordEncrypted),
    smtpHost: payload.smtpHost,
    smtpPort: payload.smtpPort,
    smtpSecure: Boolean(payload.smtpSecure),
    smtpUser: payload.smtpUser,
    smtpFromName: payload.smtpFromName,
    smtpFromEmail: payload.smtpFromEmail,
    hasSmtpPassword: Boolean(payload.smtpPasswordEncrypted)
  };
};

const getRuntimeCompanyCredentials = async (company) => {
  if (!company?.id) {
    const error = new Error('Empresa emisora no disponible para resolver credenciales');
    error.statusCode = 500;
    throw error;
  }

  const cacheKey = String(company.id);
  const cached = runtimeCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const record = await getCredentialRecord(company.id);
  const companyNit = cleanDigits(company.nit);
  const legacyNit = cleanDigits(process.env.MH_USER || process.env.MH_NIT);
  const legacyMatchesCompany = Boolean(companyNit && legacyNit && companyNit === legacyNit);

  const value = {
    mhUser: normalizeText(record?.mhUser) || (legacyMatchesCompany ? process.env.MH_USER || process.env.MH_NIT : null),
    mhPassword: record?.mhPasswordEncrypted
      ? decryptSecret(record.mhPasswordEncrypted)
      : legacyMatchesCompany
        ? normalizeText(process.env.MH_PASSWORD)
        : null,
    signerPrivateKeyPassword: record?.signerPrivateKeyPasswordEncrypted
      ? decryptSecret(record.signerPrivateKeyPasswordEncrypted)
      : legacyMatchesCompany
        ? normalizeText(process.env.SIGNER_PRIVATE_KEY_PASSWORD)
        : null,
    certificateFileName: normalizeText(record?.certificateFileName) || getDefaultCertificateFileName(company.nit),
    smtpHost: normalizeText(record?.smtpHost),
    smtpPort: record?.smtpPort ? normalizePort(record.smtpPort, 587) : null,
    smtpSecure: record?.smtpSecure === null || record?.smtpSecure === undefined ? null : Boolean(record.smtpSecure),
    smtpUser: normalizeText(record?.smtpUser),
    smtpPassword: record?.smtpPasswordEncrypted ? decryptSecret(record.smtpPasswordEncrypted) : null,
    smtpFromName: normalizeText(record?.smtpFromName),
    smtpFromEmail: normalizeText(record?.smtpFromEmail)
  };

  runtimeCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + (Number.isFinite(CACHE_TTL_MS) && CACHE_TTL_MS > 0 ? CACHE_TTL_MS : 300000)
  });

  return value;
};

const getRuntimeCompanySmtpConfig = async (company) => {
  const credentials = await getRuntimeCompanyCredentials(company);
  const hasTenantSmtp = Boolean(credentials.smtpUser && credentials.smtpPassword);

  if (hasTenantSmtp) {
    return {
      host: credentials.smtpHost || 'smtp.gmail.com',
      port: credentials.smtpPort || 587,
      secure: credentials.smtpSecure ?? false,
      user: credentials.smtpUser,
      pass: credentials.smtpPassword,
      fromName: credentials.smtpFromName || company.commercialName || company.legalName || 'Facturación Electrónica',
      fromEmail: credentials.smtpFromEmail || credentials.smtpUser
    };
  }

  if (isGlobalSmtpFallbackEnabled()) {
    const host = normalizeText(process.env.SMTP_HOST);
    const user = normalizeText(process.env.SMTP_USER);
    const pass = normalizeText(process.env.SMTP_PASS);
    const fromEmail = normalizeText(process.env.SMTP_FROM_EMAIL) || user;

    if (host && user && pass && fromEmail) {
      return {
        host,
        port: normalizePort(process.env.SMTP_PORT, 587),
        secure: normalizeBoolean(process.env.SMTP_SECURE, false),
        user,
        pass,
        fromName: normalizeText(process.env.SMTP_FROM_NAME) || 'Facturación Electrónica',
        fromEmail
      };
    }
  }

  const error = new Error(
    `Configure el correo SMTP y la contraseña de aplicación del contribuyente ${company?.legalName || company?.nit || ''}`.trim()
  );
  error.statusCode = 400;
  throw error;
};

module.exports = {
  cleanDigits,
  getDefaultCertificateFileName,
  getPublicCredentialStatus,
  updateCompanyCredentials,
  getRuntimeCompanyCredentials,
  getRuntimeCompanySmtpConfig,
  clearCompanyCredentialCache
};
