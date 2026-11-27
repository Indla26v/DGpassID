'use client';

import { useAuth } from '@/auth/AuthProvider';
import { isOfficeId, managesAccounts, OFFICES } from '@/core/domain/offices';
import { OfficePicker } from './OfficePicker';
import { useDialog } from '../common/useDialog';
import React, { useState, useEffect } from 'react';
import { useToast } from '../common/Toast';
import { InstitutionSelector } from '../common/InstitutionSelector';
import { ValidityPeriodSelector, toIsoDate } from '../common/ValidityPeriodSelector';
import { PillButton } from '../common/PillButton';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { AddDepartmentModal } from './AddDepartmentModal';
import { PassEntity, UpdatePassInput, PersonnelType } from '@/core/domain/entities/pass.entity';
import { PassStatus, InstitutionType, CategoryType, GovtIdType } from '@/core/domain/types/pass-status.enum';
import { X, Save, Plus, Camera, CheckCircle } from 'lucide-react';
import { CameraCaptureModal } from '../common/CameraCaptureModal';

interface PassEditModalProps {
  pass: PassEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (pass: PassEntity) => void;
}

export const PassEditModal: React.FC<PassEditModalProps> = (props) => {
  if (!props.isOpen || !props.pass) return null;
  return <PassEditModalContent {...props} pass={props.pass} key={props.pass.id} />;
};

