import { strToU8, zip } from 'fflate';

function csv(rows) {
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const quote = value => {
    let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [headers.map(quote).join(','), ...rows.map(row => headers.map(key => quote(row[key])).join(','))].join('\r\n');
}

export async function createBackupArchive(db, snapshot) {
  const files = { 'backup.json': strToU8(JSON.stringify(snapshot, null, 2)) };
  const { data } = snapshot;
  for (const [key, rows] of Object.entries({ ...data, ...data.platform })) {
    if (Array.isArray(rows) && rows.length) files['csv/' + key + '.csv'] = strToU8(csv(rows));
  }
  if (data.documents?.length) {
    const [{ renderOrderPdf }, font] = await Promise.all([
      import('./order-document-pdf.js'),
      fetch('/fonts/receipt-mono.ttf').then(response => {
        if (!response.ok) throw new Error('Nakladnoy shriftini olib bo‘lmadi.');
        return response.arrayBuffer();
      }),
    ]);
    for (const document of data.documents) {
      const number = String(document.number);
      if (!/^\d+$/.test(number)) throw new Error('Nakladnoy raqami yaroqsiz.');
      files['nakladnoy/BQ-' + number.padStart(8, '0') + '.pdf'] = await renderOrderPdf(document, font);
    }
  }
  const images = [...new Set([data.company?.cover_path, ...(data.products || []).map(item => item.image_path)].filter(Boolean))];
  const missing = [];
  const imageManifest = {};
  for (const [index, path] of images.entries()) {
    try {
      const { data: image, error } = await db.storage.from('product-images').download(path);
      if (error || !image) throw error;
      const filename = 'rasmlar/' + (index + 1) + '-' + path.split('/').at(-1).replace(/[^\w.-]/g, '_');
      files[filename] = new Uint8Array(await image.arrayBuffer());
      imageManifest[path] = filename;
    } catch { missing.push(path); }
  }
  if (images.length) files['rasmlar/index.json'] = strToU8(JSON.stringify(imageManifest, null, 2));
  if (missing.length) files['yuklanmagan-rasmlar.txt'] = strToU8(missing.join('\n'));
  return new Promise((resolve, reject) => zip(files, { level: 3 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
}
