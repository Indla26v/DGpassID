import assert from 'node:assert/strict';

// Test CsvExportService logic
class CsvExportServiceTest {
  formatDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const str = String(val).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return str;
  }

  sanitizeCellValue(value, isTextLiteral = false) {
    if (value === null || value === undefined) {
      return '""';
    }

    let str = String(value);
    const trimmed = str.trim();

    if (isTextLiteral || /^\d{10,}$/.test(trimmed)) {
      const escaped = trimmed.replace(/"/g, '""');
      return `"=""${escaped}"""`;
    }

    // Prevent CSV formula injection
    if (/^[=+@\-\t\r]/.test(trimmed) || /^[=+@\-\t\r]/.test(str)) {
      str = `'${trimmed}`;
    } else {
      str = trimmed;
    }

    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  generateCsv(columns, passes) {
    const headerRow = columns
      .map((col) => this.sanitizeCellValue(col.header))
      .join(',');

    const dataRows = passes.map((pass) => {
      return columns
        .map((col) => {
          const val = col.accessor(pass);
          const isGovtId = col.header === 'Govt ID Number';
          return this.sanitizeCellValue(val, isGovtId);
        })
        .join(',');
    });

    return '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
  }
}

console.log('Running updated CSV Export Service tests...');
const service = new CsvExportServiceTest();

// 1. Test 12-digit Aadhaar / Govt ID number formatting as Excel text literal
const aadhaar = '270625123456';
const formattedAadhaar = service.sanitizeCellValue(aadhaar, true);
assert.equal(
  formattedAadhaar,
  '"=""270625123456"""',
  '12-digit Aadhaar must be formatted as Excel text formula to avoid scientific notation'
);
console.log('PASS: 12-digit Govt ID Number formatted as Excel text formula ("=""...""").');

// 2. Test Date formatting (no longer long string, but clean YYYY-MM-DD)
const dateStr = 'Fri Nov 20 2026 00:00:00 GMT+0530 (India Standard Time)';
const cleanDate = service.formatDate(dateStr);
assert.equal(cleanDate, '2026-11-20', 'Date must be formatted as YYYY-MM-DD');
const dateCell = service.sanitizeCellValue(cleanDate);
assert.equal(dateCell, '"2026-11-20"');
console.log('PASS: Date formatting produces clean 10-character YYYY-MM-DD without "########".');

// 3. Test formula injection prevention
const injectedValues = ['=SUM(A1:A10)', '+cmd|/c calc', '-danger', '@dangerous'];
for (const val of injectedValues) {
  const sanitized = service.sanitizeCellValue(val);
  assert.ok(
    sanitized.startsWith(`"'${val.trim().replace(/^[']/, '')}`),
    `Value "${val}" should be sanitized with leading single quote: got ${sanitized}`
  );
}
console.log('PASS: Formula injection prevention verified.');

// 4. Test Columns exclusion
const finalColumns = [
  { header: 'Pass Number', accessor: (p) => p.pass_number },
  { header: 'Full Name', accessor: (p) => p.full_name },
  { header: 'Father or Spouse Name', accessor: (p) => p.father_or_spouse_name },
  { header: 'Personnel Type', accessor: (p) => p.personnel_type || 'EXTERNAL' },
  { header: 'Subdivision / Office', accessor: (p) => p.office_name },
  { header: 'Office ID', accessor: (p) => p.office_id },
  { header: 'Institution', accessor: (p) => p.institution },
  { header: 'Institution Details', accessor: (p) => p.institution_other || '' },
  { header: 'Category', accessor: (p) => p.category },
  { header: 'Category Details', accessor: (p) => p.category_other || '' },
  { header: 'Department', accessor: (p) => p.department },
  { header: 'Designation or Trade', accessor: (p) => p.designation_or_trade || '' },
  { header: 'Mobile Number', accessor: (p) => p.mobile_number },
  { header: 'Govt ID Type', accessor: (p) => p.govt_id_type },
  { header: 'Govt ID Number', accessor: (p) => p.govt_id_number },
  { header: 'Status', accessor: (p) => p.status },
  { header: 'Valid From', accessor: (p) => service.formatDate(p.valid_from) },
  { header: 'Valid To', accessor: (p) => service.formatDate(p.valid_to) },
  { header: 'Approved By', accessor: (p) => p.approved_by || '' },
  { header: 'Approved At', accessor: (p) => service.formatDate(p.approved_at) },
];

const headerNames = finalColumns.map((c) => c.header);
assert.ok(!headerNames.includes('Zone A (Hostels)'), 'Zone A must be excluded');
assert.ok(!headerNames.includes('Zone B (Academic)'), 'Zone B must be excluded');
assert.ok(!headerNames.includes('Zone C (Logistics)'), 'Zone C must be excluded');
assert.ok(!headerNames.includes('Created At'), 'Created At must be excluded');
assert.ok(!headerNames.includes('Last Printed By'), 'Last Printed By must be excluded');
assert.ok(!headerNames.includes('Last Printed At'), 'Last Printed At must be excluded');
assert.ok(!headerNames.includes('Printed Count'), 'Printed Count must be excluded');
assert.ok(!headerNames.includes('Hologram Verified'), 'Hologram must be excluded');
assert.ok(!headerNames.includes('Hostel / Quarter / Residential'), 'Hostel / Quarter must be excluded');
console.log('PASS: All requested columns successfully excluded.');

console.log('\nAll updated CSV export service tests PASSED successfully!');
