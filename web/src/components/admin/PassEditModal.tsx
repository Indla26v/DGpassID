'use client';

import { useAuth } from '@/auth/AuthProvider';
import { isOfficeId, managesAccounts, OFFICES } from '@/core/domain/offices';
import { OfficePicker } from './OfficePicker';
import { useDialog } from '../common/useDialog';
import React, { useState, useEffect, useId, useRef } from 'react';
import { useToast } from '../common/Toast';
import { useBadgeAuthority } from '../common/useBadgeAuthority';
import { PassDetailsGate } from '../common/PassDetailsGate';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { AddDepartmentModal } from './AddDepartmentModal';
import { PassEntity, UpdatePassInput, PersonnelType } from '@/core/domain/entities/pass.entity';
import { PassStatus, InstitutionType, GovtIdType } from '@/core/domain/types/pass-status.enum';
import { getDefaultGate, SECURITY_ZONES, type SecurityZoneKey } from '@/core/domain/zones';
import { X, Save, Plus, Camera, CheckCircle, Upload } from 'lucide-react';
import { CameraCaptureModal } from '../common/CameraCaptureModal';

interface PassEditModalProps {
  pass: PassEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (pass: PassEntity) => void;
}

const statusOptions = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Pending approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'READY_TO_PRINT', label: 'Ready to print' },
  { value: 'PRINTED', label: 'Printed' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'REVOKED', label: 'Revoked' },
];
const idOptions = [
  { value: 'Aadhaar', label: 'Aadhaar' },
  { value: 'Institute ID', label: 'Official ID' },
  { value: 'Voter ID', label: 'Voter ID' },
  { value: 'PAN Card', label: 'PAN Card' },
  { value: 'Driving License', label: 'Driving licence' },
  { value: 'Passport', label: 'Passport' },
];
const badgeWidth = (80 * 96) / 25.4;
const badgeHeight = (120 * 96) / 25.4;

export const PassEditModal: React.FC<PassEditModalProps> = (props) => {
  if (!props.isOpen || !props.pass) return null;
  return <PassDetailsGate id={props.pass.id} key={props.pass.id} onClose={props.onClose}>
    {pass => <PassEditModalContent {...props} pass={pass} />}
  </PassDetailsGate>;
};

