import api from './axios';

export const previewDteExcelReportRequest = async ({
  documentTypeCode,
  startDate,
  endDate,
  status
}) => {
  const response = await api.get('/reports/dte/preview', {
    params: {
      documentTypeCode,
      startDate,
      endDate,
      status
    }
  });

  return response.data;
};

export const downloadDteExcelReportRequest = async ({
  documentTypeCode,
  startDate,
  endDate,
  status
}) => {
  const response = await api.get('/reports/dte/excel', {
    params: {
      documentTypeCode,
      startDate,
      endDate,
      status
    },
    responseType: 'blob'
  });

  return response;
};

export const downloadBlobFile = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');

  link.href = url;
  link.setAttribute('download', fileName);

  document.body.appendChild(link);

  link.click();

  link.remove();

  window.URL.revokeObjectURL(url);
};