const fs = require('fs');
const path = require('path');

const importsService = require('./imports.service');

const getMaxUploadBytes = () => {
  const mb = Number(process.env.IMPORT_MAX_UPLOAD_MB || 250);
  const safeMb = Number.isFinite(mb) && mb > 0 ? Math.min(mb, 1024) : 250;
  return Math.floor(safeMb * 1024 * 1024);
};

const getSourceFileName = (req, fallback) => {
  const raw = req.headers['x-import-file-name'];
  if (!raw) return fallback;

  try {
    return decodeURIComponent(String(raw)).replace(/[\\/]/g, '_').slice(0, 240) || fallback;
  } catch {
    return String(raw).replace(/[\\/]/g, '_').slice(0, 240) || fallback;
  }
};

const receiveRequestToFile = async ({ req, extension }) => {
  const maxBytes = getMaxUploadBytes();
  const declaredLength = Number(req.headers['content-length'] || 0);

  if (declaredLength > maxBytes) {
    const error = new Error(`El archivo supera el límite permitido de ${Math.round(maxBytes / 1024 / 1024)} MB`);
    error.statusCode = 413;
    throw error;
  }

  const tempPath = importsService.createTempUploadPath(extension);

  await new Promise((resolve, reject) => {
    let received = 0;
    let completed = false;
    const output = fs.createWriteStream(tempPath, { flags: 'wx' });

    const finishWithError = (error) => {
      if (completed) return;
      completed = true;
      output.destroy();
      reject(error);
    };

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        const error = new Error(`El archivo supera el límite permitido de ${Math.round(maxBytes / 1024 / 1024)} MB`);
        error.statusCode = 413;
        req.unpipe(output);
        req.resume();
        finishWithError(error);
      }
    });

    req.on('aborted', () => {
      const error = new Error('La carga del archivo fue interrumpida');
      error.statusCode = 400;
      finishWithError(error);
    });

    req.on('error', finishWithError);
    output.on('error', finishWithError);
    output.on('finish', () => {
      if (completed) return;
      completed = true;
      resolve();
    });

    req.pipe(output);
  }).catch(async (error) => {
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  });

  return tempPath;
};

const getCompanyId = (req) => Number(req.user?.company?.id);

const getSummary = async (req, res, next) => {
  try {
    const summary = await importsService.getImportSummary({ companyId: getCompanyId(req) });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
};

const importCustomers = async (req, res, next) => {
  let tempPath;
  try {
    tempPath = await receiveRequestToFile({ req, extension: '.csv' });
    const csvText = await fs.promises.readFile(tempPath, 'utf8');
    const result = await importsService.importCustomersCsv({
      companyId: getCompanyId(req),
      establishmentId: Number(req.query.establishmentId),
      csvText
    });

    res.status(200).json({
      ok: true,
      message: 'Clientes importados correctamente',
      result
    });
  } catch (error) {
    next(error);
  } finally {
    if (tempPath) await fs.promises.rm(tempPath, { force: true });
  }
};

const importProducts = async (req, res, next) => {
  let tempPath;
  try {
    tempPath = await receiveRequestToFile({ req, extension: '.csv' });
    const csvText = await fs.promises.readFile(tempPath, 'utf8');
    const result = await importsService.importProductsCsv({
      companyId: getCompanyId(req),
      establishmentId: Number(req.query.establishmentId),
      csvText
    });

    res.status(200).json({
      ok: true,
      message: 'Productos y servicios importados correctamente',
      result
    });
  } catch (error) {
    next(error);
  } finally {
    if (tempPath) await fs.promises.rm(tempPath, { force: true });
  }
};

const importDocuments = async (req, res, next) => {
  let tempPath;
  try {
    tempPath = await receiveRequestToFile({ req, extension: '.zip' });
    const result = await importsService.importDteZip({
      companyId: getCompanyId(req),
      adminUserId: req.user.id,
      zipPath: tempPath,
      sourceFileName: getSourceFileName(req, path.basename(tempPath))
    });

    res.status(200).json({
      ok: true,
      message: 'Documentos históricos importados correctamente',
      result
    });
  } catch (error) {
    next(error);
  } finally {
    if (tempPath) await fs.promises.rm(tempPath, { force: true });
  }
};

module.exports = {
  getSummary,
  importCustomers,
  importProducts,
  importDocuments
};
