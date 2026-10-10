export function errorHandler(error, req, res, _next) {
  const status = Number(error?.status || error?.statusCode) || (error?.code === 'CORS_ORIGIN_DENIED' ? 403 : 500);
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  const code = error?.code === 'LIMIT_FILE_SIZE' ? 'UPLOAD_TOO_LARGE'
    : error?.code === 'CORS_ORIGIN_DENIED' ? 'ORIGIN_DENIED'
      : safeStatus >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST';
  console.error(JSON.stringify({ level: 'error', event: 'http_error', requestId: req.requestId, code, status: safeStatus }));
  if (res.headersSent) return;
  res.status(safeStatus).json({ error: code, requestId: req.requestId });
}
