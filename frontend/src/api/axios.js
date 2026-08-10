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
let failedQueue = [];

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
    const isAuthRoute = originalRequest.url?.includes('/auth/login')
      || originalRequest.url?.includes('/auth/refresh')
      || originalRequest.url?.includes('/auth/logout');

    if (!isUnauthorized || originalRequest._retry || isAuthRoute) {
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
      const response = await api.post('/auth/refresh');
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