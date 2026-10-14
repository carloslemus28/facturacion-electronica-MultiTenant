const express = require('express');

const dteEventsController = require('./dte-events.controller');
const { authenticate, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/formats/17',authenticate,authorize('INVOICES_CREATE'),async(req,res,next)=>{
  try { const current=await require('../invoices/invoices.service').resolveUserContext(req.user);const {schemas,assertEnabled}=require('./dte-schema.service');assertEnabled(current.company,'17');res.json({schema:schemas['17'].properties.cuerpoDocumento}); }catch(e){next(e);}
});
router.post('/:id/invalidate',authenticate,authorize('DTE_INVALIDATE'),async(req,res,next)=>{
  try {res.json({ok:true,eventJson:await require('./dte-event-actions.service').invalidateEvent({id:req.params.id,user:req.user,reason:req.body})});}catch(e){next(e);}
});
router.get('/:id/invalidation/:format',authenticate,authorize('INVOICES_VIEW'),async(req,res,next)=>{
  try {const data=await require('./dte-event-actions.service').getInvalidationFile({id:req.params.id,user:req.user});res.set('Cache-Control','no-store');if(req.params.format==='pdf'){const result=await require('./dte-generic-pdf.service').buildFiscalPdf(data,'Evento de Invalidación');return res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${result.fileName}"`}).send(result.buffer);}res.json({eventJson:data});}catch(e){next(e);}
});

router.get(
  '/',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteEventsController.listEvents
);

router.post(
  '/return',
  authenticate,
  authorize('INVOICES_CREATE'),
  dteEventsController.createReturnEvent
);

router.post(
  '/special-operations',
  authenticate,
  authorize('INVOICES_CREATE'),
  dteEventsController.createSpecialOperationsEvent
);

router.post(
  '/contingency',
  authenticate,
  authorize('INVOICES_CREATE'),
  dteEventsController.createContingencyEvent
);

router.get(
  '/:id/json',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteEventsController.getEventJsonById
);

router.patch(
  '/:id/transmit',
  authenticate,
  authorize('INVOICES_TRANSMIT'),
  dteEventsController.transmitEvent
);

router.get('/:id/pdf', authenticate, authorize('INVOICES_VIEW'), async (req,res,next) => {
  try {
    const data=await require('./dte-events.service').getEventJsonById({id:req.params.id,user:req.user,official:true});
    const result=await require('./dte-generic-pdf.service').buildFiscalPdf(data,'Evento Tributario Electrónico');
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${result.fileName}"`,'Cache-Control':'no-store'}).send(result.buffer);
  } catch(error) { next(error); }
});

router.get(
  '/:id',
  authenticate,
  authorize('INVOICES_VIEW'),
  dteEventsController.getEventById
);

module.exports = router;
