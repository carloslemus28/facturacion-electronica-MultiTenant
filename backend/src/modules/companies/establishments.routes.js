const express = require('express');

const establishmentsController = require('./establishments.controller');
const { authenticate, authorize, requireAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate, requireAdmin, authorize('COMPANIES_MANAGE'));
router.get('/', establishmentsController.listEstablishments);
router.get('/next-code', establishmentsController.getNextEstablishmentCode);
router.get('/:id', establishmentsController.getEstablishmentById);
router.post('/', establishmentsController.createEstablishment);
router.put('/:id', establishmentsController.updateEstablishment);

module.exports = router;
