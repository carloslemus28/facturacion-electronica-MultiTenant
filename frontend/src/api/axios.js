import axios from 'axios';
import { tokenStore } from './tokenStore';
import { tenantStore } from './tenantStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

let isRefreshing = false;
let refreshPromise = null;
let failedQueue = [];

export const refreshSessionRequest = () => {
  // El refresh token se rota en cada renovación. Compartimos una sola promesa
  // dentro de esta pestaña y, cuando el navegador soporta Web Locks, también
  // serializamos la renovación entre pestañas del mismo navegador. Así una
  // pestaña no invalida el refresh token que otra acaba de utilizar.
  if (!refreshPromise) {
    const executeRefresh = () => api.post('/auth/refresh');
    const supportsCrossTabLock = typeof navigator !== 'undefined'
      && navigator.locks
      && typeof navigator.locks.request === 'function';

    refreshPromise = (
      supportsCrossTabLock
        ? navigator.locks.request('facturacion-cym-auth-refresh', { mode: 'exclusive' }, executeRefresh)
        : executeRefresh()
    ).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

const processQueue = (error, token = null) => {
  failedQueue.forEach((request) => {
    if (error) {
      request.reject(error);
    } else {
      request.resolve(token);
    }
  });

  failedQueue = [];
};

api.interceptors.request.use(
  (config) => {
    const token = tokenStore.getAccessToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const companyId = tenantStore.getCompanyId();
    if (companyId) {
      config.headers['X-Company-Id'] = companyId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response) {
      return Promise.reject(error);
    }

    const isUnauthorized = error.response.status === 401;
    const authErrorCode = String(error.response?.data?.code || '');
    const isAccessTokenError = [
      'ACCESS_TOKEN_MISSING',
      'ACCESS_TOKEN_EXPIRED',
      'ACCESS_TOKEN_INVALID'
    ].includes(authErrorCode);
    const isAuthRoute = originalRequest.url?.includes('/auth/login')
      || originalRequest.url?.includes('/auth/refresh')
      || originalRequest.url?.includes('/auth/logout');

    // No todo HTTP 401 significa que expiró la sesión de la aplicación. Una
    // operación de negocio o una integración externa puede responder 401 sin
    // que debamos cerrar la sesión del usuario. Solo renovamos cuando el
    // middleware de autenticación identifica explícitamente el access token.
    if (!isUnauthorized || !isAccessTokenError || originalRequest._retry || isAuthRoute) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((queueError) => Promise.reject(queueError));
    }

    isRefreshing = true;

    try {
      const response = await refreshSessionRequest();
      const newAccessToken = response.data.accessToken;

      tokenStore.setAccessToken(newAccessToken);

      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      tokenStore.clearAccessToken();
      processQueue(refreshError, null);

      window.dispatchEvent(new Event('auth:session-expired'));

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;