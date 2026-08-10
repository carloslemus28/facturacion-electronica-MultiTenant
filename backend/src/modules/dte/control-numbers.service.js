const { QueryTypes } = require('sequelize');

const { sequelize } = require('../../config/database');

const Company = require('../companies/company.model');
const Establishment = require('../companies/establishment.model');
const PointOfSale = require('../companies/point-of-sale.model');
const ControlNumber = require('./control-number.model');

const MAX_CONTROL_SEQUENCE = 999999999999999;

const DOCUMENT_TYPES = {
  FE: '01',
  CCF: '03',
  NR: '04',
  NC: '05',
  ND: '06',
  CRE: '07',
  CLE: '08',
  DCL: '09',
  FEX: '11',
  FSE: '14',
  CD: '15'
};

const getCurrentYear = () => {
  const timeZone = process.env.APP_TIMEZONE || 'America/El_Salvador';

  const year = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric'
  }).format(new Date());

  return Number(year);
};

const padSequence = (sequence) => {
  return String(sequence).padStart(15, '0');
};

const normalizeDocumentTypeCode = (value) => {
  return String(value || '').trim().padStart(2, '0');
};

const validateDocumentTypeCode = (value) => {
  const documentTypeCode = normalizeDocumentTypeCode(value);

  if (!Object.values(DOCUMENT_TYPES).includes(documentTypeCode)) {
    const error = new Error('Tipo de documento electrónico no permitido');
    error.statusCode = 400;
    throw error;
  }

  return documentTypeCode;
};

const normalizeYear = (value = getCurrentYear()) => {
  const year = Number.parseInt(value, 10);

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    const error = new Error('El año del correlativo no es válido');
    error.statusCode = 400;
    throw error;
  }

  return year;
};

const normalizeSequence = (value, fieldName = 'El último correlativo') => {
  const rawValue = String(value ?? '').trim();

  if (!/^\d+$/.test(rawValue)) {
    const error = new Error(`${fieldName} debe ser un número entero sin letras, signos ni decimales`);
    error.statusCode = 400;
    throw error;
  }

  const sequence = Number(rawValue);

  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > MAX_CONTROL_SEQUENCE) {
    const error = new Error(`${fieldName} debe estar entre 0 y ${MAX_CONTROL_SEQUENCE}`);
    error.statusCode = 400;
    throw error;
  }

  return sequence;
};

const buildControlNumber = ({
  documentTypeCode,
  establishmentCode,
  pointOfSaleCode,
  sequence
}) => {
  return `DTE-${documentTypeCode}-${establishmentCode}${pointOfSaleCode}-${padSequence(sequence)}`;
};

const getDocumentTypes = () => {
  return DOCUMENT_TYPES;
};

