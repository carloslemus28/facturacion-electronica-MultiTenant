import api from './axios';

export const getDteEventsRequest = async () => {
  const response = await api.get('/dte-events');
  return response.data;
};

export const getDteEventByIdRequest = async (id) => {
  const response = await api.get(`/dte-events/${id}`);
  return response.data;
};

export const getDteEventJsonRequest = async (id, official = false) => {
  const response = await api.get(`/dte-events/${id}/json`, {
    params: { official }
  });

  return response.data;
};

export const createReturnEventRequest = async (eventData) => {
  const response = await api.post('/dte-events/return', eventData);
  return response.data;
};

export const createContingencyEventRequest = async (eventData) => {
  const response = await api.post('/dte-events/contingency', eventData);
  return response.data;
};

export const transmitDteEventRequest = async (id) => {
  const response = await api.patch(`/dte-events/${id}/transmit`);
  return response.data;
};
