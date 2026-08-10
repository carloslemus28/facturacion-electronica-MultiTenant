const emailsService = require('./emails.service');

const sendInvoiceEmail = async (req, res, next) => {
  try {
    const result = await emailsService.sendInvoiceEmail({
      id: req.params.id,
      user: req.user,
      to: req.body.to,
      subject: req.body.subject,
      message: req.body.message
    });

    res.status(200).json({
      ok: true,
      message: 'Correo enviado correctamente',
      email: result
    });
  } catch (error) {
    next(error);
  }
};

const getInvoiceEmailLogs = async (req, res, next) => {
  try {
    const logs = await emailsService.listInvoiceEmailLogs({
      id: req.params.id,
      user: req.user
    });

    res.status(200).json({
      ok: true,
      logs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendInvoiceEmail,
  getInvoiceEmailLogs
};