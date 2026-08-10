import api from './axios';

export const getControlNumbersRequest = async (params = {}) => {
  const response = await api.get('/control-numbers', {
    params
  });

  return response.data;
};

export const getControlNumberDocumentTypesRequest = async () => {
  const response = await api.get('/control-numbers/document-types');
  return response.data;
};

export const setLastControlSequenceRequest = async (controlData) => {
  const response = await api.post('/control-numbers/last-sequence', controlData);
  return response.data;
};
