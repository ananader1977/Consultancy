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
    // 'ziina' or 'stripe' for real card payments, 'mock' for a built-in demo checkout (never use mock in production)
    paymentProvider: (env.PAYMENT_PROVIDER || 'mock').toLowerCase(),
    allowMockInProduction: env.ALLOW_MOCK_PAYMENTS === 'true',
    ziina: {
      apiKey: (env.ZIINA_API_KEY || '').trim(),
      webhookSecret: (env.ZIINA_WEBHOOK_SECRET || '').trim(),
      test: env.ZIINA_TEST === 'true', // test payments: nothing is charged
      baseUrl: env.ZIINA_API_BASE || 'https://api-v2.ziina.com/api',
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    },
    smtp: {
      host: (env.SMTP_HOST || '').trim(),
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true', // true = implicit TLS (port 465)
      user: (env.SMTP_USER || '').trim(),
      pass: (env.SMTP_PASS || '').replace(/\s+/g, ''), // Gmail app passwords are shown with spaces
      from: env.SMTP_FROM || '',
      rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED !== 'false',
    },
    whatsapp: {
      token: env.WHATSAPP_TOKEN || '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      templateConfirm: env.WHATSAPP_TEMPLATE_CONFIRMATION || 'booking_confirmation',
      templateUpdate: env.WHATSAPP_TEMPLATE_UPDATE || 'booking_update',
      templatePayment: env.WHATSAPP_TEMPLATE_PAYMENT || 'payment_link',
      logWhenOff: env.WHATSAPP_LOG_UNCONFIGURED === 'true',
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
  if (!['mock', 'stripe', 'ziina'].includes(cfg.paymentProvider)) {
    problems.push(`PAYMENT_PROVIDER must be "ziina", "stripe" or "mock" (got "${cfg.paymentProvider}")`);
  }
  if (cfg.paymentProvider === 'stripe' && !cfg.stripe.secretKey) problems.push('STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe');
  if (cfg.paymentProvider === 'ziina' && !cfg.ziina.apiKey) problems.push('ZIINA_API_KEY is required when PAYMENT_PROVIDER=ziina');
  if (cfg.paymentProvider === 'ziina' && !cfg.ziina.webhookSecret) problems.push('ZIINA_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=ziina (any long random text)');
  if (cfg.paymentProvider === 'mock' && cfg.nodeEnv === 'production' && !cfg.allowMockInProduction) {
    problems.push('PAYMENT_PROVIDER=mock is for demos only and would accept bookings without real payment. Set PAYMENT_PROVIDER=stripe (or ALLOW_MOCK_PAYMENTS=true to override knowingly).');
  }
  return problems;
}
