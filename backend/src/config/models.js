const User = require('../modules/users/user.model');
const Role = require('../modules/users/role.model');
const Permission = require('../modules/users/permission.model');
const RefreshToken = require('../modules/auth/refresh-token.model');
const Company = require('../modules/companies/company.model');
const CompanyCredential = require('../modules/companies/company-credential.model');
const PointOfSale = require('../modules/companies/point-of-sale.model');
const ControlNumber = require('../modules/dte/control-number.model');
const Customer = require('../modules/customers/customer.model');
const Product = require('../modules/products/product.model');
const Invoice = require('../modules/invoices/invoice.model');
const InvoiceItem = require('../modules/invoices/invoice-item.model');
const InvoiceImportArtifact = require('../modules/imports/invoice-import-artifact.model');

const applyUserAssociations = require('../modules/users/user.associations');

let modelsLoaded = false;

const loadModels = () => {
  if (!modelsLoaded) {
    applyUserAssociations();
    modelsLoaded = true;
  }

  return {
    User,
    Role,
    Permission,
    RefreshToken,
    Company,
    CompanyCredential,
    PointOfSale,
    ControlNumber,
    Customer,
    Product,
    Invoice,
    InvoiceItem,
    InvoiceImportArtifact
  };
};

module.exports = loadModels;