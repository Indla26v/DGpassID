'use client';

import { useAuth } from '@/auth/AuthProvider';
import { isOfficeId, managesAccounts, OFFICES } from '@/core/domain/offices';
import { OfficePicker } from './OfficePicker';
import { useDialog } from '../common/useDialog';
import React, { useState, useEffect } from 'react';
import { useToast } from '../common/Toast';
import { InstitutionSelector } from '../common/InstitutionSelector';
import { ValidityPeriodSelector } from '../common/ValidityPeriodSelector';
import { PillButton } from '../common/PillButton';
import { SignaturePad } from '../badges/SignaturePad';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
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
import { X, Plus, UserPlus, Camera } from 'lucide-react';
import { CameraCaptureModal } from '../common/CameraCaptureModal';

interface PassCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (pass: PassEntity) => void;
}

export const PassCreateModal: React.FC<PassCreateModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Departments & Roles fetched from PostgreSQL
  const [externalDepartments, setExternalDepartments] = useState<string[]>([]);
  const [internalStaffRoles, setInternalStaffRoles] = useState<string[]>([]);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [addDeptType, setAddDeptType] = useState<'EXTERNAL' | 'INTERNAL'>('EXTERNAL');

  // Classification Mode: EXTERNAL vs INTERNAL
  const [personnelType, setPersonnelType] = useState<PersonnelType>('EXTERNAL');

  // Form State
  const [fullName, setFullName] = useState('');
  const [fatherName, setFatherName] = useState('');

  // If EXTERNAL:
  const [selectedExternalDept, setSelectedExternalDept] = useState('Police department');

  // If INTERNAL:
  const [internalInstitution, setInternalInstitution] = useState<InstitutionType>('IISER');
  const [selectedStaffRole, setSelectedStaffRole] = useState('Faculty Members');

  const [designation, setDesignation] = useState('');
  const deptHostel = '';
  const [mobileNumber, setMobileNumber] = useState('');
  const [govtIdType, setGovtIdType] = useState<GovtIdType>('Aadhaar');
  const [govtIdNumber, setGovtIdNumber] = useState('');

  const [zoneA, setZoneA] = useState(true);
  const [gateZoneA, setGateZoneA] = useState('IISER Gate-2 (Hostel Sector)');
  const [zoneB, setZoneB] = useState(true);
  const [gateZoneB, setGateZoneB] = useState('IISER Gate-1 (Main/Academic)');
  const [zoneC, setZoneC] = useState(false);
  const [gateZoneC, setGateZoneC] = useState('IISER Gate-3 (Utility/Service)');

  const [validFrom, setValidFrom] = useState('2026-11-27');
  const [validTo, setValidTo] = useState('2026-11-30');

  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [cardholderSig, setCardholderSig] = useState<string>('');
  const { user } = useAuth();
  const [office, setOffice] = useState<string>(user.officeId ?? '');
  const canChooseOffice = managesAccounts(user);

  // Load departments from API
  const loadDepartments = async () => {
    try {
      const res = await fetch('/api/departments');
      if (res.ok) {
        const data = await res.json();
        setExternalDepartments(data.externalDepartments || []);
        setInternalStaffRoles(data.internalStaffRoles || []);
        if (data.externalDepartments?.length > 0 && !selectedExternalDept) {
          setSelectedExternalDept(data.externalDepartments[0]);
        }
        if (data.internalStaffRoles?.length > 0 && !selectedStaffRole) {
          setSelectedStaffRole(data.internalStaffRoles[0]);
        }
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

  const applyGatePreset = (preset: 'IISER' | 'IIT' | 'ALL') => {
    if (preset === 'IISER') {
      setZoneA(true);
      setGateZoneA('IISER Gate-2 (Hostel Sector)');
      setZoneB(true);
      setGateZoneB('IISER Gate-1 (Main/Academic)');
      setZoneC(false);
      setGateZoneC('IISER Gate-3 (Utility/Service)');
    } else if (preset === 'IIT') {
      setZoneA(false);
      setGateZoneA('IIT Transit Gate-B (Hostel Block)');
      setZoneB(true);
      setGateZoneB('IIT Main Gate-A (Academic Block)');
      setZoneC(false);
      setGateZoneC('IIT Service Gate-C (Logistics)');
    } else {
      setZoneA(true);
      setGateZoneA('All Residential & Hostel Gates');
      setZoneB(true);
      setGateZoneB('All Academic & Admin Gates');
      setZoneC(true);
      setGateZoneC('All Service & Utility Gates');
    }
  };

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
      : `${internalInstitution} - ${selectedStaffRole}`;

  const computedInstitution: InstitutionType =
    internalInstitution;

  const computedCategory =
    personnelType === 'EXTERNAL' ? 'External Agency' : selectedStaffRole;

  const previewPass: Partial<PassEntity> = {
    pass_number: 'DGPCONF-2026-AUTO',
    full_name: fullName || 'Full Name',
    father_or_spouse_name: fatherName,
    personnel_type: personnelType,
    institution: computedInstitution,
    institution_other: undefined,
    category: computedCategory,
    department: computedDepartment,
    mobile_number: mobileNumber,
    govt_id_type: govtIdType,
    govt_id_number: govtIdNumber,
    zone_a: zoneA,
    gate_zone_a: gateZoneA,
    zone_b: zoneB,
    gate_zone_b: gateZoneB,
    zone_c: zoneC,
    gate_zone_c: gateZoneC,
    valid_from: validFrom,
    valid_to: validTo,
    photo_url: photoUrl,
    cardholder_signature_url: cardholderSig,
    has_hologram: true,
    has_official_seal: true,
    verification_token: 'PV-2026-PREVIEW-AP',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Cardholder Full Name is required.');
      return;
    }
    if (!mobileNumber.trim()) {
      setError('Mobile Number is required.');
      return;
    }
    if (!govtIdNumber.trim()) {
      setError('Government ID Number is required.');
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
        gate_zone_a: zoneA ? gateZoneA.trim() : undefined,
        zone_b: zoneB,
        gate_zone_b: zoneB ? gateZoneB.trim() : undefined,
        zone_c: zoneC,
        gate_zone_c: zoneC ? gateZoneC.trim() : undefined,
        valid_from: validFrom,
        valid_to: validTo,
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
      onCreated(createdPass);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Issue security duty pass" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold tracking-wide uppercase">
                  Issue Security Duty Pass
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
          <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1">
            {/* Left: Input Form */}
            <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-4">
              {canChooseOffice
                ? <OfficePicker label="Issuing office" value={office} onChange={setOffice} emptyLabel={user.officeId ? undefined : 'Unassigned'} />
                : <p className="text-sm font-medium text-slate-700">{OFFICES.find(item => item.id === user.officeId)?.name}</p>}
              {error && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  {error}
                </div>
              )}

              {/* Personnel Classification Switcher */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Select Personnel Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
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
                    onClick={() => setPersonnelType('INTERNAL')}
                    className={`py-2 px-3 rounded-full text-xs font-bold border transition ${
                      personnelType === 'INTERNAL'
                        ? 'bg-[#8B1A1A] text-white border-[#8B1A1A] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Campus Staff (IISER / IIT / ICI)
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

              {/* Pass Validity Options */}
              <ValidityPeriodSelector
                validFrom={validFrom}
                validTo={validTo}
                onChangeValidFrom={setValidFrom}
                onChangeValidTo={setValidTo}
              />

              {/* Permitted Access Zones */}
              <div className="border-t border-slate-200 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Permitted Access Zones</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyGatePreset('IISER')}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#0B2545]/10 text-[#0B2545] hover:bg-[#0B2545]/20"
                    >
                      IISER Gates
                    </button>
                    <button
                      type="button"
                      onClick={() => applyGatePreset('IIT')}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#8B1A1A]/10 text-[#8B1A1A] hover:bg-[#8B1A1A]/20"
                    >
                      IIT Gates
                    </button>
                    <button
                      type="button"
                      onClick={() => applyGatePreset('ALL')}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      All Zones
                    </button>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={zoneA}
                      onChange={(e) => setZoneA(e.target.checked)}
                      className="rounded accent-[#0B2545]"
                    />
                    <span>Zone-A (Residential / Hostel Sector)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={zoneB}
                      onChange={(e) => setZoneB(e.target.checked)}
                      className="rounded accent-[#0B2545]"
                    />
                    <span>Zone-B (Academic / Administration Block)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={zoneC}
                      onChange={(e) => setZoneC(e.target.checked)}
                      className="rounded accent-[#0B2545]"
                    />
                    <span>Zone-C (Service / Utility / Gate Area)</span>
                  </label>
                </div>
              </div>

              {/* Photo Upload & Hologram Controls */}
              <div className="border-t border-slate-200 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Passport Photograph
                    </label>
                    <PillButton
                      type="button"
                      variant="crimson"
                      size="sm"
                      onClick={() => setIsCameraOpen(true)}
                      icon={<Camera className="w-3 h-3" />}
                    >
                      Capture Image
                    </PillButton>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-0.5 file:px-2.5 file:rounded-full file:border-0 file:text-[11px] file:font-semibold file:bg-[#0B2545] file:text-white cursor-pointer"
                  />
                  {photoUrl && (
                    <span className="text-[10px] text-emerald-700 font-bold block">
                      Photograph Attached
                    </span>
                  )}
                </div>


              </div>

              {/* Digital Signatures */}
              <div className="border-t border-slate-200 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SignaturePad
                  label="Cardholder Signature"
                  onSignatureChange={setCardholderSig}
                  initialSignature={cardholderSig}
                  allowSample={true}
                />
                <p className="self-center text-xs text-slate-600">The issuing office’s saved signature is applied when the pass is approved.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <PillButton variant="secondary" onClick={onClose} type="button">
                  Cancel
                </PillButton>
                <PillButton variant="primary" type="submit" disabled={loading}>
                  {loading ? 'Registering...' : 'Register & Queue for Print'}
                </PillButton>
              </div>
            </form>

            {/* Right: Real-time Live Badge Preview (Exact 9cm x 12cm) */}
            <div className="lg:col-span-5 bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center">
              <span className="text-xs font-extrabold text-[#0B2545] uppercase tracking-wider mb-2">
                Live Badge Preview (9cm × 12cm)
              </span>
              <div className="transform scale-95 origin-top">
                <PrintableDutyCard pass={previewPass} side="front" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal to add new External Department or Internal Staff Role */}
      <AddDepartmentModal
        isOpen={isAddDeptOpen}
        initialType={addDeptType}
        onClose={() => setIsAddDeptOpen(false)}
        onAdded={(newItem) => {
          setOffice(user.officeId ?? '');
      loadDepartments();
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
