import * as XLSX from 'xlsx';
import { parsePoliceDutyAssignment } from '@/core/domain/police-zones';
import { normalizeRank } from '@/core/domain/ranks';
import { parseAgeYears, parseDateOfBirth } from './officer-age';
import { formatPhotoUrl } from './identity-validation';
import { readEmbeddedPersonnelPhotos } from './personnel-workbook-photos';

const columns = {
  full_name: ['Full Name', 'Name', 'Officer Name', 'Personnel Name'],
  rank: ['Designation or Rank', 'Designation / Rank', 'Rank', 'Designation'],
  police_id_number: ['Police ID / Gen No', 'Police ID', 'Police ID Number', 'Gen No', 'GNO', 'G.No', 'Genl No', 'GL No', 'ID Number'],
  police_unit_district: ['District / Unit', 'District or Unit', 'District', 'Unit', 'Police Unit District'],
  mobile_number: ['Mobile Number', 'Mobile', 'Mobile No', 'MOBILENO', 'Phone Number'],
  govt_id_number: ['Aadhaar Number', 'Aadhaar', 'Aadhar Number', 'Govt ID Number'],
  police_zone: ['Zone Name', 'Zone', 'Bandobusth Zone', 'Police Zone'],
  police_zone_number: ['Zone Number', 'Zone No', 'Zone ID', 'Zone Code', 'Bandobusth Zone Number', 'Police Zone Number'],
  police_sector_number: ['Sector Number', 'Sector No', 'Police Sector Number', 'Sector ID', 'Sector Code', 'Sector'],
  police_sector_name: ['Sector Name', 'Location', 'Police Sector Name'],
  police_sub_sector: ['Sub-sector', 'Sub Sector', 'Subsector', 'Sub-sector Name', 'Sub Sector Name'],
  police_point: ['Point', 'Duty Point', 'Point Name', 'Point Code', 'Place of Duty'],
  date_of_birth: ['Date of Birth', 'DOB', 'D.O.B', 'Birth Date'],
  age_years: ['Age', 'Age (Years)', 'Age in Years'],
  force_category: ['Force', 'Force Category', 'Force Type'],
  police_station: ['Police Station', 'PS', 'PS Name', 'Station', 'Place of Working', 'PLACEOFWORKING'],
  gender: ['Gender', 'Sex'],
  security_component: ['Security Component', 'Component'],
  issuing_counter_id: ['Issuing Counter ID', 'Counter ID', 'Desk'],
  photo: ['Photograph Reference', 'Photo Reference', 'Photograph', 'Photo', 'Photos', 'Image', 'Photo Filename', 'Photo URL', 'Image URL'],
} as const;

// "Zone (optional)" and "Zone" are the same column.
const normalizeHeader = (value: unknown) => String(value ?? '').toLowerCase().replace(/\(\s*optional\s*\)/g, '').replace(/[^a-z0-9]/g, '');
export function parsePolicePersonnel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array', raw: true, bookFiles: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true }) : [];
  const [header, ...data] = rows;
  if (!header || !data.length) throw new Error('Upload a spreadsheet with a header and at least one officer.');

  const fields = header.map(normalizeHeader);
  const indexes = new Map(Object.entries(columns).map(([key, headers]) => {
    const aliases = headers.map(normalizeHeader);
    return [key, aliases.map(alias => fields.indexOf(alias)).filter(index => index >= 0)];
  }));
  if (['full_name', 'mobile_number', 'govt_id_number'].some(key => !indexes.get(key)?.length)) {
    throw new Error('Include Full Name, Mobile Number and Aadhaar Number columns.');
  }
  const start = XLSX.utils.decode_range(sheet['!ref'] || 'A1').s;
  const declaredPhotoIndex = indexes.get('photo')?.[0] ?? -1;
  const photoIndex = declaredPhotoIndex >= 0 ? declaredPhotoIndex : fields.findIndex(field => field.startsWith('passportsizephoto'));
  const results = data.flatMap((row, i) => {
    const read = (key: keyof typeof columns) =>
      indexes.get(key)?.map(index => String(row[index] ?? '').trim()).find(Boolean) ?? '';
    const name = read('full_name');
    const mobile = read('mobile_number');
    const aadhaar = read('govt_id_number');
    if (!row.some(value => String(value ?? '').trim())) return [];
    const sourceRow = start.r + i + 2;
    const photoCell = photoIndex < 0 ? undefined : sheet[XLSX.utils.encode_cell({ r: sourceRow - 1, c: start.c + photoIndex })];
    const photoValue = photoCell?.l?.Target || String(row[photoIndex] ?? '').trim();
    const photoReference = /^(?:desk[_ ]capture|—|none)$/i.test(photoValue) ? '' : photoValue;
    const zone = read('police_zone');
    const zoneNumber = read('police_zone_number');
    const zoneValue = zoneNumber && zone && zoneNumber.toLowerCase() !== zone.toLowerCase()
      ? zoneNumber + ': ' + zone
      : zoneNumber || zone;
    const { dutyWarning, ...duty } = parsePoliceDutyAssignment(
      zoneValue, read('police_sector_number'), read('police_sector_name'), read('police_sub_sector'), read('police_point'),
    );
    const dobCell = indexes.get('date_of_birth')?.map(index => row[index]).find(value => String(value ?? '').trim());
    const district = read('police_unit_district');
    return [{
      sourceRow,
      photoReference,
      dutyWarning,
      record: {
        full_name: name,
        rank: normalizeRank(read('rank')),
        police_id_number: read('police_id_number'),
        police_unit_district: district,
        institution_other: district,
        mobile_number: mobile,
        govt_id_number: aadhaar,
        ...duty,
        date_of_birth: parseDateOfBirth(dobCell),
        age_years: parseAgeYears(read('age_years')),
        force_category: read('force_category'),
        police_station: read('police_station'),
        gender: read('gender'),
        security_component: read('security_component'),
        issuing_counter_id: read('issuing_counter_id'),
      },
    }];
  });
  if (!results.length) throw new Error('The spreadsheet contains no officer rows.');
  if (results.length > 5000) throw new Error('Import at most 5000 records at once.');
  const files = (workbook as XLSX.WorkBook & { files?: Parameters<typeof readEmbeddedPersonnelPhotos>[0] }).files;
  const photos = photoIndex < 0 || !files ? undefined : readEmbeddedPersonnelPhotos(
    files, sheetName, start.c + photoIndex, new Set(results.map(row => row.sourceRow)),
  );
  return results.map(row => ({ ...row, embeddedPhoto: photos?.get(row.sourceRow) }));
}

export type PolicePersonnelRow = ReturnType<typeof parsePolicePersonnel>[number] & { dutyEdited?: boolean };

export function policePersonnelPhotoUrl(reference: string) {
  if (!/^https?:\/\//i.test(reference)) return undefined;
  try {
    const url = new URL(reference);
    if (url.username || url.password) return undefined;
    return formatPhotoUrl(url.href);
  } catch {
    return undefined;
  }
}

export async function readPolicePersonnelPhoto(file: Blob) {
  if (file.size > 20 * 1024 * 1024) throw new Error('The photo exceeds 20 MB.');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the photo.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    image.close();
  }
}