const PassEditModalContent: React.FC<Omit<PassEditModalProps, 'pass'> & { pass: PassEntity }> = ({
  pass,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const toast = useToast();
  const { user } = useAuth();
  const [office, setOffice] = useState('');
  const canAssignOffice = managesAccounts(user) && !pass.office_id && !pass.approved_by &&
    ['DRAFT', 'PENDING_APPROVAL'].includes(pass.status);
  const [externalDepartments, setExternalDepartments] = useState<string[]>([]);
  const [internalStaffRoles, setInternalStaffRoles] = useState<string[]>([]);
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);

  const [fullName, setFullName] = useState(pass.full_name);
  const [fatherName, setFatherName] = useState(pass.father_or_spouse_name);
  const [personnelType, setPersonnelType] = useState<PersonnelType>(pass.personnel_type || 'INTERNAL');
  const [department, setDepartment] = useState(pass.department);
  const [institution, setInstitution] = useState<InstitutionType>(pass.institution);
  const [category, setCategory] = useState<CategoryType | string>(pass.category);
  const [mobileNumber, setMobileNumber] = useState(pass.mobile_number);
  const [govtIdType, setGovtIdType] = useState<GovtIdType>(pass.govt_id_type);
  const [govtIdNumber, setGovtIdNumber] = useState(pass.govt_id_number);
  const [validFrom, setValidFrom] = useState(toIsoDate(pass.valid_from, '2026-11-27'));
  const [validTo, setValidTo] = useState(toIsoDate(pass.valid_to, '2026-11-30'));
  const [status, setStatus] = useState<PassStatus>(pass.status);

  const [zoneA, setZoneA] = useState(pass.zone_a);
  const [gateZoneA] = useState(pass.gate_zone_a || '');
  const [zoneB, setZoneB] = useState(pass.zone_b);
  const [gateZoneB] = useState(pass.gate_zone_b || '');
  const [zoneC, setZoneC] = useState(pass.zone_c);
  const [gateZoneC] = useState(pass.gate_zone_c || '');

  const [photoUrl, setPhotoUrl] = useState<string>(pass.photo_url || '');
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        valid_from: validFrom,
        valid_to: validTo,
        status,
        office_id: canAssignOffice && isOfficeId(office) ? office : undefined,
        photo_url: photoUrl || undefined,
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
    full_name: fullName,
    father_or_spouse_name: fatherName,
    personnel_type: personnelType,
    institution,
    category,
    department,
    mobile_number: mobileNumber,
    govt_id_type: govtIdType,
    govt_id_number: govtIdNumber,
    valid_from: validFrom,
    valid_to: validTo,
    status,
    photo_url: photoUrl,
    zone_a: zoneA,
    gate_zone_a: gateZoneA,
    zone_b: zoneB,
    gate_zone_b: gateZoneB,
    zone_c: zoneC,
    gate_zone_c: gateZoneC,
  };

  return (
    <>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit duty pass" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 bg-[#0B2545] text-white flex items-center justify-between border-b border-[#8B1A1A]">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-extrabold tracking-wide uppercase">
                Modify Pass: {pass.pass_number}
              </h2>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#8B1A1A] font-bold">
                {status}
              </span>
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

          {/* Content */}
          <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1">
            <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-4">
              {canAssignOffice
                ? <OfficePicker label="Assign issuing office" value={office} onChange={setOffice} emptyLabel="Unassigned" />
                : <p className="text-sm font-medium text-slate-700">{OFFICES.find(item => item.id === pass.office_id)?.name ?? 'Unassigned'}</p>}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  {error}
                </div>
              )}

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pass Credential Status
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
                  {(['DRAFT', 'APPROVED', 'READY_TO_PRINT', 'PRINTED', 'ISSUED', 'REVOKED'] as PassStatus[]).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatus(st)}
                        className={`py-1 px-1 rounded-full text-[10px] font-bold border transition ${
                          status === st
                            ? st === 'REVOKED'
                              ? 'bg-rose-700 text-white border-rose-700'
                              : 'bg-[#0B2545] text-white border-[#0B2545]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {st.replace(/_/g, ' ')}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Classification */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setPersonnelType('EXTERNAL')}
                  className={`py-1.5 px-3 rounded-full text-xs font-bold border transition ${
                    personnelType === 'EXTERNAL'
                      ? 'bg-[#0B2545] text-white'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  External Department
                </button>
                <button
                  type="button"
                  onClick={() => setPersonnelType('INTERNAL')}
                  className={`py-1.5 px-3 rounded-full text-xs font-bold border transition ${
                    personnelType === 'INTERNAL'
                      ? 'bg-[#8B1A1A] text-white'
                      : 'bg-white text-slate-700'
                  }`}
                >
                  Campus Staff (IISER / IIT / ICI)
                </button>
              </div>

              <InstitutionSelector value={institution} onChange={setInstitution} />

              {/* Department Dropdown */}
              {personnelType === 'EXTERNAL' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      External Department (Dropdown)
                    </label>
                    {managesAccounts(user) && (<button
                      type="button"
                      onClick={() => setIsAddDeptOpen(true)}
                      className="text-[11px] font-bold text-[#0B2545] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      Add New
                    </button>)}
                  </div>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    {externalDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Staff Category</label>
                      {managesAccounts(user) && (<button
                        type="button"
                        onClick={() => setIsAddDeptOpen(true)}
                        className="text-[11px] font-bold text-[#8B1A1A] hover:underline flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        Add New Role
                      </button>)}
                    </div>
                    <select
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setDepartment(`${institution} - ${e.target.value}`);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      {internalStaffRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Full Name & Father's Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cardholder Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                  />
                </div>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0B2545]"
                />
              </div>

              {/* Govt ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Govt ID Details
                </label>
                <div className="grid grid-cols-5 gap-2">
                  <select
                    value={govtIdType}
                    onChange={(e) => setGovtIdType(e.target.value as GovtIdType)}
                    className="col-span-2 px-2 py-2 text-xs rounded-xl border border-slate-300 bg-white"
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
                    required
                    className="col-span-3 px-3 py-2 text-xs rounded-xl border border-slate-300"
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

              {/* Zones */}
              <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700 block mb-1">
                  Authorized Access Zones
                </span>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={zoneA}
                    onChange={(e) => setZoneA(e.target.checked)}
                    className="rounded accent-[#0B2545]"
                  />
                  <span>Zone-A (Residential / Hostel)</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={zoneB}
                    onChange={(e) => setZoneB(e.target.checked)}
                    className="rounded accent-[#0B2545]"
                  />
                  <span>Zone-B (Academic / Admin)</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={zoneC}
                    onChange={(e) => setZoneC(e.target.checked)}
                    className="rounded accent-[#0B2545]"
                  />
                  <span>Zone-C (Service / Utility)</span>
                </label>
              </div>

              {/* Cardholder Photograph */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Cardholder Photograph
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
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => setPhotoUrl(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-0.5 file:px-2.5 file:rounded-full file:border-0 file:text-[11px] file:font-semibold file:bg-[#0B2545] file:text-white cursor-pointer"
                  />
                  {photoUrl && (
                    <span className="text-[11px] text-emerald-700 font-bold shrink-0 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-600" /> Photo Attached
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <PillButton variant="secondary" onClick={onClose} type="button">
                  Cancel
                </PillButton>
                <PillButton variant="primary" type="submit" disabled={loading} icon={<Save className="w-3.5 h-3.5" />}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </PillButton>
              </div>
            </form>

            {/* Right Preview */}
            <div className="lg:col-span-5 bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center">
              <span className="text-xs font-extrabold text-[#0B2545] uppercase tracking-wider mb-2">
                Badge Preview
              </span>
              <div className="transform scale-95 origin-top">
                <PrintableDutyCard pass={previewPass} side="front" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <AddDepartmentModal
        isOpen={isAddDeptOpen}
        initialType={personnelType}
        onClose={() => setIsAddDeptOpen(false)}
        onAdded={(newItem) => {
          loadDepartments();
          if (newItem.type === 'EXTERNAL') {
            setDepartment(newItem.name);
          } else {
            setCategory(newItem.name);
            setDepartment(`${institution} - ${newItem.name}`);
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
