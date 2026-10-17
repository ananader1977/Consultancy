// Runtime configuration, read from environment variables (see .env.example).
export function loadConfig(env = process.env) {
  const port = Number(env.PORT) || 3000;
  const baseUrl = (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
  const nodeEnv = env.NODE_ENV || 'development';
  return {
    nodeEnv,
    port,
    baseUrl,
    secureCookies: baseUrl.startsWith('https://'),
    dbPath: env.DB_PATH || './data/app.db',
    sessionSecret: env.SESSION_SECRET || '', // if empty, one is generated and stored in the DB
    adminEmail: env.ADMIN_EMAIL || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    // 'stripe' for real card payments, 'mock' for a built-in demo checkout (never use mock in production)
    paymentProvider: (env.PAYMENT_PROVIDER || 'mock').toLowerCase(),
    allowMockInProduction: env.ALLOW_MOCK_PAYMENTS === 'true',
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    },
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true', // true = implicit TLS (port 465)
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.SMTP_FROM || '',
      rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED !== 'false',
    },
    whatsapp: {
      token: env.WHATSAPP_TOKEN || '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      templateConfirm: env.WHATSAPP_TEMPLATE_CONFIRMATION || 'booking_confirmation',
      templateUpdate: env.WHATSAPP_TEMPLATE_UPDATE || 'booking_update',
      language: env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
      apiVersion: env.WHATSAPP_API_VERSION || 'v20.0',
      baseUrl: env.WHATSAPP_API_BASE || 'https://graph.facebook.com',
    },
    jobs: env.DISABLE_JOBS !== 'true',
    disableRateLimit: env.DISABLE_RATE_LIMIT === 'true',
    trustProxy: env.TRUST_PROXY === 'true', // honour X-Forwarded-For when behind a reverse proxy
  };
}

export function validateConfig(cfg) {
  const problems = [];
  if (cfg.paymentProvider !== 'mock' && cfg.paymentProvider !== 'stripe') {
    problems.push(`PAYMENT_PROVIDER must be "stripe" or "mock" (got "${cfg.paymentProvider}")`);
  }
  if (cfg.paymentProvider === 'stripe' && !cfg.stripe.secretKey) problems.push('STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe');
  if (cfg.paymentProvider === 'mock' && cfg.nodeEnv === 'production' && !cfg.allowMockInProduction) {
    problems.push('PAYMENT_PROVIDER=mock is for demos only and would accept bookings without real payment. Set PAYMENT_PROVIDER=stripe (or ALLOW_MOCK_PAYMENTS=true to override knowingly).');
  }
  return problems;
}
