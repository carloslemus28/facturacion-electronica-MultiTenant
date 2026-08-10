import api from './axios';

export const getProductsRequest = async (params = {}) => {
  const response = await api.get('/products', {
    params
  });

  return response.data;
};

export const getProductByIdRequest = async (id) => {
  const response = await api.get(`/products/${id}`);
  return response.data;
};

export const createProductRequest = async (productData) => {
  const response = await api.post('/products', productData);
  return response.data;
};

export const updateProductRequest = async (id, productData) => {
  const response = await api.put(`/products/${id}`, productData);
  return response.data;
};