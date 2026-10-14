const express = require('express');

const companiesController = require('./companies.controller');
const { authenticate, authorize, requireAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();
const requireProgrammer = (req,res,next) => require('../../utils/programmer-admin').isProgrammerAdmin(req.user) ? next() : res.status(403).json({ok:false,message:'Solo el administrador programador puede cambiar esta configuración'});

router.use(authenticate, requireAdmin);

router.get(
  '/',
  authorize('COMPANIES_MANAGE'),
  companiesController.listCompanies
);

router.get(
  '/active',
  authorize('COMPANIES_MANAGE'),
  companiesController.getActiveCompany
);

router.post(
  '/',
  authorize('COMPANIES_MANAGE'),
  requireProgrammer,
  companiesController.createCompany
);

router.post(
  '/:id/certificate-diagnostic',
  authorize('COMPANIES_MANAGE'),
  companiesController.diagnoseCompanyCertificate
);

router.put(
  '/:id',
  authorize('COMPANIES_MANAGE'),
  requireProgrammer,
  companiesController.updateCompany
);

module.exports = router;
