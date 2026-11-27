'use client';

import { useAuth } from '@/auth/AuthProvider';
import { isOfficeId, managesAccounts, OFFICES } from '@/core/domain/offices';
import { OfficePicker } from './OfficePicker';
import { useDialog } from '../common/useDialog';
import React, { useState, useEffect, useId } from 'react';
import { useToast } from '../common/Toast';
import { InstitutionSelector } from '../common/InstitutionSelector';
import { useBadgeAuthority } from '../common/useBadgeAuthority';
import { PillButton } from '../common/PillButton';
import { SignaturePad } from '../badges/SignaturePad';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { SecurityZoneToggles } from '../common/SecurityZoneToggles';
import { getDefaultGate } from '@/core/domain/zones';
import { AddDepartmentModal } from './AddDepartmentModal';
import {
  CreatePassInput,
  PassEntity,
  PersonnelType,
} from '@/core/domain/entities/pass.entity';
import {
  InstitutionType,
  GovtIdType,
} from '@/core/domain/types/pass-status.enum';
import { X, Plus, UserPlus, Camera, Image as ImageIcon, Printer, Upload } from 'lucide-react';
import { CameraCaptureModal } from '../common/CameraCaptureModal';
import { PASS_VALID_TO_LABEL } from '@/core/domain/pass-validity';

interface PassCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (pass: PassEntity) => void;
  onPrint?: (pass: PassEntity) => void;
}

export const PassCreateModal: React.FC<PassCreateModalProps> = (props) => (
  props.isOpen ? <PassCreateModalContent {...props} /> : null
);

