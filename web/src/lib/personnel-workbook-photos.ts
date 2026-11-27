type WorkbookPart = { content?: Uint8Array | string };
type WorkbookParts = Record<string, WorkbookPart>;

export type PersonnelPicture = { bytes: Uint8Array; mime: string };
export type EmbeddedPersonnelPhoto = PersonnelPicture | { error: string; candidates: PersonnelPicture[] };

const imageMime = new Map([
  ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'],
]);

function packageTarget(source: string, target: string): string {
  if (!target || /[:?#\\]/.test(target) || target.startsWith('//')) return '';
  const parts = target.startsWith('/') ? [] : source.split('/').slice(0, -1);
  for (const piece of target.split('/')) {
    if (!piece || piece === '.') continue;
    if (piece === '..') {
      if (!parts.length) return '';
      parts.pop();
    } else {
      parts.push(piece);
    }
  }
  return parts.join('/');
}

function packageXml(files: WorkbookParts, path: string): Document | undefined {
  const content = files[path]?.content;
  if (!content) return;
  const document = new DOMParser().parseFromString(
    typeof content === 'string' ? content : new TextDecoder().decode(content),
    'application/xml',
  );
  if (document.documentElement.localName !== 'parsererror') return document;
}

function relationships(files: WorkbookParts, source: string, kind: string) {
  const folderEnd = source.lastIndexOf('/') + 1;
  const path = `${source.slice(0, folderEnd)}_rels/${source.slice(folderEnd)}.rels`;
  const xml = packageXml(files, path);
  const targets = new Map<string, string>();
  for (const node of Array.from(xml?.documentElement.children ?? [])) {
    const id = node.getAttribute('Id');
    if (node.localName !== 'Relationship' || !id || node.getAttribute('TargetMode') === 'External' ||
        !node.getAttribute('Type')?.endsWith(`/${kind}`)) continue;
    const target = packageTarget(source, node.getAttribute('Target') || '');
    if (target) targets.set(id, target);
  }
  return targets;
}

const byName = (node: Document | Element, name: string) => node.getElementsByTagNameNS('*', name);
const child = (node: Element, name: string) => Array.from(node.children).find(item => item.localName === name);
const relatedId = (node: Element, name: string) =>
  Array.from(node.attributes).find(attribute => attribute.localName === name && attribute.namespaceURI)?.value ?? '';

export function readEmbeddedPersonnelPhotos(
  files: WorkbookParts | undefined, sheetName: string, photoColumn: number, sourceRows: ReadonlySet<number>,
): Map<number, EmbeddedPersonnelPhoto> {
  const results = new Map<number, EmbeddedPersonnelPhoto>();
  if (!files || typeof DOMParser === 'undefined') return results;

  const workbookPath = 'xl/workbook.xml';
  const workbook = packageXml(files, workbookPath);
  if (!workbook) return results;
  const sheet = Array.from(byName(workbook, 'sheet')).find(item => item.getAttribute('name') === sheetName);
  if (!sheet) return results;
  const sheetPath = relationships(files, workbookPath, 'worksheet').get(relatedId(sheet, 'id'));
  if (!sheetPath) return results;
  const worksheet = packageXml(files, sheetPath);
  if (!worksheet) return results;
  const drawings = relationships(files, sheetPath, 'drawing');
  const picturesByRow = new Map<number, { candidates: PersonnelPicture[]; unreadable: boolean }>();

  for (const drawing of Array.from(byName(worksheet, 'drawing'))) {
    const drawingPath = drawings.get(relatedId(drawing, 'id'));
    if (!drawingPath) continue;
    const xml = packageXml(files, drawingPath);
    if (!xml) continue;
    const images = relationships(files, drawingPath, 'image');

    for (const anchor of Array.from(xml.documentElement.children)) {
      if (anchor.localName !== 'oneCellAnchor' && anchor.localName !== 'twoCellAnchor') continue;
      const topLeft = child(anchor, 'from');
      const picture = child(anchor, 'pic');
      // Excel also stores photos as the picture fill of a resized shape.
      const shape = child(anchor, 'sp');
      const properties = shape && child(shape, 'spPr');
      const fill = properties && child(properties, 'blipFill');
      const image = picture
        ? byName(picture, 'blip').item(0)
        : fill && child(fill, 'blip');
      if (!topLeft || (!picture && !image)) continue;
      const row = Number(child(topLeft, 'row')?.textContent ?? NaN) + 1;
      const column = Number(child(topLeft, 'col')?.textContent ?? NaN);
      if (column !== photoColumn || !sourceRows.has(row)) continue;

      const entry = picturesByRow.get(row) ?? { candidates: [], unreadable: false };
      picturesByRow.set(row, entry);
      const imagePath = image ? images.get(relatedId(image, 'embed')) : undefined;
      const mime = imageMime.get(imagePath?.split('.').pop()?.toLowerCase() ?? '');
      const bytes = imagePath ? files[imagePath]?.content : undefined;
      if (!mime || !(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
        entry.unreadable = true;
      } else if (!entry.candidates.some(photo => photo.bytes === bytes ||
          (photo.bytes.length === bytes.length && photo.bytes.every((byte, index) => byte === bytes[index])))) {
        entry.candidates.push({ bytes, mime });
      }
    }
  }
  for (const [row, { candidates, unreadable }] of picturesByRow) {
    if (candidates.length === 1 && !unreadable) results.set(row, candidates[0]);
    else results.set(row, {
      error: candidates.length > 1
        ? 'More than one picture is anchored to this row. Choose the correct photo.'
        : 'An embedded picture could not be read. Choose a usable photo or upload a replacement.',
      candidates,
    });
  }
  return results;
}
