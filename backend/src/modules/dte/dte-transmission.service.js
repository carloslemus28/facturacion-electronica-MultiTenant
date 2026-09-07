const haciendaAuthService = require('./dte-hacienda-auth.service');

const getTimeoutMs = () => {
  const value = Number(process.env.MH_TIMEOUT_MS || 30000);
  return Number.isFinite(value) && value > 0 ? value : 30000;
};

const OFFICIAL_ENDPOINTS = {
  MH_TEST: {
    receptionUrl: 'https://apitest.dtes.mh.gob.sv/fesv/recepciondte',
    consultationUrl: 'https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte',
    invalidationUrl: 'https://apitest.dtes.mh.gob.sv/fesv/anulardte',
    contingencyUrl: 'https://apitest.dtes.mh.gob.sv/fesv/contingencia'
  },
  MH_PRODUCTION: {
    receptionUrl: 'https://api.dtes.mh.gob.sv/fesv/recepciondte',
    consultationUrl: 'https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte',
    invalidationUrl: 'https://api.dtes.mh.gob.sv/fesv/anulardte',
    contingencyUrl: 'https://api.dtes.mh.gob.sv/fesv/contingencia'
  }
};

const resolveOfficialEndpoint = ({ configured, expected, label }) => {
  const value = String(configured || expected || '').trim();
  if (!value || value !== expected) {
    const error = new Error(`${label} no coincide con el endpoint publicado en el Manual Tecnológico v2.0`);
    error.statusCode = 500;
    throw error;
  }
  return expected;
};

const getTransmissionConfig = (company) => {
  const environment = String(company?.environment || 'TEST').toUpperCase() === 'PRODUCTION'
    ? 'MH_PRODUCTION'
    : 'MH_TEST';
  const envValue = (suffix, legacyName) => process.env[`${environment}_${suffix}`] || process.env[legacyName] || null;
  const official = OFFICIAL_ENDPOINTS[environment];

  const receptionUrl = resolveOfficialEndpoint({ configured: envValue('RECEPCION_DTE_URL', 'MH_RECEPCION_DTE_URL'), expected: official.receptionUrl, label: 'La URL de recepción DTE' });
  const invalidationUrl = resolveOfficialEndpoint({ configured: envValue('INVALIDACION_DTE_URL', 'MH_INVALIDACION_DTE_URL'), expected: official.invalidationUrl, label: 'La URL de invalidación' });
  const contingencyUrl = resolveOfficialEndpoint({ configured: envValue('CONTINGENCIA_DTE_URL', 'MH_CONTINGENCIA_DTE_URL') || process.env.MH_CONTINGENCIA_URL, expected: official.contingencyUrl, label: 'La URL de contingencia' });
  const consultationUrl = resolveOfficialEndpoint({ configured: envValue('CONSULTA_DTE_URL', 'MH_CONSULTA_DTE_URL'), expected: official.consultationUrl, label: 'La URL de Consulta DTE' });
  const eventReceptionUrl = envValue('RECEPCION_EVENTO_URL', 'MH_RECEPCION_EVENTO_URL');
  const safeEventReceptionUrl = eventReceptionUrl && String(eventReceptionUrl).trim() !== receptionUrl
    ? String(eventReceptionUrl).trim()
    : null;

  return { receptionUrl, invalidationUrl, eventReceptionUrl: safeEventReceptionUrl, contingencyUrl, consultationUrl };
};

const parsePossibleJson = (value) => {
  if (value === undefined || value === null) return value;

  if (typeof value !== 'string') return value;

  const text = value.trim();

  if (!text) return value;

  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
};

const normalizeResponseBody = (body) => {
  if (!body) return body;

  const parsedBody = parsePossibleJson(body);

  if (!parsedBody || typeof parsedBody !== 'object') {
    return parsedBody;
  }

  const normalized = { ...parsedBody };

  if (normalized.body !== undefined && normalized.body !== null) {
    normalized.body = parsePossibleJson(normalized.body);
  }

  if (normalized.response !== undefined && normalized.response !== null) {
    normalized.response = parsePossibleJson(normalized.response);
  }

  return normalized;
};

const parseJsonSafely = async (response) => {
  const text = await response.text();

  if (!text) return null;

  try {
    return normalizeResponseBody(JSON.parse(text));
  } catch {
    return {
      raw: text
    };
  }
};

