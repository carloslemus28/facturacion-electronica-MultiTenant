import api from './axios';

export const getInventorySummaryRequest = async (params = {}) => {
  const response = await api.get('/inventory/summary', { params });
  return response.data;
};

export const getInventoryMovementsRequest = async (params = {}) => {
  const response = await api.get('/inventory/movements', { params });
  return response.data;
};

export const registerProductInventoryEntryRequest = async (payload) => {
  const response = await api.post('/inventory/product-entry', payload);
  return response.data;
};

export const registerProductInventoryEntriesRequest = async (entries) => {
  const response = await api.post('/inventory/product-entries', { entries });
  return response.data;
};

export const downloadKardexRequest = async (params = {}) => {
  const response = await api.get('/inventory/kardex.xlsx', {
    params,
    responseType: 'blob'
  });

  return response.data;
};
