const express = require('express');

const authController = require('./auth.controller');
const sessionController = require('./session.controller');

const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.get('/context', authenticate, sessionController.getOperationalContext);

module.exports = router;