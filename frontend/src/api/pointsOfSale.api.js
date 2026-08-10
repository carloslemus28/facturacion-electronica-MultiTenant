import api from './axios';

export const getPointsOfSaleRequest = async (params = {}) => {
  const response = await api.get('/points-of-sale', {
    params
  });

  return response.data;
};

export const createPointOfSaleRequest = async (pointData) => {
  const response = await api.post('/points-of-sale', pointData);
  return response.data;
};

export const updatePointOfSaleRequest = async (id, pointData) => {
  const response = await api.put(`/points-of-sale/${id}`, pointData);
  return response.data;
};