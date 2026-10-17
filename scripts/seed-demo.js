// Fills the database with a few demo bookings (mock payments only). Usage: npm run seed-demo
import { loadConfig } from '../src/config.js';
import { createContext } from '../src/app.js';
const config = { ...loadConfig(), paymentProvider: 'mock', jobs: false };
const ctx = createContext({ config });
const slots = ctx.db.prepare('SELECT id FROM slots WHERE start_ts>? ORDER BY start_ts LIMIT 12').all(Date.now() + 26 * 3600e3);
const people = [['Aisha Khan', '+971501110001'], ['Omar Hassan', '+971501110002'], ['Sara Ali', '+971501110003'], ['John Smith', '+971501110004']];
let i = 0;
for (const [name, mobile] of people) {
  const { booking } = await ctx.service.createBooking({ name, mobile, email: `${name.split(' ')[0].toLowerCase()}@example.com`, serviceId: (i % 2) + 1, platform: 'Zoom', slotId: slots[i * 2].id }, { skipCheckout: true });
  if (i < 3) await ctx.service.markPaidManually(booking.id, 'seed');
  i++;
}
await ctx.flush();
console.log('Demo bookings created.');