const PassCreateModalContent: React.FC<PassCreateModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  onPrint,
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [submitAction, setSubmitAction] = useState<'queue' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const photoInputId = useId();

  // Departments & Roles fetched from PostgreSQL
  const [externalDepartments, setExternalDepartments] = useState<string[]>([]);
  const [internalStaffRoles, setInternalStaffRoles] = useState<string[]>([]);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [addDeptType, setAddDeptType] = useState<'EXTERNAL' | 'INTERNAL'>('EXTERNAL');

  // Classification Mode: EXTERNAL vs INTERNAL
  const [personnelType, setPersonnelType] = useState<PersonnelType | ''>('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [fatherName, setFatherName] = useState('');

  // If EXTERNAL:
  const [selectedExternalDept, setSelectedExternalDept] = useState('');

  // If INTERNAL:
  const [internalInstitution, setInternalInstitution] = useState<InstitutionType | ''>('');
  const [selectedStaffRole, setSelectedStaffRole] = useState('');

  const [designation, setDesignation] = useState('');
  const deptHostel = '';
  const [mobileNumber, setMobileNumber] = useState('');
  const [govtIdType, setGovtIdType] = useState<GovtIdType>('Aadhaar');
  const [govtIdNumber, setGovtIdNumber] = useState('');

  const [zoneA, setZoneA] = useState(false);
  const [zoneB, setZoneB] = useState(false);
  const [zoneC, setZoneC] = useState(false);


  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [cardholderSig, setCardholderSig] = useState<string>('');
  const [signatureUploading, setSignatureUploading] = useState(false);
  const { user } = useAuth();
  const [office, setOffice] = useState<string>(user.officeId ?? '');
  const canChooseOffice = managesAccounts(user);
  const authority = useBadgeAuthority(isOpen, canChooseOffice && isOfficeId(office) ? office : user.officeId);

  // Load departments from API
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
    if (isOpen) {
      setOffice(user.officeId ?? '');
      loadDepartments();
    }
  }, [isOpen, user.officeId]);

  if (!isOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Compute values for preview and save
  const computedDepartment =
    personnelType === 'EXTERNAL'
      ? selectedExternalDept
      : personnelType === 'INTERNAL' && internalInstitution && selectedStaffRole ? `${internalInstitution} - ${selectedStaffRole}` : '';

  const computedInstitution = internalInstitution;

  const computedCategory =
    personnelType === 'EXTERNAL' ? 'External Agency' : selectedStaffRole;

  const previewPass: Partial<PassEntity> = {
    ...authority,
    pass_number: 'DGPCONF-2026-AUTO',
    full_name: fullName || 'Full Name',
    father_or_spouse_name: fatherName,
    personnel_type: personnelType || undefined,
    institution: computedInstitution || undefined,
    institution_other: undefined,
    category: computedCategory,
    department: computedDepartment,
    mobile_number: mobileNumber,
    govt_id_type: govtIdType,
    govt_id_number: govtIdNumber,
    zone_a: Boolean(computedInstitution && zoneA),
    gate_zone_a: computedInstitution && zoneA ? getDefaultGate(computedInstitution, 'A') : undefined,
    zone_b: Boolean(computedInstitution && zoneB),
    gate_zone_b: computedInstitution && zoneB ? getDefaultGate(computedInstitution, 'B') : undefined,
    zone_c: Boolean(computedInstitution && zoneC),
    gate_zone_c: computedInstitution && zoneC ? getDefaultGate(computedInstitution, 'C') : undefined,
    photo_url: photoUrl,
    cardholder_signature_url: cardholderSig,
    has_hologram: true,
    has_official_seal: true,
    verification_token: 'PV-2026-PREVIEW-AP',
  };

  const handleSubmit = async (e?: React.FormEvent, shouldPrint: boolean = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (signatureUploading || loading) return;
    setError(null);
    setSubmitAction(shouldPrint ? 'print' : 'queue');

    if (!personnelType || !computedInstitution || !computedDepartment) {
      setError(!personnelType ? 'Select a personnel category.' : !computedInstitution ? 'Select an institution.' : 'Select a department or staff role.');
      setSubmitAction(null);
      return;
    }
    if (!fullName.trim()) {
      setError('Cardholder Full Name is required.');
      setSubmitAction(null);
      return;
    }
    if (!mobileNumber.trim()) {
      setError('Mobile Number is required.');
      setSubmitAction(null);
      return;
    }
    if (!govtIdNumber.trim()) {
      setError('Government ID Number is required.');
      setSubmitAction(null);
      return;
    }

    try {
      setLoading(true);

      // Pre-check for duplicate passes (Name + Mobile + Govt ID)
      try {
        const checkUrl = `/api/passes/check-duplicate?full_name=${encodeURIComponent(fullName.trim())}&mobile_number=${encodeURIComponent(mobileNumber.trim())}&govt_id_number=${encodeURIComponent(govtIdNumber.trim())}`;
        const checkRes = await fetch(checkUrl);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.isDuplicate) {
            toast.warning('Already present', checkData.message || 'A pass for this cardholder is already saved or printed.');
            setError(checkData.message || 'Already present: A pass for this cardholder is already saved or printed.');
            setLoading(false);
            setSubmitAction(null);
            return;
          }
        }
      } catch {
        // Fallback to backend POST check with advisory lock
      }

      const payload: CreatePassInput = {
        full_name: fullName.trim(),
        father_or_spouse_name: fatherName.trim(),
        personnel_type: personnelType,
        institution: computedInstitution,
        institution_other: undefined,
        category: computedCategory,
        department: computedDepartment,
        designation_or_trade: designation.trim() || undefined,
        dept_hostel_quarter: deptHostel.trim() || undefined,
        mobile_number: mobileNumber.trim(),
        govt_id_type: govtIdType,
        govt_id_number: govtIdNumber.trim(),
        zone_a: zoneA,
        gate_zone_a: zoneA ? getDefaultGate(computedInstitution, 'A') : undefined,
        zone_b: zoneB,
        gate_zone_b: zoneB ? getDefaultGate(computedInstitution, 'B') : undefined,
        zone_c: zoneC,
        gate_zone_c: zoneC ? getDefaultGate(computedInstitution, 'C') : undefined,
        photo_url: photoUrl || undefined,
        cardholder_signature_url: cardholderSig || undefined,
        office_id: isOfficeId(office) ? office : undefined,
        has_hologram: true,
        has_official_seal: true,
        status: 'READY_TO_PRINT',
      };

      const res = await fetch('/api/passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409 || data.error?.toLowerCase().includes('already present')) {
          toast.warning('Already present', data.error || 'A pass for this cardholder is already saved or printed.');
        }
        throw new Error(data.error || 'Failed to issue pass');
      }

      const createdPass = await res.json();
      setCardholderSig('');
      if (shouldPrint && onPrint) {
        onPrint(createdPass);
      } else {
        onCreated(createdPass);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setSubmitAction(null);
    }
  };

  return (
    <>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Issue security duty ID card" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          {/* Modal Header */}
          <div className="px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold tracking-wide uppercase">
                  Issue Security Duty ID Card
                </h2>
                <p className="text-[11px] text-slate-300">
                  Official Credential Registry • External Agencies &amp; Campus Institutions
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            {/* Left: Input Form */}
            <form onSubmit={(e) => handleSubmit(e, false)} className="min-w-0 space-y-3">
              {canChooseOffice
                ? <OfficePicker label="Issuing office" value={office} onChange={setOffice} emptyLabel={user.officeId ? undefined : 'Unassigned'} />
                : <p className="text-sm font-medium text-slate-700">{OFFICES.find(item => item.id === user.officeId)?.name}</p>}
              {error && (
                <div role="alert" className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  {error}
                </div>
              )}

              {/* Personnel Classification Switcher */}
              <div role="group" aria-label="Personnel category" className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-700">Personnel category</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={personnelType === 'EXTERNAL'}
                    onClick={() => setPersonnelType('EXTERNAL')}
                    className={`py-2 px-3 rounded-full text-xs font-bold border transition ${
                      personnelType === 'EXTERNAL'
                        ? 'bg-[#0B2545] text-white border-[#0B2545] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    External Department
                  </button>
                  <button
                    type="button"
                    aria-pressed={personnelType === 'INTERNAL'}
                    onClick={() => setPersonnelType('INTERNAL')}
                    className={`py-2 px-3 rounded-full text-xs font-bold border transition ${
                      personnelType === 'INTERNAL'
                        ? 'bg-[#8B1A1A] text-white border-[#8B1A1A] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Campus Staff
                  </button>
                </div>
              </div>

              <InstitutionSelector value={internalInstitution} onChange={setInternalInstitution} />

              {/* External Department Dropdown with Inline Admin Adder */}
              {personnelType === 'EXTERNAL' && (
                <div className="space-y-1.5 p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-950">
                      External Department (Dropdown)
                    </label>
                    {managesAccounts(user) && (<button
                      type="button"
                      onClick={() => {
                        setAddDeptType('EXTERNAL');
                        setIsAddDeptOpen(true);
                      }}
                      className="text-[11px] font-bold text-[#0B2545] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add New Department
                    </button>)}
                  </div>

                  <select
                    value={selectedExternalDept}
                    onChange={(e) => setSelectedExternalDept(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-blue-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                  >
                    <option value="" disabled>Select a department</option>
                    {externalDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-blue-800">
                    Includes Police, IB, State intelligence, Special Branch, Revenue, Electricity, Telecom, etc.
                  </p>
                </div>
              )}

              {/* Internal Institution & Staff Role Dropdowns with Inline Admin Adder */}
              {personnelType === 'INTERNAL' && (
                <div className="space-y-3 p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200">
                  

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-amber-950">
                        Staff / Personnel Role
                      </label>
                      {managesAccounts(user) && (<button
                        type="button"
                        onClick={() => {
                          setAddDeptType('INTERNAL');
                          setIsAddDeptOpen(true);
                        }}
                        className="text-[11px] font-bold text-[#8B1A1A] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add New Role
                      </button>)}
                    </div>

                    <select
                      value={selectedStaffRole}
                      onChange={(e) => setSelectedStaffRole(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]"
                    >
                      <option value="" disabled>Select a staff role</option>
                      {internalStaffRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-amber-800 mt-1">
                      Administration, Faculty, Non Teaching, Engineering, Students, Boarders, Hostel, Workers, Contingency, etc.
                    </p>
                  </div>
                </div>
              )}

              {/* Personal Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cardholder Full Name *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Sri. R. Venkatesh"
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Father’s / Spouse’s Name
                  </label>
                  <input
                    type="text"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="e.g. Sri. K. Narayana"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Designation / Title
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Inspector / Assistant Engineer"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="+91 98490 12345"
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Govt. ID Type &amp; Number *
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  <select
                    value={govtIdType}
                    onChange={(e) => setGovtIdType(e.target.value as GovtIdType)}
                    className="col-span-2 px-2 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none"
                  >
                    <option value="Aadhaar">Aadhaar</option>
                    <option value="Institute ID">Official ID</option>
                    <option value="Voter ID">Voter ID</option>
                    <option value="PAN Card">PAN Card</option>
                    <option value="Driving License">DL</option>
                  </select>
                  <input
                    type="text"
                    value={govtIdNumber}
                    onChange={(e) => setGovtIdNumber(e.target.value)}
                    placeholder="ID Number"
                    required
                    className="col-span-3 px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none"
                  />
                </div>
              </div>


              {/* Permitted Access Zones Attached to Selected Institution */}
              <SecurityZoneToggles
                zoneA={zoneA}
                zoneB={zoneB}
                zoneC={zoneC}
                onToggle={(field) => {
                  if (field === 'zone_a') setZoneA((prev) => !prev);
                  else if (field === 'zone_b') setZoneB((prev) => !prev);
                  else if (field === 'zone_c') setZoneC((prev) => !prev);
                }}
                institution={internalInstitution}
                title="Permitted Access Zones"
                compact
              />

              <div className="grid gap-3 min-[600px]:grid-cols-2">
                <section aria-label="Passport photograph" className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2.5">
                    {photoUrl ? (
                      <img src={photoUrl} alt="Attached photograph" className="size-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500">
                        <ImageIcon aria-hidden="true" className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-700">Passport photograph</h3>
                      <p role="status" className={`mt-0.5 text-xs ${photoUrl ? 'font-medium text-emerald-700' : 'text-slate-600'}`}>
                        {photoUrl ? 'Photograph attached' : 'No photo attached'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input id={photoInputId} type="file" accept="image/*" disabled={loading}
                      aria-label="Upload photograph" onChange={handlePhotoUpload} className="peer sr-only" />
                    <label htmlFor={photoInputId}
                      className="operations-action inline-flex min-h-9 cursor-pointer items-center gap-2 border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 peer-disabled:pointer-events-none peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-police-navy">
                      <Upload aria-hidden="true" className="size-3 shrink-0" />
                      {photoUrl ? 'Replace photo' : 'Upload photo'}
                    </label>
                    <PillButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => setIsCameraOpen(true)}
                      icon={<Camera aria-hidden="true" className="size-3" />}
                    >
                      Use camera
                    </PillButton>
                  </div>
                </section>
                <SignaturePad
                  label="Cardholder Signature"
                  onSignatureChange={setCardholderSig}
                  initialSignature={cardholderSig}
                  allowSample={true}
                  disabled={loading}
                  onUploadPendingChange={setSignatureUploading}
                />
              </div>
              <p className="text-xs text-slate-600">The issuing office’s saved signature is applied when the pass is approved.</p>
            </form>

            <aside aria-label="Live badge preview" className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:sticky lg:top-0">
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-police-navy">Badge preview</h3>
                <span className="text-xs text-slate-600">80 × 120 mm</span>
              </div>
              <div className="[zoom:0.72]">
                <PrintableDutyCard pass={previewPass} side="front" hideShadow />
              </div>
              <p className="text-center text-xs text-slate-600">Valid from print date through {PASS_VALID_TO_LABEL}</p>
            </aside>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <PillButton variant="secondary" size="sm" onClick={onClose} type="button" disabled={loading}>
              Cancel
            </PillButton>
            <PillButton
              variant="primary"
              size="sm"
              type="button"
              onClick={(e) => handleSubmit(e, false)}
              disabled={loading || signatureUploading}
            >
              {loading && submitAction === 'queue' ? 'Registering...' : 'Register & Queue for Print'}
            </PillButton>
            <PillButton
              variant="crimson"
              size="sm"
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={loading || signatureUploading}
              icon={<Printer className="w-4 h-4" />}
            >
              {loading && submitAction === 'print' ? 'Preparing Print...' : 'Print'}
            </PillButton>
          </div>
        </div>
      </div>

      {/* Modal to add new External Department or Internal Staff Role */}
      <AddDepartmentModal
        isOpen={isAddDeptOpen}
        initialType={addDeptType}
        onClose={() => setIsAddDeptOpen(false)}
        onAdded={(newItem) => {
          void loadDepartments();
          if (newItem.type === 'EXTERNAL') {
            setSelectedExternalDept(newItem.name);
          } else {
            setSelectedStaffRole(newItem.name);
          }
        }}
      />
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPhotoCaptured={(url) => setPhotoUrl(url)}
      />
    </>
  );
};
