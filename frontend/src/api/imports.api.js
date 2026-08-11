import api from './axios';

const uploadFile = async ({ url, file, params = {} }) => {
  const response = await api.post(url, file, {
    params,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Import-File-Name': encodeURIComponent(file.name)
    }
  });

  return response.data;
};

export const getImportSummaryRequest = async () => {
  const response = await api.get('/imports/summary');
  return response.data;
};

export const importCustomersRequest = ({ file, establishmentId }) => uploadFile({
  url: '/imports/customers',
  file,
  params: { establishmentId }
});

export const importProductsRequest = ({ file, establishmentId }) => uploadFile({
  url: '/imports/products',
  file,
  params: { establishmentId }
});

export const importDocumentsRequest = ({ file }) => uploadFile({
  url: '/imports/documents',
  file
});
