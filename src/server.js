import { loadConfig, validateConfig } from './config.js';
import { createContext, createWebApp, startJobs } from './app.js';

const config = loadConfig();
const problems = validateConfig(config);
if (problems.length) {
  console.error('Configuration problems:\n - ' + problems.join('\n - '));
  process.exit(1);
}

const ctx = createContext({ config });
const app = createWebApp(ctx);
const server = app.server();
if (config.jobs) startJobs(ctx);

if (ctx.bootstrapAdmin) {
  const a = ctx.bootstrapAdmin;
  console.log('\n=== First start: admin user created ===');
  console.log(`  email:    ${a.email}`);
  console.log(a.generated ? `  password: ${a.password}   (generated - shown once, change it after signing in)` : '  password: (from ADMIN_PASSWORD)');
  console.log('=======================================\n');
}
if (config.paymentProvider === 'mock') console.warn('[warn] PAYMENT_PROVIDER=mock: payments are simulated. Use PAYMENT_PROVIDER=ziina for real card payments.');
if (config.paymentProvider === 'ziina' && config.ziina.test) console.warn('[warn] ZIINA_TEST=true: Ziina test mode, cards are not charged.');
if (!config.smtp.host) console.warn('[warn] SMTP not configured: emails are only logged to the outbox (see Admin > Messages).');

server.listen(config.port, () => console.log(`LAMA ALSAFADI RESEARCH & EXPERIMENT DEVELOPMENT ON SOCIAL SCIENCE running at ${config.baseUrl} (port ${config.port})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