const getNestedBody = (responseBody) => {
  const body = normalizeResponseBody(responseBody);

  if (body?.body && typeof body.body === 'object') {
    return normalizeResponseBody(body.body);
  }

  if (body?.response && typeof body.response === 'object') {
    return normalizeResponseBody(body.response);
  }

  return body;
};

const normalizeEstado = (responseBody) => {
  const body = normalizeResponseBody(responseBody);
  const nestedBody = getNestedBody(body);

  return String(
    body?.estado ||
    nestedBody?.estado ||
    body?.status ||
    nestedBody?.status ||
    ''
  ).trim().toUpperCase();
};

const extractReceptionSeal = (responseBody) => {
  const body = normalizeResponseBody(responseBody);
  const nestedBody = getNestedBody(body);

  return body?.selloRecibido ||
    body?.selloRecepcion ||
    body?.numeroValidacion ||
    body?.numValidacion ||
    nestedBody?.selloRecibido ||
    nestedBody?.selloRecepcion ||
    nestedBody?.numeroValidacion ||
    nestedBody?.numValidacion ||
    null;
};

const extractObservations = (responseBody) => {
  const body = normalizeResponseBody(responseBody);
  const nestedBody = getNestedBody(body);

  return body?.observaciones ||
    nestedBody?.observaciones ||
    body?.observations ||
    nestedBody?.observations ||
    null;
};

const extractProcessingDate = (responseBody) => {
  const body = normalizeResponseBody(responseBody);
  const nestedBody = getNestedBody(body);

  return body?.fhProcesamiento ||
    nestedBody?.fhProcesamiento ||
    body?.fechaProcesamiento ||
    nestedBody?.fechaProcesamiento ||
    null;
};

const extractDescriptionMessage = (responseBody) => {
  const body = normalizeResponseBody(responseBody);
  const nestedBody = getNestedBody(body);

  return body?.descripcionMsg ||
    nestedBody?.descripcionMsg ||
    body?.mensaje ||
    nestedBody?.mensaje ||
    body?.message ||
    nestedBody?.message ||
    body?.raw ||
    nestedBody?.raw ||
    null;
};

const extractRejectionReason = (responseBody, defaultMessage = 'Hacienda rechazó la operación') => {
  const observations = extractObservations(responseBody);
  const description = extractDescriptionMessage(responseBody);

  if (Array.isArray(observations) && observations.length > 0) {
    const cleanObservations = observations
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    if (cleanObservations.length > 0) {
      return description
        ? `${description}: ${cleanObservations.join(' | ')}`
        : cleanObservations.join(' | ');
    }
  }

  if (typeof observations === 'string' && observations.trim()) {
    return description
      ? `${description}: ${observations.trim()}`
      : observations.trim();
  }

  return description || defaultMessage;
};

const buildReceptionPayload = ({ invoice, officialDteJson, signedJws }) => {
  const identificacion = officialDteJson?.identificacion || {};

  return {
    ambiente: identificacion.ambiente,
    idEnvio: Number(invoice.id),
    version: Number(identificacion.version),
    tipoDte: identificacion.tipoDte,
    documento: signedJws,
    codigoGeneracion: identificacion.codigoGeneracion
  };
};

const buildEventPayload = ({ event, officialEventJson, signedJws }) => {
  const identificacion = officialEventJson?.identificacion || {};
  const typeFieldName = process.env.MH_EVENT_PAYLOAD_TYPE_FIELD || 'tipoEvento';

  const payload = {
    ambiente: identificacion.ambiente,
    idEnvio: Number(event.id),
    version: Number(identificacion.version || 1),
    documento: signedJws,
    codigoGeneracion: identificacion.codigoGeneracion
  };

  payload[typeFieldName] = String(
    identificacion.tipoEvento ||
    event.eventTypeCode ||
    ''
  ).padStart(2, '0');

  return payload;
};

const buildContingencyPayload = ({ officialEventJson, signedJws }) => {
  const nit = String(officialEventJson?.emisor?.nit || '').replace(/\D/g, '');
  return { nit, documento: signedJws };
};

const buildInvalidationPayload = ({ invoice, officialInvalidationJson, signedJws }) => {
  const identificacion = officialInvalidationJson?.identificacion || {};

  return {
    ambiente: identificacion.ambiente,
    idEnvio: Number(invoice.id),
    version: Number(process.env.MH_INVALIDACION_EVENT_VERSION || identificacion.version || 2),
    documento: signedJws
  };
};

