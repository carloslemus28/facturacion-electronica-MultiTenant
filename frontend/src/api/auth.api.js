import api from './axios';

export const loginRequest = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const refreshRequest = async () => {
  const response = await api.post('/auth/refresh');
  return response.data;
};

export const logoutRequest = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const meRequest = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};