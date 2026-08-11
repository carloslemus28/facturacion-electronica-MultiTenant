const fs = require('fs');
const path = require('path');

const DEFAULT_STORAGE_DIR = process.env.NODE_ENV === 'production'
  ? '/data/imported-dtes'
  : path.join(process.cwd(), 'data', 'imported-dtes');

const getImportStorageDir = () => path.resolve(
  process.env.IMPORT_STORAGE_DIR || DEFAULT_STORAGE_DIR
);

const ensureImportStorageDir = async () => {
  const storageDir = getImportStorageDir();
  await fs.promises.mkdir(storageDir, { recursive: true });
  return storageDir;
};

const resolveStoredArtifactPath = (relativePath) => {
  if (!relativePath) return null;

  const storageDir = getImportStorageDir();
  const resolved = path.resolve(storageDir, relativePath);
  const prefix = storageDir.endsWith(path.sep) ? storageDir : `${storageDir}${path.sep}`;

  if (resolved !== storageDir && !resolved.startsWith(prefix)) {
    const error = new Error('Ruta de archivo importado no válida');
    error.statusCode = 500;
    throw error;
  }

  return resolved;
};

module.exports = {
  getImportStorageDir,
  ensureImportStorageDir,
  resolveStoredArtifactPath
};