const postToHacienda = async ({ url, authorization, payload, errorPrefix }) => {
  if (!authorization) {
    const error = new Error(`No se recibió token de autorización para ${errorPrefix}`);
    error.statusCode = 502;
    error.haciendaPayload = payload;
    error.haciendaResponse = {
      modo: 'ERROR_AUTH_HACIENDA',
      message: 'Authorization vacío o indefinido antes de enviar a Hacienda',
      url
    };
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  let response;
  let data;

  const cleanAuthorization = String(authorization || '').trim();

if (!cleanAuthorization) {
  const error = new Error(`No se recibió token de autorización para ${errorPrefix}`);
  error.statusCode = 502;
  error.haciendaPayload = payload;
  error.haciendaResponse = {
    modo: 'ERROR_AUTH_HACIENDA',
    message: 'Authorization vacío o indefinido antes de enviar a Hacienda',
    url
  };
  throw error;
}

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
      Authorization: cleanAuthorization,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': process.env.MH_USER_AGENT || 'FacturacionElectronicaSV/1.0'
    },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    data = await parseJsonSafely(response);
  } catch (error) {
    const message = error.name === 'AbortError'
      ? `Tiempo de espera agotado al ${errorPrefix}`
      : `No fue posible ${errorPrefix}: ${error.message}`;

    const requestError = new Error(message);
    requestError.statusCode = 502;
    requestError.haciendaPayload = payload;
    requestError.haciendaResponse = {
      modo: 'ERROR_HTTP_HACIENDA',
      message,
      url,
      errorName: error.name || null
    };

    throw requestError;
  } finally {
    clearTimeout(timeout);
  }

  return {
    ok: response.ok,
    httpStatus: response.status,
    statusText: response.statusText,
    body: normalizeResponseBody(data)
  };
};

const stripBearer = (value) => {
  const text = String(value || '').trim();
  return text.replace(/^Bearer\s+/i, '').trim();
};

const withBearer = (value) => {
  const token = stripBearer(value);
  return token ? `Bearer ${token}` : null;
};

