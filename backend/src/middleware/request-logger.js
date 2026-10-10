import { randomUUID } from 'node:crypto';

export function requestLogger(req, res, next) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    const route = req.baseUrl && req.route?.path ? `${req.baseUrl}${req.route.path}` : req.route?.path || 'unmatched';
    console.info(JSON.stringify({
      level: 'info', event: 'http_request', requestId,
      method: req.method, route, status: res.statusCode, durationMs: Date.now() - startedAt,
    }));
  });
  next();
}
