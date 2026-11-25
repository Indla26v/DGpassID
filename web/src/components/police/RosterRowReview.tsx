'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, X } from 'lucide-react';
import { dutyPointsFor, POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { readPoliceRosterPhoto, type PoliceRosterRow } from '@/lib/police-roster-import';
import { photoBlob, resolveReviewPhoto, rosterDetailsIssue, type PhotoOverride, type ReviewPhoto } from '@/lib/roster-import-review';
import { CustomSelect } from '../common/CustomSelect';
import { PillButton } from '../common/PillButton';
import { useDialog } from '../common/useDialog';

export function RosterPhotoPreview({ photo, label, large = false }: { photo: ReviewPhoto; label: string; large?: boolean }) {
  const file = 'file' in photo ? photo.file : undefined;
  const picture = 'picture' in photo ? photo.picture : undefined;
  const directUrl = photo.kind === 'link' ? photo.url : '';
  const [objectUrl, setObjectUrl] = useState('');
  const [failedSource, setFailedSource] = useState('');

  useEffect(() => {
    const blob = file ?? (picture && photoBlob({ kind: 'embedded', picture }));
    if (!blob) {
      setObjectUrl('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, picture]);

  const src = directUrl || objectUrl;
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${large ? 'aspect-[3/4] w-full max-w-44' : 'h-12 w-10'}`}>
      {src && src !== failedSource
        ? <img src={src} alt={label} referrerPolicy="no-referrer" className={`h-full w-full ${large ? 'object-contain' : 'object-cover'}`} onError={() => setFailedSource(src)} />
        : <ImageIcon aria-hidden="true" className={large ? 'size-8 text-slate-400' : 'size-4 text-slate-400'} />}
    </span>
  );
}

const officerFields = [
  ['full_name', 'Full name'], ['rank', 'Rank'],
  ['police_id_number', 'Police ID'], ['police_unit_district', 'District / unit'],
  ['mobile_number', 'Mobile number'], ['govt_id_number', 'Aadhaar number'],
] as const;

export function RosterRowReview({ row, photoOverride, onClose, onSave }: {
  row: PoliceRosterRow;
  photoOverride?: PhotoOverride;
  onClose: () => void;
  onSave: (row: PoliceRosterRow, photoOverride: PhotoOverride | undefined) => void;
}) {
  const [draft, setDraft] = useState(row);
  const [override, setOverride] = useState(photoOverride);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [fileError, setFileError] = useState('');
  const dialog = useDialog(true, onClose);
  const photo = resolveReviewPhoto(draft, override);
  const candidates = draft.embeddedPhoto && 'candidates' in draft.embeddedPhoto ? draft.embeddedPhoto.candidates : [];
  const zone = POLICE_BANDOBUSHT_ZONES.find(item => item.name === draft.record.police_zone);
  const selectedSector = zone?.sectors.find(item => item.number === draft.record.police_sector_number);
  const selectedSubSector = selectedSector?.subSectors?.includes(draft.record.police_sector_name) ? draft.record.police_sector_name : '';
  const points = dutyPointsFor(zone?.name, selectedSector?.number, selectedSector?.subSectors?.length ? selectedSubSector || null : undefined);
  const setDuty = (changes: Partial<PoliceRosterRow['record']>) => setDraft(current => ({ ...current, dutyWarning: '',
    record: { ...current.record, ...changes }, dutyEdited: true }));
  const detailIssue = rosterDetailsIssue(draft);

  const choosePhoto = async (choice: Extract<PhotoOverride, { kind: 'choice' | 'replacement' }>) => {
    const selected = choice.kind === 'replacement' ? choice.file
      : new Blob([new Uint8Array(choice.picture.bytes)], { type: choice.picture.mime });
    setReadingPhoto(true);
    setFileError('');
    try {
      await readPoliceRosterPhoto(selected);
      setOverride(choice);
    } catch {
      setFileError('Choose a readable JPG, PNG or WebP image up to 20 MB.');
    } finally {
      setReadingPhoto(false);
    }
  };

  return createPortal(
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5">
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={`Review row ${row.sourceRow}`} tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 bg-police-navy px-5 py-4 text-white">
          <div>
            <p className="text-xs text-slate-300">Excel row {row.sourceRow}</p>
            <h3 className="text-lg font-semibold">{row.record.full_name || 'Review officer'}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close row review" className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </header>
        <div className="grid items-start gap-5 overflow-y-auto p-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:p-5">
          <section aria-label="Officer details" className="min-w-0 space-y-4">
            <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
              {officerFields.map(([field, label]) => (
                <label key={field} className="min-w-0 space-y-1 text-xs font-semibold text-slate-700">
                  <span className="block">{label}</span>
                  <input value={draft.record[field]} className="operations-input block px-3.5 font-normal"
                    onChange={event => {
                      const value = event.target.value;
                      setDraft(current => ({ ...current, record: { ...current.record, [field]: value,
                        ...(field === 'police_unit_district' ? { institution_other: value } : {}) } }));
                    }} />
                </label>
              ))}
            </div>
            <div className="grid gap-2.5">
              <div className="space-y-1">
                <p aria-hidden="true" className="text-xs font-semibold text-slate-700">Bandobusth zone</p>
                <CustomSelect ariaLabel="Bandobusth zone" wrapValue value={zone?.name ?? ''} placeholder="Choose zone" options={[
                  { value: '', label: 'Unassigned zone' },
                  ...POLICE_BANDOBUSHT_ZONES.map(item => ({ value: item.name, label: `Zone ${item.number} · ${item.name}` })),
                ]} onChange={value => setDuty({ police_zone: value, police_sector_number: '', police_sector_name: '',
                  police_point_code: '', police_point_name: '' })} />
              </div>
              <div className="space-y-1">
                <p aria-hidden="true" className="text-xs font-semibold text-slate-700">Assigned sector</p>
                <CustomSelect ariaLabel="Assigned sector" wrapValue value={selectedSector?.number ?? ''} disabled={!zone} options={[
                  { value: '', label: 'Unassigned sector' },
                  ...(zone?.sectors.map(item => ({ value: item.number, label: `${item.number} · ${item.name}` })) ?? []),
                ]} onChange={value => setDuty({ police_sector_number: value,
                  police_sector_name: zone?.sectors.find(item => item.number === value)?.name ?? '', police_point_code: '', police_point_name: '' })} />
              </div>
              {Boolean(selectedSector?.subSectors?.length) && (
                <div className="space-y-1">
                  <p aria-hidden="true" className="text-xs font-semibold text-slate-700">Sub-sector (optional)</p>
                  <CustomSelect ariaLabel="Sub-sector" wrapValue searchable value={selectedSubSector} options={[
                    { value: '', label: 'No sub-sector' },
                    ...(selectedSector?.subSectors ?? []).map(item => ({ value: item, label: item })),
                  ]} onChange={value => setDuty({ police_sector_name: value || selectedSector?.name || '', police_point_code: '', police_point_name: '' })} />
                </div>
              )}
              {points.length > 0 && (
                <div className="space-y-1">
                  <p aria-hidden="true" className="text-xs font-semibold text-slate-700">Duty point (optional)</p>
                  <CustomSelect ariaLabel="Duty point" wrapValue searchable value={draft.record.police_point_code} options={[
                    { value: '', label: 'No point yet' },
                    ...points.map(item => ({ value: item.code, label: item.name })),
                  ]} onChange={value => setDuty({ police_point_code: value, police_point_name: points.find(item => item.code === value)?.name ?? '' })} />
                </div>
              )}
            </div>
            {draft.dutyWarning && <p className="text-xs text-amber-800" role="status">{draft.dutyWarning}</p>}
            {detailIssue && <p className="text-xs text-rose-800" role="status">{detailIssue}</p>}
          </section>

          <section aria-label="Officer photograph" className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <RosterPhotoPreview photo={photo} large label={`Selected photo for ${draft.record.full_name || 'this row'}`} />
              <p className="text-xs text-slate-600">{photo.kind === 'review' ? photo.message :
                photo.kind === 'defer' ? 'Photo deferred to desk capture.' : 'Photo selected for this officer.'}</p>
            </div>
            {candidates.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {candidates.map((picture, index) => (
                  <button key={index} type="button" aria-pressed={override?.kind === 'choice' && override.picture === picture}
                    disabled={readingPhoto}
                    className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-left text-xs font-semibold text-police-navy hover:border-police-crimson aria-pressed:border-police-crimson aria-pressed:bg-rose-50"
                    onClick={() => { void choosePhoto({ kind: 'choice', picture }); }}>
                    <RosterPhotoPreview photo={{ kind: 'embedded', picture }} label={`Embedded candidate ${index + 1}`} />
                    Use photo {index + 1}
                  </button>
                ))}
              </div>
            )}
            <label className="block space-y-1 text-xs font-semibold text-slate-700">
              <span className="block">Upload a replacement photo</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={readingPhoto}
                className="block w-full text-xs file:mr-2 file:rounded-full file:border-0 file:bg-slate-200 file:px-3 file:py-1.5"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void choosePhoto({ kind: 'replacement', file });
                  event.target.value = '';
                }} />
            </label>
            {fileError && <p role="alert" className="text-xs text-rose-800">{fileError}</p>}
            <div className="flex flex-wrap gap-2">
              <PillButton type="button" variant="outline" size="sm" disabled={readingPhoto || photo.kind === 'defer'}
                onClick={() => { setFileError(''); setOverride({ kind: 'defer' }); }}>Capture later</PillButton>
              {override && <PillButton type="button" variant="ghost" size="sm" disabled={readingPhoto}
                onClick={() => { setFileError(''); setOverride(undefined); }}>Use workbook photo again</PillButton>}
            </div>
          </section>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 p-3">
          <PillButton type="button" variant="outline" onClick={onClose}>Cancel</PillButton>
          <PillButton type="button" variant="crimson" disabled={readingPhoto} onClick={() => onSave(draft, override)}>
            {readingPhoto ? 'Checking image…' : 'Save row changes'}
          </PillButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
