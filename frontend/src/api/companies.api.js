import api from './axios';

export const getCompaniesRequest = async (params = {}) => {
  const response = await api.get('/companies', { params });
  return response.data;
};

export const getActiveCompanyRequest = async () => {
  const response = await api.get('/companies/active');
  return response.data;
};

export const createCompanyRequest = async (companyData) => {
  const response = await api.post('/companies', companyData);
  return response.data;
};

export const updateCompanyRequest = async (id, companyData) => {
  const response = await api.put(`/companies/${id}`, companyData);
  return response.data;
};

export const diagnoseCompanyCertificateRequest = async (id, payload) => {
  const response = await api.post(`/companies/${id}/certificate-diagnostic`, payload);
  return response.data;
};

export const getEstablishmentsRequest = async (params = {}) => {
  const response = await api.get('/establishments', {
    params
  });

  return response.data;
};

export const getNextEstablishmentCodeRequest = async (params = {}) => {
  const response = await api.get('/establishments/next-code', {
    params
  });

  return response.data;
};

export const createEstablishmentRequest = async (establishmentData) => {
  const response = await api.post('/establishments', establishmentData);
  return response.data;
};

export const updateEstablishmentRequest = async (id, establishmentData) => {
  const response = await api.put(`/establishments/${id}`, establishmentData);
  return response.data;
};