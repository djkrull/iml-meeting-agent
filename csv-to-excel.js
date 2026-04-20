const XLSX = require('xlsx');
const fs = require('fs');

const CSV_PATH = 'C:\\Users\\chrwah28.KVA\\Downloads\\Verksamhetsplanering 2026-2029.csv';
const OUT_PATH = 'C:\\Users\\chrwah28.KVA\\Downloads\\Verksamhetsplanering_2026-2029.xlsx';

function parseCSV(csvText) {
  const rows = [];
  let current = '';
  let inQuotes = false;

  const lines = csvText.split('\n');
  for (const line of lines) {
    for (const c of line) if (c === '"') inQuotes = !inQuotes;
    current += (current ? '\n' : '') + line;
    if (!inQuotes) {
      rows.push(current);
      current = '';
    }
  }

  const parsedRows = rows.map(row => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (const c of row) {
      if (c === '"') inQ = !inQ;
      else if (c === ';' && !inQ) { fields.push(field.trim()); field = ''; }
      else field += c;
    }
    fields.push(field.trim());
    return fields;
  });

  return parsedRows;
}

const csvText = fs.readFileSync(CSV_PATH, 'latin1');
const rows = parseCSV(csvText);

// First row is headers
const headers = rows[0];
console.log('Headers:', headers);

// Build objects
const data = rows.slice(1)
  .filter(r => r.length > 2 && r[0] && r[2])
  .map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] || '';
    });
    return obj;
  });

console.log(`Parsed ${data.length} rows`);

// Filter to only 2026+ programs
const futureData = data.filter(r => {
  const year = parseInt(r['År']);
  return year >= 2026;
});

console.log(`Keeping ${futureData.length} rows from 2026+`);

// Create workbook
const ws = XLSX.utils.json_to_sheet(futureData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Programs');

XLSX.writeFile(wb, OUT_PATH);
console.log(`\n✅ Wrote ${OUT_PATH}`);
console.log(`\nSample programs:`);
futureData.slice(0, 5).forEach(r => {
  console.log(`  ${r['År']} - ${r['Datum']} - ${r['Program']}`);
});
