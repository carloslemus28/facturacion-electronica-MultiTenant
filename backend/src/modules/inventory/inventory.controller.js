const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const inventoryService = require('./inventory.service');

const listMovements = async (req, res, next) => {
  try {
    const result = await inventoryService.listMovements({
      user: req.user,
      query: req.query
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getSummary = async (req, res, next) => {
  try {
    const summary = await inventoryService.getInventorySummary({
      user: req.user,
      query: req.query
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
};

const registerProductEntry = async (req, res, next) => {
  try {
    const result = await inventoryService.registerProductEntry({
      user: req.user,
      data: req.body
    });

    res.status(201).json({
      ok: true,
      message: 'Entrada de inventario registrada correctamente',
      result
    });
  } catch (error) {
    next(error);
  }
};

const registerProductEntries = async (req, res, next) => {
  try {
    const results = await inventoryService.registerProductEntries({
      user: req.user,
      entries: req.body?.entries
    });

    res.status(201).json({
      ok: true,
      message: `${results.length} entrada(s) de inventario registrada(s) correctamente`,
      count: results.length,
      results
    });
  } catch (error) {
    next(error);
  }
};

const buildKardexDownloadFileName = (query = {}) => {
  const startDate = String(query.startDate || 'inicio').replace(/[^0-9A-Za-z_-]/g, '');
  const endDate = String(query.endDate || 'actual').replace(/[^0-9A-Za-z_-]/g, '');
  return `kardex-tienda-${startDate}-${endDate}.xlsx`;
};

const downloadKardex = async (req, res, next) => {
  let tempFilePath = null;

  try {
    const fileName = buildKardexDownloadFileName(req.query);
    tempFilePath = path.join(
      os.tmpdir(),
      `kardex-${Date.now()}-${Math.random().toString(16).slice(2)}.xlsx`
    );

    await inventoryService.streamKardexWorkbook({
      user: req.user,
      query: req.query,
      filePath: tempFilePath
    });

    if (req.destroyed || res.destroyed) {
      await fs.unlink(tempFilePath).catch(() => {});
      tempFilePath = null;
      return;
    }

    const stats = await fs.stat(tempFilePath);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader('Content-Length', String(stats.size));
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.status(200);

    const fileToSend = tempFilePath;
    tempFilePath = null;

    res.sendFile(fileToSend, async (error) => {
      await fs.unlink(fileToSend).catch(() => {});

      if (!error) return;
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      next(error);
    });
  } catch (error) {
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }

    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    next(error);
  }
};

module.exports = {
  listMovements,
  getSummary,
  registerProductEntry,
  registerProductEntries,
  downloadKardex
};
