import api from './axios';

export const getInvoicesRequest = async (params = {}) => {
  const response = await api.get('/invoices', {
    params
  });

  return response.data;
};

export const getInvoiceByIdRequest = async (id) => {
  const response = await api.get(`/invoices/${id}`);
  return response.data;
};

export const generateInvoiceRequest = async (invoiceData) => {
  const response = await api.post('/invoices/generate', invoiceData);
  return response.data;
};

export const updateGeneratedInvoiceRequest = async (id, invoiceData) => {
  const response = await api.put(`/invoices/${id}`, invoiceData);
  return response.data;
};

export const getDashboardSummaryRequest = async () => {
  const response = await api.get('/invoices/dashboard-summary');
  return response.data;
};

export const getAvailableDocumentsForCreditNoteRequest = async () => {
  const response = await api.get('/invoices/credit-note/available-documents');
  return response.data;
};

export const transmitInvoiceRequest = async (id) => {
  const response = await api.patch(`/invoices/${id}/transmit`);
  return response.data;
};

export const invalidateInvoiceRequest = async (id, reason) => {
  const response = await api.patch(`/invoices/${id}/invalidate`, {
    reason
  });

  return response.data;
};

export const getDteJsonRequest = async (id, type = 'document') => {
  const response = await api.get(`/dte-json/invoices/${id}`, {
    params: {
      type
    }
  });

  return response.data;
};

export const downloadDteJsonRequest = async (id, type = 'document') => {
  const response = await api.get(`/dte-json/invoices/${id}/download`, {
    params: {
      type
    },
    responseType: 'blob'
  });

  return response;
};

export const getDtePdfRequest = async (id, type = 'document') => {
  const response = await api.get(`/dte-pdf/invoices/${id}`, {
    params: {
      type
    },
    responseType: 'blob'
  });

  return response;
};

export const downloadDtePdfRequest = async (id, type = 'document') => {
  const response = await api.get(`/dte-pdf/invoices/${id}/download`, {
    params: {
      type
    },
    responseType: 'blob'
  });

  return response;
};

export const sendInvoiceEmailRequest = async (id, emailData) => {
  const response = await api.post(`/emails/invoices/${id}/send`, emailData);
  return response.data;
};

export const getInvoiceEmailLogsRequest = async (id) => {
  const response = await api.get(`/emails/invoices/${id}/logs`);
  return response.data;
};