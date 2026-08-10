const getOperationalContext = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  if (!req.user.pointOfSale || !req.user.company) {
    return res.status(400).json({
      ok: false,
      message: 'El usuario no tiene punto de venta asignado. Contacte al administrador técnico.'
    });
  }

  res.status(200).json({
    ok: true,
    context: {
      user: {
        id: req.user.id,
        fullName: `${req.user.firstName} ${req.user.lastName}`,
        email: req.user.email
      },
      company: req.user.company,
      pointOfSale: req.user.pointOfSale,
      establishmentCode: req.user.company.establishmentCode
    }
  });
};

module.exports = {
  getOperationalContext
};