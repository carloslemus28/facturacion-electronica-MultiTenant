const User = require('./user.model');
const Role = require('./role.model');
const Permission = require('./permission.model');
const RefreshToken = require('../auth/refresh-token.model');
const Company = require('../companies/company.model');
const CompanyCredential = require('../companies/company-credential.model');
const Establishment = require('../companies/establishment.model');
const PointOfSale = require('../companies/point-of-sale.model');
const ControlNumber = require('../dte/control-number.model');
const Customer = require('../customers/customer.model');
const Product = require('../products/product.model');
const Invoice = require('../invoices/invoice.model');
const InvoiceItem = require('../invoices/invoice-item.model');
const InvoiceImportArtifact = require('../imports/invoice-import-artifact.model');

const applyUserAssociations = () => {
  User.belongsToMany(Role, {
    through: 'user_roles',
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'roles'
  });

  Role.belongsToMany(User, {
    through: 'user_roles',
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'users'
  });

  Role.belongsToMany(Permission, {
    through: 'role_permissions',
    foreignKey: 'role_id',
    otherKey: 'permission_id',
    as: 'permissions'
  });

  Permission.belongsToMany(Role, {
    through: 'role_permissions',
    foreignKey: 'permission_id',
    otherKey: 'role_id',
    as: 'roles'
  });

  User.hasMany(RefreshToken, {
    foreignKey: {
      name: 'userId',
      field: 'user_id',
      allowNull: false
    },
    as: 'refreshTokens'
  });

  RefreshToken.belongsTo(User, {
    foreignKey: {
      name: 'userId',
      field: 'user_id',
      allowNull: false
    },
    as: 'user'
  });


  Company.hasOne(CompanyCredential, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'credentials'
  });

  CompanyCredential.belongsTo(Company, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'company'
  });

  Company.hasMany(User, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: true
    },
    as: 'tenantUsers'
  });

  User.belongsTo(Company, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: true
    },
    as: 'tenantCompany'
  });

  Company.hasMany(Establishment, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'establishments'
  });

  Establishment.belongsTo(Company, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'company'
  });

  Company.hasMany(PointOfSale, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'pointsOfSale'
  });

  PointOfSale.belongsTo(Company, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'company'
  });

  Establishment.hasMany(PointOfSale, {
    foreignKey: {
      name: 'establishmentId',
      field: 'establishment_id',
      allowNull: false
    },
    as: 'pointsOfSale'
  });

  PointOfSale.belongsTo(Establishment, {
    foreignKey: {
      name: 'establishmentId',
      field: 'establishment_id',
      allowNull: false
    },
    as: 'establishment'
  });

  Company.hasMany(Customer, {
    foreignKey: { name: 'companyId', field: 'company_id', allowNull: false },
    as: 'customers'
  });

  Customer.belongsTo(Company, {
    foreignKey: { name: 'companyId', field: 'company_id', allowNull: false },
    as: 'company'
  });

  Establishment.hasMany(Customer, {
    foreignKey: {
      name: 'establishmentId',
      field: 'establishment_id',
      allowNull: false
    },
    as: 'customers'
  });

  Customer.belongsTo(Establishment, {
    foreignKey: {
      name: 'establishmentId',
      field: 'establishment_id',
      allowNull: false
    },
    as: 'establishment'
  });

  Company.hasMany(Product, {
    foreignKey: { name: 'companyId', field: 'company_id', allowNull: false },
    as: 'products'
  });

  Product.belongsTo(Company, {
    foreignKey: { name: 'companyId', field: 'company_id', allowNull: false },
    as: 'company'
  });

  Establishment.hasMany(Product, {
    foreignKey: {
      name: 'establishmentId',
      field: 'establishment_id',
      allowNull: false
    },
    as: 'products'
  });

  Product.belongsTo(Establishment, {
    foreignKey: {
      name: 'establishmentId',
      field: 'establishment_id',
      allowNull: false
    },
    as: 'establishment'
  });

  PointOfSale.hasMany(User, {
    foreignKey: {
      name: 'pointOfSaleId',
      field: 'point_of_sale_id',
      allowNull: true
    },
    as: 'users'
  });

  User.belongsTo(PointOfSale, {
    foreignKey: {
      name: 'pointOfSaleId',
      field: 'point_of_sale_id',
      allowNull: true
    },
    as: 'pointOfSale'
  });

  Company.hasMany(ControlNumber, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'controlNumbers'
  });

  ControlNumber.belongsTo(Company, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'company'
  });

  Company.hasMany(Invoice, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'invoices'
  });

  Invoice.belongsTo(Company, {
    foreignKey: {
      name: 'companyId',
      field: 'company_id',
      allowNull: false
    },
    as: 'company'
  });

  PointOfSale.hasMany(Invoice, {
    foreignKey: {
      name: 'pointOfSaleId',
      field: 'point_of_sale_id',
      allowNull: false
    },
    as: 'invoices'
  });

  Invoice.belongsTo(PointOfSale, {
    foreignKey: {
      name: 'pointOfSaleId',
      field: 'point_of_sale_id',
      allowNull: false
    },
    as: 'pointOfSale'
  });

  User.hasMany(Invoice, {
    foreignKey: {
      name: 'userId',
      field: 'user_id',
      allowNull: false
    },
    as: 'invoices'
  });

  Invoice.belongsTo(User, {
    foreignKey: {
      name: 'userId',
      field: 'user_id',
      allowNull: false
    },
    as: 'user'
  });

  Customer.hasMany(Invoice, {
    foreignKey: {
      name: 'customerId',
      field: 'customer_id',
      allowNull: true
    },
    as: 'invoices'
  });

  Invoice.belongsTo(Customer, {
    foreignKey: {
      name: 'customerId',
      field: 'customer_id',
      allowNull: true
    },
    as: 'customer'
  });

  Invoice.hasOne(InvoiceImportArtifact, {
    foreignKey: {
      name: 'invoiceId',
      field: 'invoice_id',
      allowNull: false
    },
    as: 'importArtifact'
  });

  InvoiceImportArtifact.belongsTo(Invoice, {
    foreignKey: {
      name: 'invoiceId',
      field: 'invoice_id',
      allowNull: false
    },
    as: 'invoice'
  });

  Invoice.hasMany(InvoiceItem, {
    foreignKey: {
      name: 'invoiceId',
      field: 'invoice_id',
      allowNull: false
    },
    as: 'items'
  });

  InvoiceItem.belongsTo(Invoice, {
    foreignKey: {
      name: 'invoiceId',
      field: 'invoice_id',
      allowNull: false
    },
    as: 'invoice'
  });

  Product.hasMany(InvoiceItem, {
    foreignKey: {
      name: 'productId',
      field: 'product_id',
      allowNull: true
    },
    as: 'invoiceItems'
  });

  InvoiceItem.belongsTo(Product, {
    foreignKey: {
      name: 'productId',
      field: 'product_id',
      allowNull: true
    },
    as: 'product'
  });
};

module.exports = applyUserAssociations;