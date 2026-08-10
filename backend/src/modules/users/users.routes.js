const express = require('express');

const usersController = require('./users.controller');
const { authenticate, authorize, requireAdmin } = require('../../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate, requireAdmin, authorize('USERS_MANAGE'));
router.get('/', usersController.listUsers);
router.post('/', usersController.createUser);
router.put('/:id', usersController.updateUser);
router.patch('/:id/reset-password', usersController.resetPassword);

module.exports = router;