const getAuthorizationCandidates = (auth) => {
  const candidates = [
    ...(Array.isArray(auth?.authVariants) ? auth.authVariants : []),
    auth?.token,
    auth?.authorization,
    auth?.rawToken,
    withBearer(auth?.token),
    withBearer(auth?.authorization),
    withBearer(auth?.rawToken),
    stripBearer(auth?.token),
    stripBearer(auth?.authorization),
    stripBearer(auth?.rawToken)
  ];

  return [...new Set(
    candidates
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];
};

const transmitWithAuthRetry = async ({
  url,
  payload,
  errorPrefix,
  forceRefreshAuth = false,
  company
}) => {
  const triedAuthorizations = new Set();
  let lastResponse = null;

  const tryCandidates = async (auth, stage) => {
    const candidates = getAuthorizationCandidates(auth);

    for (const candidate of candidates) {
      if (triedAuthorizations.has(candidate)) continue;

      triedAuthorizations.add(candidate);

      const authMode = /^Bearer\s+/i.test(candidate) ? 'bearer' : 'raw';

      console.log(`[MH] Intentando ${errorPrefix} | etapa=${stage} | auth=${authMode} | tokenLength=${candidate.length}`);

      const response = await postToHacienda({
        url,
        authorization: candidate,
        payload,
        errorPrefix
      });

      lastResponse = response;

      if (response.httpStatus !== 401 && response.httpStatus !== 403) {
        return response;
      }
    }

    return null;
  };

  let auth = await haciendaAuthService.getHaciendaAuthorization({
    company,
    forceRefresh: forceRefreshAuth
  });

  let response = await tryCandidates(auth, 'token-inicial');

  if (response) {
    return response;
  }

  haciendaAuthService.clearHaciendaAuthCache(company?.id);

  auth = await haciendaAuthService.getHaciendaAuthorization({
    company,
    forceRefresh: true
  });

  response = await tryCandidates(auth, 'token-refrescado');

  if (response) {
    return response;
  }

  if (lastResponse) {
    return lastResponse;
  }

  const error = new Error(`No fue posible ${errorPrefix}: no se obtuvo respuesta de Hacienda`);
  error.statusCode = 502;
  error.haciendaPayload = payload;
  error.haciendaResponse = {
    modo: 'SIN_RESPUESTA_HACIENDA',
    message: `No se obtuvo respuesta válida al ${errorPrefix}`,
    url
  };

  throw error;
};

const normalizeTransmissionResult = ({ response, payload, defaultRejectedMessage }) => {
  if (!response) {
    return {
      accepted: false,
      rejected: true,
      estado: 'SIN_RESPUESTA',
      receptionSeal: null,
      observations: null,
      rejectionReason: defaultRejectedMessage || 'No se obtuvo respuesta de Hacienda',
      httpStatus: null,
      statusText: null,
      payload,
      response: null,
      defaultRejectedMessage
    };
  }

  const responseBody = normalizeResponseBody(response.body);
  const estado = normalizeEstado(responseBody);
  const receptionSeal = extractReceptionSeal(responseBody);
  const observations = extractObservations(responseBody);

  const accepted = Boolean(
    response.ok &&
    (
      estado === 'PROCESADO' ||
      estado === 'ACEPTADO' ||
      estado === 'RECIBIDO' ||
      receptionSeal
    )
  );

  const rejected = Boolean(
    estado === 'RECHAZADO' ||
    estado === 'OBSERVADO' ||
    (!response.ok && response.httpStatus >= 400)
  );

  return {
    accepted,
    rejected,
    estado,
    receptionSeal,
    observations,
    rejectionReason: rejected || !accepted
      ? extractRejectionReason(responseBody, defaultRejectedMessage)
      : null,
    httpStatus: response.httpStatus,
    statusText: response.statusText,
    payload,
    response: responseBody,
    defaultRejectedMessage
  };
};

const transmitSignedDte = async ({ invoice, company = invoice?.company, officialDteJson, signedJws }) => {
  if (!invoice) {
    const error = new Error('La factura es obligatoria para transmitir a Hacienda');
    error.statusCode = 400;
    throw error;
  }

  if (!officialDteJson?.identificacion) {
    const error = new Error('El JSON oficial del DTE no tiene identificación');
    error.statusCode = 400;
    throw error;
  }

  if (!signedJws) {
    const error = new Error('El documento firmado es obligatorio para transmitir a Hacienda');
    error.statusCode = 400;
    throw error;
  }

  const config = getTransmissionConfig(company);

  const payload = buildReceptionPayload({
    invoice,
    officialDteJson,
    signedJws
  });

  const response = await transmitWithAuthRetry({
    url: config.receptionUrl,
    payload,
    errorPrefix: 'transmitir DTE a Hacienda',
    company
  });

  return normalizeTransmissionResult({
    response,
    payload,
    defaultRejectedMessage: 'Hacienda rechazó el DTE'
  });
};

const consultDteInHacienda = async ({ invoice, company = invoice?.company }) => {
  if (!invoice) {
    const error = new Error('El DTE es obligatorio para consultar su estado en Hacienda');
    error.statusCode = 400;
    throw error;
  }

  const generationCode = String(invoice.generationCode || '').trim().toUpperCase();
  const documentTypeCode = String(invoice.documentTypeCode || '').trim().padStart(2, '0');
  const issuerNit = String(company?.nit || '').replace(/\D/g, '');

  if (!generationCode || !documentTypeCode || !issuerNit) {
    const error = new Error('No hay suficiente información para consultar el DTE en Hacienda');
    error.statusCode = 400;
    throw error;
  }

  const config = getTransmissionConfig(company);

  if (!config.consultationUrl) {
    const error = new Error('No fue posible determinar la URL de Consulta DTE de Hacienda');
    error.statusCode = 500;
    throw error;
  }

  const payload = {
    nitEmisor: issuerNit,
    tdte: documentTypeCode,
    codigoGeneracion: generationCode
  };

  const response = await transmitWithAuthRetry({
    url: config.consultationUrl,
    payload,
    errorPrefix: 'consultar DTE en Hacienda',
    company
  });

  const normalized = normalizeTransmissionResult({
    response,
    payload,
    defaultRejectedMessage: 'Hacienda no confirmó el DTE consultado'
  });

  return {
    ...normalized,
    processingDate: extractProcessingDate(response?.body),
    consultationUrl: config.consultationUrl
  };
};

const transmitSignedInvalidation = async ({ invoice, company = invoice?.company, officialInvalidationJson, signedJws }) => {
  if (!invoice) {
    const error = new Error('La factura es obligatoria para transmitir la anulación');
    error.statusCode = 400;
    throw error;
  }

  if (!officialInvalidationJson?.identificacion) {
    const error = new Error('El JSON oficial de anulación no tiene identificación');
    error.statusCode = 400;
    throw error;
  }

  if (!signedJws) {
    const error = new Error('El evento de anulación firmado es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  const config = getTransmissionConfig(company);

  if (!config.invalidationUrl) {
    const error = new Error('No se ha configurado MH_INVALIDACION_DTE_URL en el .env');
    error.statusCode = 500;
    throw error;
  }

  const payload = buildInvalidationPayload({
    invoice,
    officialInvalidationJson,
    signedJws
  });

  const response = await transmitWithAuthRetry({
    url: config.invalidationUrl,
    payload,
    errorPrefix: 'transmitir evento de anulación a Hacienda',
    company
  });

  return normalizeTransmissionResult({
    response,
    payload,
    defaultRejectedMessage: 'Hacienda rechazó la anulación'
  });
};

const transmitSignedEvent = async ({ event, company, officialEventJson, signedJws }) => {
  if (!event) {
    const error = new Error('El evento es obligatorio para transmitir a Hacienda');
    error.statusCode = 400;
    throw error;
  }

  if (!officialEventJson?.identificacion) {
    const error = new Error('El JSON oficial del evento no tiene identificación');
    error.statusCode = 400;
    throw error;
  }

  if (!signedJws) {
    const error = new Error('El evento firmado es obligatorio para transmitir a Hacienda');
    error.statusCode = 400;
    throw error;
  }

  const config = getTransmissionConfig(company);

  if (!config.eventReceptionUrl) {
    const error = new Error('No se ha configurado MH_RECEPCION_EVENTO_URL en el .env');
    error.statusCode = 500;
    throw error;
  }

  if (String(config.eventReceptionUrl).replace(/\/+$/, '') === String(config.receptionUrl).replace(/\/+$/, '')) {
    const error = new Error('MH_RECEPCION_EVENTO_URL no puede reutilizar el endpoint de recepción DTE. Configure únicamente un endpoint de evento expresamente publicado por Hacienda.');
    error.statusCode = 500;
    throw error;
  }

  const payload = buildEventPayload({
    event,
    officialEventJson,
    signedJws
  });

  console.log('[MH EVENT PAYLOAD]', {
  url: config.eventReceptionUrl,
  ambiente: payload.ambiente,
  idEnvio: payload.idEnvio,
  version: payload.version,
  tipoEvento: payload.tipoEvento || null,
  tipoDte: payload.tipoDte || null,
  codigoGeneracion: payload.codigoGeneracion,
  documentoLength: String(payload.documento || '').length
});

  const response = await transmitWithAuthRetry({
    url: config.eventReceptionUrl,
    payload,
    errorPrefix: 'transmitir evento DTE a Hacienda',
    forceRefreshAuth: true,
    company
  });

  return normalizeTransmissionResult({
    response,
    payload,
    defaultRejectedMessage: 'Hacienda rechazó el evento DTE'
  });
};

const transmitSignedContingencyEvent = async ({ event, company, officialEventJson, signedJws }) => {
  if (!event) {
    const error = new Error('El evento de contingencia es obligatorio para transmitir a Hacienda');
    error.statusCode = 400;
    throw error;
  }

  if (!officialEventJson?.identificacion) {
    const error = new Error('El JSON oficial del evento de contingencia no tiene identificación');
    error.statusCode = 400;
    throw error;
  }

  if (!signedJws) {
    const error = new Error('El evento de contingencia firmado es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  const config = getTransmissionConfig(company);

  if (!config.contingencyUrl) {
    const error = new Error('No se ha configurado MH_CONTINGENCIA_DTE_URL en el .env');
    error.statusCode = 500;
    throw error;
  }

  const payload = buildContingencyPayload({
    officialEventJson,
    signedJws
  });

  console.log('[MH CONTINGENCY PAYLOAD]', {
    url: config.contingencyUrl,
    nit: payload.nit,
    documentoLength: String(payload.documento || '').length
  });

  const response = await transmitWithAuthRetry({
    url: config.contingencyUrl,
    payload,
    errorPrefix: 'transmitir evento de contingencia a Hacienda',
    forceRefreshAuth: true,
    company
  });

  return normalizeTransmissionResult({
    response,
    payload,
    defaultRejectedMessage: 'Hacienda rechazó el evento de contingencia'
  });
};

module.exports = {
  transmitSignedDte,
  consultDteInHacienda,
  transmitSignedInvalidation,
  transmitSignedEvent,
  transmitSignedContingencyEvent
};