const getPointOfSaleWithEstablishment = async ({ companyId, pointOfSaleId, transaction = null }) => {
  const pointOfSale = await PointOfSale.findOne({
    where: { id: pointOfSaleId, companyId },
    include: [
      {
        model: Establishment,
        as: 'establishment'
      }
    ],
    transaction
  });

  if (!pointOfSale) {
    const error = new Error('Punto de venta no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (!pointOfSale.establishment) {
    const error = new Error('El punto de venta no tiene establecimiento o sucursal asignada');
    error.statusCode = 400;
    throw error;
  }

  return pointOfSale;
};

const getMaxIssuedSequence = async ({
  companyId,
  pointOfSaleId,
  documentTypeCode,
  establishmentCode,
  pointOfSaleCode,
  year,
  transaction = null
}) => {
  const controlPrefix = `DTE-${documentTypeCode}-${establishmentCode}${pointOfSaleCode}-%`;
  const startDate = `${year}-01-01 00:00:00`;
  const endDate = `${year + 1}-01-01 00:00:00`;

  const [result] = await sequelize.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(control_number, '-', -1) AS UNSIGNED)), 0) AS maxSequence
       FROM invoices
      WHERE company_id = :companyId
        AND point_of_sale_id = :pointOfSaleId
        AND document_type_code = :documentTypeCode
        AND control_number LIKE :controlPrefix
        AND issued_at >= :startDate
        AND issued_at < :endDate`,
    {
      replacements: {
        companyId,
        pointOfSaleId,
        documentTypeCode,
        controlPrefix,
        startDate,
        endDate
      },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  return Number(result?.maxSequence || 0);
};

const previewNextControlNumber = async ({
  companyId,
  pointOfSaleId,
  documentTypeCode,
  year = getCurrentYear()
}) => {
  const normalizedDocumentTypeCode = validateDocumentTypeCode(documentTypeCode);
  const normalizedYear = normalizeYear(year);
  const company = await Company.findByPk(companyId);

  if (!company) {
    const error = new Error('Empresa emisora no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const pointOfSale = await getPointOfSaleWithEstablishment({
    companyId,
    pointOfSaleId
  });

  if (Number(pointOfSale.companyId) !== Number(companyId)) {
    const error = new Error('El punto de venta no pertenece a la empresa emisora indicada');
    error.statusCode = 403;
    throw error;
  }

  const establishmentCode = pointOfSale.establishment.establishmentCode;
  const pointOfSaleCode = pointOfSale.code;

  const control = await ControlNumber.findOne({
    where: {
      companyId,
      year: normalizedYear,
      documentTypeCode: normalizedDocumentTypeCode,
      establishmentCode,
      pointOfSaleCode
    }
  });

  const nextSequence = control ? Number(control.currentSequence) + 1 : 1;

  return {
    year: normalizedYear,
    documentTypeCode: normalizedDocumentTypeCode,
    establishmentCode,
    pointOfSaleCode,
    nextSequence,
    controlNumber: buildControlNumber({
      documentTypeCode: normalizedDocumentTypeCode,
      establishmentCode,
      pointOfSaleCode,
      sequence: nextSequence
    })
  };
};

const generateNextControlNumber = async ({
  companyId,
  pointOfSaleId,
  documentTypeCode,
  year = getCurrentYear()
}) => {
  const normalizedDocumentTypeCode = validateDocumentTypeCode(documentTypeCode);
  const normalizedYear = normalizeYear(year);
  return sequelize.transaction(async (transaction) => {
    const company = await Company.findByPk(companyId, { transaction });

    if (!company) {
      const error = new Error('Empresa emisora no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const pointOfSale = await getPointOfSaleWithEstablishment({
      companyId,
      pointOfSaleId,
      transaction
    });

    if (Number(pointOfSale.companyId) !== Number(companyId)) {
      const error = new Error('El punto de venta no pertenece a la empresa emisora indicada');
      error.statusCode = 403;
      throw error;
    }

    const establishmentCode = pointOfSale.establishment.establishmentCode;
    const pointOfSaleCode = pointOfSale.code;

    const [control] = await ControlNumber.findOrCreate({
      where: {
        companyId,
        year: normalizedYear,
        documentTypeCode: normalizedDocumentTypeCode,
        establishmentCode,
        pointOfSaleCode
      },
      defaults: {
        companyId,
        year: normalizedYear,
        documentTypeCode: normalizedDocumentTypeCode,
        establishmentCode,
        pointOfSaleCode,
        currentSequence: 0
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    const nextSequence = Number(control.currentSequence) + 1;

    await control.update({
      currentSequence: nextSequence
    }, { transaction });

    return {
      year: normalizedYear,
      documentTypeCode: normalizedDocumentTypeCode,
      establishmentCode,
      pointOfSaleCode,
      sequence: nextSequence,
      controlNumber: buildControlNumber({
        documentTypeCode: normalizedDocumentTypeCode,
        establishmentCode,
        pointOfSaleCode,
        sequence: nextSequence
      })
    };
  });
};

const listControlNumbers = async ({ companyId = '', year = '' } = {}) => {
  const where = {};

  if (companyId) {
    where.companyId = companyId;
  }

  if (year) {
    where.year = normalizeYear(year);
  }

  const controls = await ControlNumber.findAll({
    where,
    include: [
      {
        model: Company,
        as: 'company',
        attributes: ['id', 'nit', 'legalName', 'commercialName']
      }
    ],
    order: [
      ['year', 'DESC'],
      ['documentTypeCode', 'ASC'],
      ['establishmentCode', 'ASC'],
      ['pointOfSaleCode', 'ASC']
    ]
  });

  return controls.map((control) => {
    const plainControl = control.toJSON();
    const currentSequence = Number(plainControl.currentSequence || 0);
    const nextSequence = currentSequence + 1;

    return {
      ...plainControl,
      currentSequence,
      nextSequence,
      currentControlNumber: currentSequence > 0
        ? buildControlNumber({
            documentTypeCode: plainControl.documentTypeCode,
            establishmentCode: plainControl.establishmentCode,
            pointOfSaleCode: plainControl.pointOfSaleCode,
            sequence: currentSequence
          })
        : null,
      nextControlNumber: buildControlNumber({
        documentTypeCode: plainControl.documentTypeCode,
        establishmentCode: plainControl.establishmentCode,
        pointOfSaleCode: plainControl.pointOfSaleCode,
        sequence: nextSequence
      })
    };
  });
};

const setLastControlSequence = async ({
  companyId,
  pointOfSaleId,
  documentTypeCode,
  year = getCurrentYear(),
  lastSequence
}) => {
  const normalizedDocumentTypeCode = validateDocumentTypeCode(documentTypeCode);
  const normalizedYear = normalizeYear(year);
  const normalizedLastSequence = normalizeSequence(lastSequence);

  return sequelize.transaction(async (transaction) => {
    const company = await Company.findByPk(companyId, { transaction });

    if (!company) {
      const error = new Error('Empresa emisora no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const pointOfSale = await getPointOfSaleWithEstablishment({
      companyId,
      pointOfSaleId,
      transaction
    });

    if (Number(pointOfSale.companyId) !== Number(companyId)) {
      const error = new Error('El punto de venta no pertenece a la empresa emisora indicada');
      error.statusCode = 403;
      throw error;
    }

    const establishmentCode = pointOfSale.establishment.establishmentCode;
    const pointOfSaleCode = pointOfSale.code;

    const maxIssuedSequence = await getMaxIssuedSequence({
      companyId,
      pointOfSaleId,
      documentTypeCode: normalizedDocumentTypeCode,
      establishmentCode,
      pointOfSaleCode,
      year: normalizedYear,
      transaction
    });

    if (normalizedLastSequence < maxIssuedSequence) {
      const error = new Error(
        `No puede establecer ${normalizedLastSequence} porque ya existe al menos un DTE emitido con correlativo ${maxIssuedSequence} para este tipo, año y punto de venta.`
      );
      error.statusCode = 409;
      throw error;
    }

    const [control] = await ControlNumber.findOrCreate({
      where: {
        companyId,
        year: normalizedYear,
        documentTypeCode: normalizedDocumentTypeCode,
        establishmentCode,
        pointOfSaleCode
      },
      defaults: {
        companyId,
        year: normalizedYear,
        documentTypeCode: normalizedDocumentTypeCode,
        establishmentCode,
        pointOfSaleCode,
        currentSequence: normalizedLastSequence
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (Number(control.currentSequence) !== normalizedLastSequence) {
      await control.update({
        currentSequence: normalizedLastSequence
      }, { transaction });
    }

    const nextSequence = normalizedLastSequence + 1;

    return {
      id: control.id,
      companyId: Number(companyId),
      year: normalizedYear,
      documentTypeCode: normalizedDocumentTypeCode,
      establishmentCode,
      pointOfSaleCode,
      currentSequence: normalizedLastSequence,
      maxIssuedSequence,
      nextSequence,
      currentControlNumber: normalizedLastSequence > 0
        ? buildControlNumber({
            documentTypeCode: normalizedDocumentTypeCode,
            establishmentCode,
            pointOfSaleCode,
            sequence: normalizedLastSequence
          })
        : null,
      nextControlNumber: buildControlNumber({
        documentTypeCode: normalizedDocumentTypeCode,
        establishmentCode,
        pointOfSaleCode,
        sequence: nextSequence
      })
    };
  });
};

module.exports = {
  DOCUMENT_TYPES,
  getDocumentTypes,
  previewNextControlNumber,
  generateNextControlNumber,
  listControlNumbers,
  setLastControlSequence
};