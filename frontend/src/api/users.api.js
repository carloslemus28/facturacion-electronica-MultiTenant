import api from './axios';

export const getUsersRequest = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const createUserRequest = async (userData) => {
  const response = await api.post('/users', userData);
  return response.data;
};

export const updateUserRequest = async (id, userData) => {
  const response = await api.put(`/users/${id}`, userData);
  return response.data;
};

export const resetUserPasswordRequest = async (id, password) => {
  const response = await api.patch(`/users/${id}/reset-password`, {
    password
  });

  return response.data;
};