const PassEditModalContent: React.FC<Omit<PassEditModalProps, 'pass'> & { pass: PassEntity }> = ({
  pass,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const formId = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(badgeWidth);
  const toast = useToast();
  const { user } = useAuth();
  const [office, setOffice] = useState('');
  const canAssignOffice = managesAccounts(user) && !pass.office_id && !pass.approved_by &&
    ['DRAFT', 'PENDING_APPROVAL'].includes(pass.status);
  const selectedOffice = canAssignOffice && isOfficeId(office) ? office : null;
  const reassignedAuthority = useBadgeAuthority(isOpen && selectedOffice !== null, selectedOffice);
  const [externalDepartments, setExternalDepartments] = useState<string[]>([]);
  const [internalStaffRoles, setInternalStaffRoles] = useState<string[]>([]);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);

  const [fullName, setFullName] = useState(pass.full_name || '');
  const [fatherName, setFatherName] = useState(pass.father_or_spouse_name || '');
  const [personnelType, setPersonnelType] = useState<PersonnelType | ''>(pass.personnel_type || '');
  const [externalDepartment, setExternalDepartment] = useState(pass.personnel_type === 'EXTERNAL' ? pass.department || '' : '');
  const [institution, setInstitution] = useState<InstitutionType | ''>(pass.institution || '');
  const [staffRole, setStaffRole] = useState(pass.personnel_type === 'INTERNAL' ? pass.category || '' : '');
  const [mobileNumber, setMobileNumber] = useState(pass.mobile_number || '');
  const [govtIdType, setGovtIdType] = useState<GovtIdType>(pass.govt_id_type);
  const [govtIdNumber, setGovtIdNumber] = useState(pass.govt_id_number || '');
  const [status, setStatus] = useState<PassStatus>(pass.status);

  const [zoneA, setZoneA] = useState(pass.zone_a);
  const [zoneB, setZoneB] = useState(pass.zone_b);
  const [zoneC, setZoneC] = useState(pass.zone_c);

  const photoUrl = pass.photo_url || '';
  const [replacementPhoto, setReplacementPhoto] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = personnelType === 'INTERNAL' ? staffRole : personnelType === 'EXTERNAL'
    ? (pass.personnel_type === 'EXTERNAL' && pass.category) || 'External Agency' : '';
  const department = personnelType === 'EXTERNAL' ? externalDepartment : personnelType === 'INTERNAL' && institution && staffRole
    ? (pass.personnel_type === 'INTERNAL' && pass.institution === institution && pass.category === staffRole && pass.department) || `${institution} - ${staffRole}`
    : '';

  const gateFor = (key: SecurityZoneKey, saved?: string | null) => {
    if (!institution || institution === 'Other' || institution === pass.institution) return saved || '';
    if (saved && pass.institution && saved !== getDefaultGate(pass.institution, key)) return saved;
    return getDefaultGate(institution, key);
  };
  const gateZoneA = zoneA ? gateFor('A', pass.gate_zone_a) : pass.gate_zone_a || '';
  const gateZoneB = zoneB ? gateFor('B', pass.gate_zone_b) : pass.gate_zone_b || '';
  const gateZoneC = zoneC ? gateFor('C', pass.gate_zone_c) : pass.gate_zone_c || '';

  useEffect(() => {
    const viewport = previewRef.current;
    if (!viewport) return;
    const update = () => setPreviewWidth(viewport.clientWidth || badgeWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const loadDepartments = async () => {
    try {
      const res = await fetch('/api/departments');
      if (res.ok) {
        const data = await res.json();
        setExternalDepartments(data.externalDepartments || []);
        setInternalStaffRoles(data.internalStaffRoles || []);
      }
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, [pass?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!personnelType || !institution || !department.trim()) {
      setError(!personnelType ? 'Select a personnel category.' : !institution ? 'Select an institution.' : 'Select a department or staff role.');
      return;
    }
    if (!govtIdType) {
      setError('Select a government ID type.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Pre-check for duplicate passes (excluding the current pass being edited)
      try {
        const checkUrl = `/api/passes/check-duplicate?full_name=${encodeURIComponent(fullName.trim())}&mobile_number=${encodeURIComponent(mobileNumber.trim())}&govt_id_number=${encodeURIComponent(govtIdNumber.trim())}&exclude_id=${pass.id}`;
        const checkRes = await fetch(checkUrl);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.isDuplicate) {
            toast.warning('Already present', checkData.message || 'A pass for this cardholder is already saved or printed.');
            setError(checkData.message || 'Already present: A pass for this cardholder is already saved or printed.');
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fallback to backend PUT check
      }

      const updatePayload: UpdatePassInput = {
        full_name: fullName.trim(),
        father_or_spouse_name: fatherName.trim(),
        personnel_type: personnelType,
        institution,
        category,
        department: department.trim(),
        mobile_number: mobileNumber.trim(),
        govt_id_type: govtIdType,
        govt_id_number: govtIdNumber.trim(),
        status,
        office_id: canAssignOffice && isOfficeId(office) ? office : undefined,
        photo_url: replacementPhoto || undefined,
        zone_a: zoneA,
        gate_zone_a: gateZoneA.trim(),
        zone_b: zoneB,
        gate_zone_b: gateZoneB.trim(),
        zone_c: zoneC,
        gate_zone_c: gateZoneC.trim(),
      };

      const res = await fetch(`/api/passes/${pass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409 || data.error?.toLowerCase().includes('already present')) {
          toast.warning('Already present', data.error || 'A pass for this cardholder is already saved or printed.');
        }
        throw new Error(data.error || 'Failed to update pass');
      }

      const updated = await res.json();
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error updating pass');
    } finally {
      setLoading(false);
    }
  };

  const previewPass: Partial<PassEntity> = {
    ...pass,
    ...reassignedAuthority,
    full_name: fullName,
    father_or_spouse_name: fatherName,
    personnel_type: personnelType || undefined,
    institution: institution || undefined,
    category,
    department,
    mobile_number: mobileNumber,
    govt_id_type: govtIdType,
    govt_id_number: govtIdNumber,
    status,
    photo_url: replacementPhoto || photoUrl,
    zone_a: zoneA,
    gate_zone_a: gateZoneA,
    zone_b: zoneB,
    gate_zone_b: gateZoneB,
    zone_c: zoneC,
    gate_zone_c: gateZoneC,
  };

  const previewScale = Math.min(1, previewWidth / badgeWidth);
  const isExternal = personnelType === 'EXTERNAL';
  const affiliationLabel = isExternal ? 'External department' : 'Staff role';
  const affiliationValue = isExternal ? externalDepartment : staffRole;
  const affiliationOptions = [...new Set([affiliationValue, ...(isExternal ? externalDepartments : internalStaffRoles)])]
    .filter(Boolean)
    .map((value) => ({ value, label: value }));
  const institutionOptions = [
    { value: 'IISER', label: 'IISER Tirupati' },
    { value: 'IIT', label: 'IIT Tirupati' },
    { value: pass.institution === 'ICU' ? 'ICU' : 'ICI', label: 'Indian Culinary Institute (ICI)' },
    ...(pass.institution === 'Other' ? [{ value: 'Other', label: 'Other institution' }] : []),
  ];
  const zoneControls = { zone_a: [zoneA, setZoneA], zone_b: [zoneB, setZoneB], zone_c: [zoneC, setZoneC] } as const;
  const officeName = OFFICES.find((item) => item.id === pass.office_id)?.name ?? 'Unassigned office';

  return (
    <>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit duty ID card" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 p-3 sm:p-4">
        <div className="flex max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-police-crimson bg-police-navy px-4 py-3 text-white sm:px-5">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Edit duty ID card</h2>
              <p className="mt-0.5 break-words text-xs text-slate-200">{pass.pass_number} · {officeName}</p>
            </div>
            <button type="button" aria-label="Close dialog" onClick={onClose} disabled={loading} className="operations-action grid size-9 shrink-0 place-items-center bg-white/10 hover:bg-white/20 disabled:opacity-50">
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          {error && <p role="alert" className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800 sm:px-5">{error}</p>}

          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(280px,0.64fr)] md:overflow-hidden">
            <form id={formId} onSubmit={handleSubmit} className="min-w-0 space-y-3 p-3 sm:p-4 md:overflow-y-auto">
              <section aria-labelledby="edit-cardholder" className="operations-panel space-y-2.5 p-3 sm:p-4">
                <h3 id="edit-cardholder" className="text-sm font-semibold text-police-navy">Cardholder details</h3>
                <div className="grid min-w-0 gap-2.5 sm:grid-cols-2">
                  <label className="min-w-0 text-xs font-semibold text-slate-700">
                    Cardholder full name
                    <input type="text" required value={fullName} onChange={(event) => setFullName(event.target.value)} className="operations-input mt-1 px-3.5 font-normal" />
                  </label>
                  <label className="min-w-0 text-xs font-semibold text-slate-700">
                    Father’s / spouse’s name
                    <input type="text" value={fatherName} onChange={(event) => setFatherName(event.target.value)} className="operations-input mt-1 px-3.5 font-normal" />
                  </label>
                  <label className="min-w-0 text-xs font-semibold text-slate-700">
                    Mobile number
                    <input type="tel" required value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value)} className="operations-input mt-1 px-3.5 font-normal" />
                  </label>
                  <div className="min-w-0">
                    <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Government ID type</span>
                    <CustomSelect ariaLabel="Government ID type" value={govtIdType || ''} options={idOptions} onChange={(value) => setGovtIdType(value as GovtIdType)} placeholder="Select ID type" className="mt-1" />
                  </div>
                  <label className="min-w-0 text-xs font-semibold text-slate-700 sm:col-span-2">
                    Government ID number
                    <input type="text" required value={govtIdNumber} onChange={(event) => setGovtIdNumber(event.target.value)} className="operations-input mt-1 px-3.5 font-normal" />
                  </label>
                </div>
              </section>

              <section aria-labelledby="edit-affiliation" className="operations-panel space-y-2.5 p-3 sm:p-4">
                <h3 id="edit-affiliation" className="text-sm font-semibold text-police-navy">Affiliation and status</h3>
                <div className="grid min-w-0 gap-2.5 sm:grid-cols-2">
                  <div className="min-w-0">
                    <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Personnel category</span>
                    <CustomSelect
                      ariaLabel="Personnel category"
                      value={personnelType}
                      onChange={(value) => setPersonnelType(value as PersonnelType)}
                      options={[{ value: 'EXTERNAL', label: 'External Department' }, { value: 'INTERNAL', label: 'Campus Staff' }]}
                      placeholder="Select personnel category"
                      className="mt-1"
                    />
                  </div>
                  <div className="min-w-0">
                    <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Institution / unit</span>
                    <CustomSelect ariaLabel="Institution / unit" value={institution} options={institutionOptions} onChange={(value) => setInstitution(value as InstitutionType)} placeholder="Select an institution" className="mt-1" />
                  </div>
                  {personnelType && (
                    <div className="min-w-0 sm:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span aria-hidden="true" className="text-xs font-semibold text-slate-700">{affiliationLabel}</span>
                        {managesAccounts(user) && (
                          <button type="button" onClick={() => setIsAddDeptOpen(true)} className="operations-action inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-police-crimson hover:bg-rose-50">
                            <Plus aria-hidden="true" className="size-3.5" /> {isExternal ? 'Add department' : 'Add staff role'}
                          </button>
                        )}
                      </div>
                      <CustomSelect ariaLabel={affiliationLabel} value={affiliationValue} options={affiliationOptions} onChange={isExternal ? setExternalDepartment : setStaffRole} placeholder={isExternal ? 'Select a department' : 'Select a staff role'} className="mt-1" searchable />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span aria-hidden="true" className="block text-xs font-semibold text-slate-700">Pass status</span>
                    <CustomSelect ariaLabel="Pass status" value={status} options={status === 'PENDING_APPROVAL' || pass.status === 'PENDING_APPROVAL' ? statusOptions : statusOptions.filter((option) => option.value !== 'PENDING_APPROVAL')} onChange={(value) => setStatus(value as PassStatus)} className="mt-1" />
                  </div>
                  {canAssignOffice && <OfficePicker label="Assign issuing office" value={office} onChange={setOffice} emptyLabel="Unassigned" />}
                </div>
              </section>

              <section aria-labelledby="edit-access" className="operations-panel space-y-2.5 p-3 sm:p-4">
                <h3 id="edit-access" className="text-sm font-semibold text-police-navy">Access zones</h3>
                <fieldset className="space-y-1.5">
                  <legend className="pb-1 text-xs font-semibold text-slate-700">Authorized access zones</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {SECURITY_ZONES.map(({ field, label, badgeTitle }) => {
                      const [checked, change] = zoneControls[field];
                      return (
                        <label key={field} title={badgeTitle} className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${checked ? 'border-police-crimson/20 bg-rose-50 text-police-crimson' : 'border-slate-200 text-slate-700'}`}>
                          <input type="checkbox" aria-label={badgeTitle} checked={checked} onChange={(event) => change(event.target.checked)} className="accent-police-crimson" />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>

              <section aria-labelledby="edit-photo" className="operations-panel flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
                <div>
                  <h3 id="edit-photo" className="text-sm font-semibold text-police-navy">Cardholder photograph</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                    {replacementPhoto || photoUrl ? <><CheckCircle aria-hidden="true" className="size-3.5 text-emerald-700" /> Photo attached</> : 'No photo attached'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="operations-action inline-flex min-h-9 cursor-pointer items-center gap-1.5 border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-police-crimson">
                    <Upload aria-hidden="true" className="size-3.5" /> Upload photo
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => { if (typeof reader.result === 'string') setReplacementPhoto(reader.result); };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  <PillButton variant="outline" size="sm" onClick={() => setIsCameraOpen(true)} icon={<Camera aria-hidden="true" className="size-3.5" />}>Capture photo</PillButton>
                </div>
              </section>
            </form>

            <aside aria-label="Badge preview" className="min-w-0 border-t border-slate-200 bg-slate-100/70 p-3 sm:p-4 md:overflow-y-auto md:border-l md:border-t-0">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-police-navy">Badge preview</h3>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">80 × 120 mm</span>
              </div>
              <div ref={previewRef} className="w-full overflow-hidden">
                <div className="relative mx-auto" style={{ width: badgeWidth * previewScale, height: badgeHeight * previewScale }}>
                  <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${previewScale})` }}>
                    <PrintableDutyCard pass={previewPass} side="front" hideShadow />
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-5">
            <PillButton variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</PillButton>
            <PillButton variant="crimson" size="sm" type="submit" form={formId} disabled={loading} icon={<Save aria-hidden="true" className="size-3.5" />}>
              {loading ? 'Saving…' : 'Save changes'}
            </PillButton>
          </div>
        </div>
      </div>

      {personnelType && isAddDeptOpen && (
        <AddDepartmentModal
          isOpen
          initialType={personnelType}
          onClose={() => setIsAddDeptOpen(false)}
          onAdded={(item) => {
            void loadDepartments();
            if (item.type === 'EXTERNAL') setExternalDepartment(item.name);
            else setStaffRole(item.name);
          }}
        />
      )}
      <CameraCaptureModal isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onPhotoCaptured={setReplacementPhoto} />
    </>
  );
};
