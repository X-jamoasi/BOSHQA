import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const money = new Intl.NumberFormat('uz-UZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock = new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent', dateStyle: 'short', timeStyle: 'short' });
const amount = value => value == null ? '—' : money.format(value);

export function orderNumber(number) {
  return 'BQ-' + String(number).padStart(8, '0');
}

export async function renderOrderPdf(document, fontData) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontData, { subset: true });
  pdf.setTitle('Tovar nakladnoyi ' + orderNumber(document.number));
  const ink = rgb(.1, .14, .21);
  let page, y;
  const width = 595.28;
  const height = 841.89;
  function write(text, x, line, size = 9) {
    page.drawText(String(text ?? '—'), { x, y: line, size, font, color: ink });
  }
  function rule() {
    page.drawLine({ start: { x: 33, y }, end: { x: 562, y }, thickness: .55, color: ink, dashArray: [3, 2] });
    y -= 15;
  }
  function newPage() {
    page = pdf.addPage([width, height]);
    y = 803;
    write('boshqa.', 33, y, 14);
    write(orderNumber(document.number), 440, y, 10);
    y -= 25;
  }
  function wrap(value, span, size = 9) {
    const text = String(value ?? '—').replace(/\s+/g, ' ').trim() || '—';
    const lines = [];
    let line = '';
    for (const character of text) {
      if (font.widthOfTextAtSize(line + character, size) > span) {
        lines.push(line.trim());
        line = '';
      }
      line += character;
    }
    return [...lines, line.trim()];
  }
  function fields(entries, x, top) {
    for (const [label, value] of entries) {
      for (const line of wrap(label + '  ' + (value || '—'), 254)) {
        write(line, x, top);
        top -= 14;
      }
    }
    return top;
  }
  function tableHead() {
    rule();
    write('KOD', 33, y);
    write('MAHSULOT NOMI', 115, y);
    write('MIQDOR', 310, y);
    write('BIRLIK NARXI', 396, y);
    write('SUMMA', 496, y);
    y -= 8;
    rule();
  }
  newPage();
  write('TOVAR NAKLADNOYI', 33, y, 18);
  y -= 20;
  write('Buyurtma sanasi  ' + clock.format(new Date(document.created_at)), 33, y);
  y -= 14;
  write('Tasdiqlangan sana  ' + (document.approved_at ? clock.format(new Date(document.approved_at)) : '—'), 33, y);
  y -= 17;
  rule();
  const issuerBottom = fields([
    ['Firma', document.company_legal || document.company], ['Firma manzili', document.company_address],
    ['Firma aloqa raqami', document.company_contact], ['Yetkazuvchi telefon', document.courier_phone],
    ['Buyurtmachi agent telefoni', document.agent_phone],
  ], 33, y);
  const recipientBottom = fields([
    ['Do‘kon', document.shop], ['Yuridik nomi', document.shop_legal], ['Manzil', document.address],
    ['Do‘kon ID’si', document.shop_code], ['Do‘kon telefoni', document.shop_phone],
  ], 302, y);
  y = Math.min(issuerBottom, recipientBottom) - 4;
  tableHead();
  for (const item of document.items) {
    const cells = [[item.code, 33, 77], [item.name, 115, 185], [[item.quantity, item.unit].filter(Boolean).join(' '), 310, 80],
      [amount(item.price), 396, 92], [amount(item.total), 496, 65]];
    const rows = cells.map(([value, x, span]) => [wrap(value, span, 8), x]);
    const rowHeight = Math.max(...rows.map(([lines]) => lines.length)) * 11 + (Number(item.discount) > 0 ? 11 : 0) + 5;
    if (y - rowHeight < 98) { newPage(); tableHead(); }
    for (const [lines, x] of rows) lines.forEach((line, index) => write(line, x, y - index * 11, 8));
    if (Number(item.discount) > 0) write('Chegirma ' + item.discount + '%', 115, y - rowHeight + 14, 8);
    y -= rowHeight;
  }
  if (y < 112) newPage();
  rule();
  write('Mahsulot turlari  ' + document.items.length, 33, y);
  write('Jami  ' + amount(document.total) + ' so‘m', 330, y);
  y -= 33;
  write('Topshirdi  __________________', 33, y);
  write('Qabul qildi  __________________', 310, y);
  return pdf.save();
}
