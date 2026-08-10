import api from './axios';

export const getCustomersRequest = async (params = {}) => {
  const response = await api.get('/customers', {
    params
  });

  return response.data;
};

export const getCustomerByIdRequest = async (id) => {
  const response = await api.get(`/customers/${id}`);
  return response.data;
};

export const createCustomerRequest = async (customerData) => {
  const response = await api.post('/customers', customerData);
  return response.data;
};

export const updateCustomerRequest = async (id, customerData) => {
  const response = await api.put(`/customers/${id}`, customerData);
  return response.data;
};