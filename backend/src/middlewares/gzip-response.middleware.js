const zlib = require('zlib');

const DEFAULT_MIN_SIZE_BYTES = 1024;

const getPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const shouldCompressContentType = (contentType = '') => {
  const normalized = String(contentType).toLowerCase();

  return (
    normalized.includes('application/json') ||
    normalized.includes('text/') ||
    normalized.includes('application/javascript') ||
    normalized.includes('application/xml') ||
    normalized.includes('image/svg+xml')
  );
};

const shouldSkipCompression = (req, res, body, minSizeBytes) => {
  if (!body) return true;
  if (req.method !== 'GET' && req.method !== 'HEAD') return true;
  if (!String(req.headers['accept-encoding'] || '').includes('gzip')) return true;
  if (res.getHeader('Content-Encoding')) return true;
  if (res.getHeader('Content-Disposition')) return true;
  if (res.statusCode < 200 || res.statusCode >= 300) return true;

  const contentType = res.getHeader('Content-Type') || res.getHeader('content-type') || '';
  if (!shouldCompressContentType(contentType)) return true;

  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  return buffer.length < minSizeBytes;
};

const gzipResponseMiddleware = (options = {}) => {
  const minSizeBytes = getPositiveInteger(
    process.env.HTTP_COMPRESSION_MIN_BYTES,
    options.minSizeBytes || DEFAULT_MIN_SIZE_BYTES
  );

  return (req, res, next) => {
    const originalSend = res.send.bind(res);

    res.send = (body) => {
      if (shouldSkipCompression(req, res, body, minSizeBytes)) {
        return originalSend(body);
      }

      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      const compressed = zlib.gzipSync(buffer, {
        level: zlib.constants.Z_BEST_SPEED
      });

      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.removeHeader('Content-Length');

      return originalSend(compressed);
    };

    next();
  };
};

module.exports = gzipResponseMiddleware;
