'use client';

import { useDialog } from '../common/useDialog';
import React, { useState, useEffect } from 'react';
import { useToast } from '../common/Toast';
import { InstitutionSelector } from '../common/InstitutionSelector';
import { ValidityPeriodSelector, toIsoDate } from '../common/ValidityPeriodSelector';
import { PillButton } from '../common/PillButton';
import { SignaturePad } from '../badges/SignaturePad';
import { PrintableDutyCard } from '../badges/PrintableDutyCard';
import { CameraCaptureModal } from '../common/CameraCaptureModal';
import {
  PassEntity,
  UpdatePassInput,
  PersonnelType,
} from '@/core/domain/entities/pass.entity';
import {
  InstitutionType,
  GovtIdType,
} from '@/core/domain/types/pass-status.enum';
import { X, Edit3, Camera, AlertCircle, CheckCircle } from 'lucide-react';

interface PrintTeamEditModalProps {
  pass: PassEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (pass: PassEntity) => void;
}

export const PrintTeamEditModal: React.FC<PrintTeamEditModalProps> = (props) => {
  if (!props.isOpen || !props.pass) return null;
  return <PrintTeamEditModalContent {...props} pass={props.pass} key={props.pass.id} />;
};

const PrintTeamEditModalContent: React.FC<Omit<PrintTeamEditModalProps, 'pass'> & { pass: PassEntity }> = ({
  pass,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const dialogRef = useDialog(isOpen, onClose);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Departments & Roles
  const [externalDepartments, setExternalDepartments] = useState<string[]>([]);
  const [internalStaffRoles, setInternalStaffRoles] = useState<string[]>([]);

  // Form State
  const [personnelType, setPersonnelType] = useState<PersonnelType>(
    pass.personnel_type || 'EXTERNAL'
  );
  const [fullName, setFullName] = useState(pass.full_name || '');
  const [fatherName, setFatherName] = useState(pass.father_or_spouse_name || '');
  const [selectedExternalDept, setSelectedExternalDept] = useState(
    pass.department || 'Police department'
  );
  const [internalInstitution, setInternalInstitution] = useState<InstitutionType>(
    pass.institution
  );
  const [selectedStaffRole, setSelectedStaffRole] = useState(
    pass.category || 'Faculty Members'
  );
  const [mobileNumber, setMobileNumber] = useState(pass.mobile_number || '');
  const [govtIdType, setGovtIdType] = useState<GovtIdType>(
    pass.govt_id_type || 'Aadhaar'
  );
  const [govtIdNumber, setGovtIdNumber] = useState(pass.govt_id_number || '');
  const [validFrom, setValidFrom] = useState(toIsoDate(pass.valid_from, '2026-11-27'));
  const [validTo, setValidTo] = useState(toIsoDate(pass.valid_to, '2026-12-02'));
  const operatorName = 'Print Station Operator';

  const [zoneA, setZoneA] = useState(pass.zone_a ?? true);
  const [zoneB, setZoneB] = useState(pass.zone_b ?? true);
  const [zoneC, setZoneC] = useState(pass.zone_c ?? false);

  const [photoUrl, setPhotoUrl] = useState<string>(pass.photo_url || '');
  const [cardholderSig, setCardholderSig] = useState<string>(
    pass.cardholder_signature_url || ''
  );

  useEffect(() => {
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => {
        setExternalDepartments(data.externalDepartments || []);
        setInternalStaffRoles(data.internalStaffRoles || []);
      })
      .catch((err) => console.error(err));
  }, []);

  const computedDepartment =
    personnelType === 'EXTERNAL'
      ? selectedExternalDept
      : `${internalInstitution} - ${selectedStaffRole}`;

  const computedInstitution: InstitutionType =
    internalInstitution;

  const computedCategory =
    personnelType === 'EXTERNAL' ? 'External Agency' : selectedStaffRole;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPhotoUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const previewPass: Partial<PassEntity> = {
    ...pass,
    full_name: fullName || 'Cardholder Name',
    father_or_spouse_name: fatherName,
    personnel_type: personnelType,
    institution: computedInstitution,
    category: computedCategory,
    department: computedDepartment,
    mobile_number: mobileNumber,
    govt_id_type: govtIdType,
    govt_id_number: govtIdNumber,
    valid_from: validFrom,
    valid_to: validTo,
    zone_a: zoneA,
    zone_b: zoneB,
    zone_c: zoneC,
    photo_url: photoUrl,
    cardholder_signature_url: cardholderSig,
  };

  const handleSave = async (e: React.FormEvent) => {
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

      // Pre-check for duplicate passes (excluding current pass)
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
        institution: computedInstitution,
        institution_other: undefined,
        category: computedCategory,
        department: computedDepartment,
        mobile_number: mobileNumber.trim(),
        govt_id_type: govtIdType,
        govt_id_number: govtIdNumber.trim(),
        valid_from: validFrom,
        valid_to: validTo,
        zone_a: zoneA,
        zone_b: zoneB,
        zone_c: zoneC,
        photo_url: photoUrl || undefined,
        cardholder_signature_url: cardholderSig || undefined,
        status: 'PENDING_APPROVAL', // Stays pending for Admin approval
      };

      const res = await fetch(`/api/passes/${pass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updatePayload,
          operatorName,
        }),
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
      setError(err.message || 'Error updating pass details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit submitted pass" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 bg-[#8B1A1A] text-white flex items-center justify-between border-b border-[#0B2545]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <Edit3 className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wide">
                  Edit Pass Details (Awaiting Admin Approval)
                </h2>
                <p className="text-[11px] text-white/80">
                  Card Serial: {pass.pass_number} • Token: {pass.verification_token}
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

          {/* Form Content */}
          <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
            <form onSubmit={handleSave} className="lg:col-span-7 space-y-4">
              {error && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Personnel Category Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Personnel Classification
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPersonnelType('EXTERNAL')}
                    className={`py-2 px-3 rounded-full text-xs font-bold border transition ${
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
                    className={`py-2 px-3 rounded-full text-xs font-bold border transition ${
                      personnelType === 'INTERNAL'
                        ? 'bg-[#8B1A1A] text-white'
                        : 'bg-white text-slate-700'
                    }`}
                  >
                    Campus Staff (IISER / IIT / ICI)
                  </button>
                </div>
              </div>

              <InstitutionSelector value={internalInstitution} onChange={setInternalInstitution} />

              {/* Department / Category Selection */}
              {personnelType === 'EXTERNAL' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    External Department
                  </label>
                  <select
                    value={selectedExternalDept}
                    onChange={(e) => setSelectedExternalDept(e.target.value)}
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
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Staff / Personnel Category
                    </label>
                    <select
                      value={selectedStaffRole}
                      onChange={(e) => setSelectedStaffRole(e.target.value)}
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

              {/* Personal Particulars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cardholder Full Name *
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]"
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
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Govt ID Type &amp; Number *
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
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
              </div>

              {/* Pass Validity Options */}
              <ValidityPeriodSelector
                validFrom={validFrom}
                validTo={validTo}
                onChangeValidFrom={setValidFrom}
                onChangeValidTo={setValidTo}
              />

              {/* Access Zones */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700 block mb-1">
                  Permitted Access Zones
                </span>
                <div className="flex flex-wrap gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={zoneA}
                      onChange={(e) => setZoneA(e.target.checked)}
                      className="accent-[#8B1A1A]"
                    />
                    <span>Zone-A (Residential/Hostel)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={zoneB}
                      onChange={(e) => setZoneB(e.target.checked)}
                      className="accent-[#8B1A1A]"
                    />
                    <span>Zone-B (Academic/Admin)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={zoneC}
                      onChange={(e) => setZoneC(e.target.checked)}
                      className="accent-[#8B1A1A]"
                    />
                    <span>Zone-C (Service/Utility)</span>
                  </label>
                </div>
              </div>

              {/* Cardholder Photo with Camera Capture & File Upload */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Cardholder Photo
                  </label>
                  <div className="flex items-center gap-2">
                    <PillButton
                      type="button"
                      variant="crimson"
                      size="sm"
                      onClick={() => setIsCameraOpen(true)}
                      icon={<Camera className="w-3.5 h-3.5" />}
                    >
                      Capture Image
                    </PillButton>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#0B2545] file:text-white cursor-pointer"
                  />
                  {photoUrl && (
                    <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-600" /> Photo Loaded
                    </span>
                  )}
                </div>
              </div>

              {/* Cardholder Signature */}
              <div>
                <SignaturePad
                  label="Cardholder Digital Signature"
                  initialSignature={cardholderSig}
                  onSignatureChange={(url) => setCardholderSig(url)}
                  onClear={() => setCardholderSig('')}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <span className="text-[11px] text-purple-700 font-semibold">
                  Card remains in Awaiting Admin Approval state.
                </span>

                <div className="flex items-center gap-2">
                  <PillButton variant="secondary" onClick={onClose} type="button">
                    Cancel
                  </PillButton>
                  <PillButton variant="crimson" type="submit" disabled={loading}>
                    {loading ? 'Saving Changes...' : 'Save Updated Details'}
                  </PillButton>
                </div>
              </div>
            </form>

            {/* Right Preview */}
            <div className="lg:col-span-5 bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col items-center">
              <span className="text-xs font-extrabold text-[#8B1A1A] uppercase tracking-wider mb-2">
                Live Badge Preview
              </span>
              <div className="transform scale-95 origin-top">
                <PrintableDutyCard pass={previewPass} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPhotoCaptured={(dataUrl) => {
          setPhotoUrl(dataUrl);
        }}
      />
    </>
  );
};
