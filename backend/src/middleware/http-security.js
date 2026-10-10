import cors from 'cors';
import helmet from 'helmet';

export function createHttpSecurity({ allowedOrigins, production = false }) {
  const securityHeaders = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"], baseUri: ["'none'"], connectSrc: ["'self'"],
        fontSrc: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"], scriptSrc: ["'none'"],
        styleSrc: ["'none'"], upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    strictTransportSecurity: production ? undefined : false,
  });
  const originAllowlist = cors({
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      if (allowedOrigins.has(origin)) return callback(null, true);
      const error = new Error('Request origin is not permitted.');
      error.code = 'CORS_ORIGIN_DENIED';
      return callback(error);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    maxAge: 600,
  });
  return [securityHeaders, originAllowlist];
}
