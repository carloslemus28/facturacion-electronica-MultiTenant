const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const authRoutes = require('./modules/auth/auth.routes');
const companiesRoutes = require('./modules/companies/companies.routes');
const establishmentsRoutes = require('./modules/companies/establishments.routes');
const pointsOfSaleRoutes = require('./modules/companies/points-of-sale.routes');
const usersRoutes = require('./modules/users/users.routes');
const controlNumbersRoutes = require('./modules/dte/control-numbers.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const productsRoutes = require('./modules/products/products.routes');
const invoicesRoutes = require('./modules/invoices/invoices.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const dteJsonRoutes = require('./modules/dte/dte-json.routes');
const dteEventsRoutes = require('./modules/dte/dte-events.routes');
const dtePdfRoutes = require('./modules/dte/dte-pdf.routes');
const emailsRoutes = require('./modules/emails/emails.routes');

const app = express();

app.use(helmet());

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));

const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '10mb';
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));

app.use(cookieParser(process.env.COOKIE_SECRET));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/api/auth', authRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/establishments', establishmentsRoutes);
app.use('/api/points-of-sale', pointsOfSaleRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/control-numbers', controlNumbersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dte-json', dteJsonRoutes);
app.use('/api/dte-events', dteEventsRoutes);
app.use('/api/dte-pdf', dtePdfRoutes);
app.use('/api/emails', emailsRoutes);
app.get('/api/health', (req, res) => {

  res.set('Cache-Control', 'no-store');

  res.status(200).json({
    ok: true,
    message: 'Backend de Facturación Electrónica SV funcionando',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: 'Ruta no encontrada'
  });
});

app.use((error, req, res, next) => {
  console.error('Error global:', error);

  res.status(error.statusCode || 500).json({
    ok: false,
    message: error.message || 'Error interno del servidor'
  });
});

module.exports = app;