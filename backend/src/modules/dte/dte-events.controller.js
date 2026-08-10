const dteEventsService = require('./dte-events.service');

const listEvents = async (req, res, next) => {
  try {
    const events = await dteEventsService.listEvents({
      user: req.user
    });

    res.set('Cache-Control', 'no-store');

    res.status(200).json({
      ok: true,
      events
    });
  } catch (error) {
    next(error);
  }
};

const getEventById = async (req, res, next) => {
  try {
    const eventContext = await dteEventsService.getEventById({
      id: req.params.id,
      user: req.user
    });

    res.status(200).json({
      ok: true,
      event: eventContext.event,
      items: eventContext.items,
      sourceInvoice: eventContext.sourceInvoice || null
    });
  } catch (error) {
    next(error);
  }
};

const getEventJsonById = async (req, res, next) => {
  try {
    const eventJson = await dteEventsService.getEventJsonById({
      id: req.params.id,
      user: req.user,
      official: req.query.official === 'true'
    });

    res.set('Cache-Control', 'no-store');

    res.status(200).json({
      ok: true,
      eventJson
    });
  } catch (error) {
    next(error);
  }
};

const createReturnEvent = async (req, res, next) => {
  try {
    const eventContext = await dteEventsService.createReturnEvent({
      data: req.body,
      user: req.user
    });

    res.status(201).json({
      ok: true,
      message: 'Evento de Retorno generado correctamente',
      event: eventContext.event,
      items: eventContext.items,
      sourceInvoice: eventContext.sourceInvoice || null
    });
  } catch (error) {
    next(error);
  }
};

const createSpecialOperationsEvent = async (req, res, next) => {
  try {
    const eventContext = await dteEventsService.createSpecialOperationsEvent({
      data: req.body,
      user: req.user
    });

    res.status(201).json({
      ok: true,
      message: 'Evento de Operaciones Especiales generado correctamente',
      event: eventContext.event,
      items: eventContext.items
    });
  } catch (error) {
    next(error);
  }
};

const createContingencyEvent = async (req, res, next) => {
  try {
    const eventContext = await dteEventsService.createContingencyEvent({
      data: req.body,
      user: req.user
    });

    res.status(201).json({
      ok: true,
      message: 'Evento de Contingencia generado correctamente',
      event: eventContext.event,
      items: eventContext.items
    });
  } catch (error) {
    next(error);
  }
};

const transmitEvent = async (req, res, next) => {
  try {
    const eventContext = await dteEventsService.transmitEventToHacienda({
      id: req.params.id,
      user: req.user
    });

    res.status(200).json({
      ok: true,
      message: 'Evento transmitido correctamente a Hacienda',
      event: eventContext.event,
      items: eventContext.items,
      sourceInvoice: eventContext.sourceInvoice || null
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listEvents,
  getEventById,
  getEventJsonById,
  createReturnEvent,
  createSpecialOperationsEvent,
  createContingencyEvent,
  transmitEvent
};
