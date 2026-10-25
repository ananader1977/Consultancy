import fs from 'node:fs';
import { Pdf, PAGE_W } from './pdf.js';
import { decodePng } from './png.js';
import { fmtDate, money, fmtStamp } from './time.js';

const TEAL = '#5b4a8a'; // brand purple (from the logo)
let LOGO;
function logo() {
  if (LOGO === undefined) {
    try { LOGO = decodePng(fs.readFileSync(new URL('../public/logo.png', import.meta.url))); }
    catch { LOGO = null; }
  }
  return LOGO;
}
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#d1d5db';

/** Render a UAE tax invoice (or tax credit note) as a PDF buffer. */
export function renderInvoicePdf(inv, { creditNote = false, contact = null } = {}) {
  const docNo = creditNote ? inv.credit_note_number : inv.number;
  const docDate = creditNote ? inv.credit_note_at : inv.issued_at;
  const pdf = new Pdf({ title: `${creditNote ? 'Tax Credit Note' : 'Tax Invoice'} ${docNo}`, author: inv.supplier_name });
  const L = 45;
  const R = PAGE_W - 45;
  const sign = creditNote ? -1 : 1;

  const lg = logo();
  const nameX = lg ? L + 66 : L;
  if (lg) pdf.image(lg, L, 26, 56, 56);
  let nameSize = 15;
  let nameLines = pdf.wrap(inv.supplier_name, R - 175 - nameX, nameSize, true);
  if (nameLines.length > 2) { nameSize = 12; nameLines = pdf.wrap(inv.supplier_name, R - 175 - nameX, nameSize, true); }
  nameLines = nameLines.slice(0, 3);
  const lh = nameSize + 2;
  const nameTop = nameLines.length > 2 ? 38 : nameLines.length > 1 ? 44 : 50;
  nameLines.forEach((t, i) => pdf.text(t, nameX, nameTop + i * lh, { size: nameSize, bold: true, fill: INK }));
  pdf.text(inv.supplier_trn ? `TRN: ${inv.supplier_trn}` : 'TRN: -', nameX, nameTop + (nameLines.length - 1) * lh + 15, { size: 10, fill: MUTED });
  pdf.text(creditNote ? 'TAX CREDIT NOTE' : 'TAX INVOICE', R, 50, { size: 20, bold: true, align: 'right', fill: TEAL });
  pdf.text(`No. ${docNo}`, R, 68, { size: 11, bold: true, align: 'right', fill: INK });
  pdf.rect(L, 100, R - L, 3, { fill: TEAL });

  let y = 130;
  pdf.text('FROM', L, y, { size: 8, bold: true, fill: MUTED });
  pdf.text('BILL TO', 310, y, { size: 8, bold: true, fill: MUTED });
  y += 14;
  const contactLines = contact ? [contact.contact_phone && `Tel: ${contact.contact_phone}`, contact.contact_email && `Email: ${contact.contact_email}`].filter(Boolean) : [];
  const nameRows = pdf.wrap(inv.supplier_name, 240, 10, true);
  const from = [...nameRows, ...(inv.supplier_address ? pdf.wrap(inv.supplier_address, 240, 10) : []), ...contactLines];
  const to = [inv.customer_name, inv.customer_email, inv.customer_mobile].filter(Boolean);
  from.forEach((t, i) => pdf.text(t, L, y + i * 13, { size: 10, bold: i < nameRows.length, fill: INK }));
  to.forEach((t, i) => pdf.text(t, 310, y + i * 13, { size: 10, bold: i === 0, fill: INK }));
  y += Math.max(from.length, to.length) * 13 + 16;

  const meta = [
    [creditNote ? 'Credit note date' : 'Invoice date', fmtDate(docDate)],
    ...(creditNote ? [['Original invoice', `${inv.number} (${fmtDate(inv.issued_at)})`]] : []),
    ['Booking reference', inv.reference || '-'],
    ['Appointment', inv.appointment_text || '-'],
    ['Payment', inv.payment_ref ? `Card - ${inv.payment_ref}` : 'Card'],
  ];
  pdf.rect(L, y, R - L, meta.length * 17 + 12, { fill: '#f3f4f6' });
  meta.forEach(([k, v], i) => {
    pdf.text(k, L + 12, y + 20 + i * 17, { size: 9, fill: MUTED });
    pdf.text(v, L + 140, y + 20 + i * 17, { size: 10, fill: INK });
  });
  y += meta.length * 17 + 36;

  // line table
  const cols = { desc: L + 8, net: 380, vat: 450, total: R - 8 };
  pdf.rect(L, y, R - L, 24, { fill: TEAL });
  pdf.text('Description', cols.desc, y + 16, { size: 9, bold: true, fill: '#ffffff' });
  pdf.text('Net (AED)', cols.net, y + 16, { size: 9, bold: true, align: 'right', fill: '#ffffff' });
  pdf.text('VAT (AED)', cols.vat + 20, y + 16, { size: 9, bold: true, align: 'right', fill: '#ffffff' });
  pdf.text('Total (AED)', cols.total, y + 16, { size: 9, bold: true, align: 'right', fill: '#ffffff' });
  y += 24;
  const descLines = pdf.wrap(creditNote ? `Credit for: ${inv.description}` : inv.description, 290, 10);
  const rowH = Math.max(34, descLines.length * 13 + 16);
  descLines.forEach((t, i) => pdf.text(t, cols.desc, y + 20 + i * 13, { size: 10, fill: INK }));
  pdf.text(money(sign * inv.net), cols.net, y + 20, { size: 10, align: 'right', fill: INK });
  pdf.text(money(sign * inv.vat), cols.vat + 20, y + 20, { size: 10, align: 'right', fill: INK });
  pdf.text(money(sign * inv.total), cols.total, y + 20, { size: 10, align: 'right', fill: INK });
  y += rowH;
  pdf.line(L, y, R, y, { stroke: LINE });

  y += 26;
  const label = (t, v, bold = false) => {
    pdf.text(t, 380, y, { size: bold ? 12 : 10, bold, fill: bold ? TEAL : INK });
    pdf.text(v, R - 8, y, { size: bold ? 12 : 10, bold, align: 'right', fill: bold ? TEAL : INK });
    y += bold ? 22 : 18;
  };
  label('Subtotal (excl. VAT)', money(sign * inv.net));
  label(`VAT ${inv.vat_rate}%`, money(sign * inv.vat));
  pdf.line(380, y - 10, R, y - 10, { stroke: LINE });
  label(`Total (AED)`, money(sign * inv.total), true);

  y += 24;
  const via = /^MANUAL-bank_transfer/.test(inv.payment_ref || '') ? 'bank transfer' : /^MANUAL-cash/.test(inv.payment_ref || '') ? 'cash' : 'card';
  pdf.text(creditNote ? `This tax credit note reverses the invoice above as the payment was returned${via === 'card' ? ' to the original card' : ''}.` : `Paid in full ${via === 'cash' ? 'in cash' : `by ${via}`}. Thank you.`, L, y, { size: 10, fill: INK });
  pdf.line(L, 780, R, 780, { stroke: LINE });
  pdf.text(inv.supplier_name, PAGE_W / 2, 795, { size: 8, bold: true, align: 'center', fill: MUTED });
  const contactFoot = contact ? [contact.contact_phone, contact.contact_email, contact.facebook && `instagram.com/${contact.facebook}`].filter(Boolean).join('  |  ') : '';
  if (contactFoot) pdf.text(contactFoot, PAGE_W / 2, 807, { size: 8, align: 'center', fill: MUTED });
  pdf.text(`Computer-generated document, no signature required. Generated ${fmtStamp(Date.now())} (Dubai time).`, PAGE_W / 2, contactFoot ? 819 : 807, { size: 7.5, align: 'center', fill: MUTED });
  return pdf.toBuffer();
}
