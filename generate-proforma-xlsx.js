const fs = require('fs');
const path = require('path');
const XLSX = require('./web/node_modules/xlsx');

// 1. Data Sheet Headers (8 Clean Columns for Police Department)
const dataHeaders = [
  'Sl. No.',
  'Full Name',
  'Father or Spouse Name',
  'District',
  'Designation or Rank',
  'Mobile Number',
  'Aadhaar Number',
  'Photograph Reference'
];

const sampleData = [
  [
    1,
    'SRI K. RAMESH BABU, IPS',
    'SRI K. SUBBA RAO',
    'Visakhapatnam',
    'ADDITIONAL SP',
    '9848012345',
    '270625123456',
    '9848012345.jpg'
  ],
  [
    2,
    'M. SURESH KUMAR',
    'SRI M. VENKATAIAH',
    'Guntur',
    'SUB-INSPECTOR',
    '9440123456',
    '345612890123',
    '9440123456.jpg'
  ],
  [
    3,
    'B. RAMANJANEYULU',
    'SRI B. CHENNAIAH',
    'Chittoor',
    'HEAD CONSTABLE',
    '9849288771',
    '456723901234',
    '' // Photo left blank for spot capture
  ],
  [
    4,
    'K. VENKATESWARLU',
    'SRI K. VENKATARAMANA',
    'Krishna',
    'POLICE CONSTABLE',
    '9490612345',
    '567834012345',
    '9490612345.jpg'
  ],
  [
    5,
    'S. APPA RAO',
    'SRI S. NARAYANA',
    'Nellore',
    'POLICE CONSTABLE DRIVER',
    '9440556677',
    '678945123456',
    '' // Photo left blank for spot capture
  ],
  [
    6,
    'T. SRINIVASA RAO',
    'SRI T. RAMAIAH',
    'Kadapa',
    'WIRELESS OPERATOR',
    '9848199001',
    '789056234567',
    '' // Photo left blank for spot capture
  ]
];

// 2. Instructions Sheet Rows
const instructionRows = [
  ['POLICE PERSONNEL DUTY PASS PROFORMA - INSTRUCTIONS & REFERENCE'],
  ['61st All India DGPs / IGPs Conference 2026 - IISER Campus, Tirupati'],
  [''],
  ['1. IMPORTANT DATA INSTRUCTIONS'],
  ['Field', 'Specification / Rule'],
  ['Department Allocation', 'All personnel submitted via this spreadsheet are registered under the Police Department.'],
  ['District (Col D)', 'Specify your police district (e.g. Visakhapatnam, Guntur, Chittoor, Krishna, Nellore, Kadapa, Tirupati).'],
  ['Mobile Number (Col F)', 'Exactly 10 digits without +91, 0, spaces, or dashes (e.g. 9848012345).'],
  ['Aadhaar Number (Col G)', 'Enter cell format as Text in Excel so that 12-digit Aadhaar numbers are not converted to scientific notation (e.g. 2.70625E+11). Must be 12 numeric digits.'],
  ['Photograph (Col H)', 'If available, enter filename (e.g. 9848012345.jpg) or link. IF NOT AVAILABLE, LEAVE BLANK.'],
  ['Spot Capture on Arrival', 'If a photograph is not submitted in advance, the officer/personnel will have their photograph captured via camera on the spot at the registration counter before card printing.'],
  ['Pass Validity', 'Security clearance and pass validity period will be activated directly from the date of physical pass issuance at the counter through to 30th November 2026.']
];

// Create workbook
const wb = XLSX.utils.book_new();

// Create Data Worksheet
const wsData = XLSX.utils.aoa_to_sheet([dataHeaders, ...sampleData]);

// Set column widths for Data Worksheet
wsData['!cols'] = [
  { wch: 8 },  // Sl. No.
  { wch: 30 }, // Full Name
  { wch: 26 }, // Father or Spouse Name
  { wch: 30 }, // District
  { wch: 26 }, // Designation or Rank
  { wch: 16 }, // Mobile Number
  { wch: 18 }, // Aadhaar Number
  { wch: 24 }  // Photograph Reference
];

// Create Instructions Worksheet
const wsInstructions = XLSX.utils.aoa_to_sheet(instructionRows);
wsInstructions['!cols'] = [
  { wch: 28 },
  { wch: 85 }
];

// Add worksheets to workbook
XLSX.utils.book_append_sheet(wb, wsData, 'Police Personnel Data Entry');
XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions & Reference');

// Write out to root workspace and web/public for easy download
const outputPath = path.join(__dirname, 'Official_DGP_Conference_Pass_Proforma_Template_2026.xlsx');
const publicPath = path.join(__dirname, 'web', 'public', 'Official_DGP_Conference_Pass_Proforma_Template_2026.xlsx');

if (!fs.existsSync(path.join(__dirname, 'web', 'public'))) {
  fs.mkdirSync(path.join(__dirname, 'web', 'public'), { recursive: true });
}

XLSX.writeFile(wb, outputPath);
XLSX.writeFile(wb, publicPath);

// Also copy the CSV to web/public for download
const csvSrc = path.join(__dirname, 'Official_DGP_Conference_Pass_Proforma_Template_2026.csv');
const csvPublic = path.join(__dirname, 'web', 'public', 'Official_DGP_Conference_Pass_Proforma_Template_2026.csv');
if (fs.existsSync(csvSrc)) {
  fs.copyFileSync(csvSrc, csvPublic);
}

console.log('Successfully generated 8-column XLSX proforma at: ' + outputPath);
console.log('Successfully staged in web/public at: ' + publicPath);
