'use client';

import React, { useState, useRef } from 'react';
import { StationInput } from './StationInput';
import { usePoliceStations } from './usePoliceStations';
import { canonicalStation } from '@/core/domain/police-stations';
import { createPortal } from 'react-dom';
import { useDialog } from '../common/useDialog';
import { PillButton } from '../common/PillButton';
import { CustomSelect } from '../common/CustomSelect';
import { CameraCaptureModal } from '../common/CameraCaptureModal';
import { PoliceBandobusthSelector } from '../common/PoliceBandobusthSelector';
import { PassDetailsGate } from '../common/PassDetailsGate';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { ASI_HC_RANKS, isArRank, normalizeRank, POLICE_RANKS } from '@/core/domain/ranks';
import { formatPhotoUrl } from '@/lib/identity-validation';
import { X, ShieldCheck, User, Camera, Upload, AlertCircle, Save, Trash2 } from 'lucide-react';

const rankOptions = POLICE_RANKS.map((rank) => ({
  value: rank,
  label: (ASI_HC_RANKS as readonly string[]).includes(rank) ? `${rank} (shown as ASI/HC)` : isArRank(rank) ? `${rank} (AR)` : rank,
}));

interface PoliceOfficerEditModalProps {
  pass: PassEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updated: PassEntity) => void;
  onDeleted?: (id: string) => void;
}

export const PoliceOfficerEditModal: React.FC<PoliceOfficerEditModalProps> = ({
  pass,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}) => {
  if (!isOpen || !pass) return null;
  return (
    <PassDetailsGate id={pass.id} key={pass.id} onClose={onClose}>
      {details => <PoliceOfficerEditModalContent pass={details} isOpen={isOpen} onClose={onClose} onUpdated={onUpdated} onDeleted={onDeleted} />}
    </PassDetailsGate>
  );
};

const PoliceOfficerEditModalContent: React.FC<
  Omit<PoliceOfficerEditModalProps, 'pass'> & { pass: PassEntity }
> = ({ pass, isOpen, onClose, onUpdated, onDeleted }) => {
  const dialogRef = useDialog(isOpen, onClose);

  // Form State
  const [fullName, setFullName] = useState(pass.full_name || '');
  const [rank, setRank] = useState(normalizeRank(pass.rank || pass.designation_or_trade) || 'PC');
  const [dateOfBirth, setDateOfBirth] = useState(pass.date_of_birth?.slice(0, 10) || '');
  const [policeIdNumber, setPoliceIdNumber] = useState(pass.police_id_number || '');
  const [policeStation, setPoliceStation] = useState(pass.police_station || '');
  const masterStations = usePoliceStations();
  const [policeUnitDistrict, setPoliceUnitDistrict] = useState(
    pass.police_unit_district || pass.institution_other || ''
  );
  const [mobileNumber, setMobileNumber] = useState(pass.mobile_number || '');
  const [govtIdType] = useState(pass.govt_id_type || 'Aadhaar');
  const [govtIdNumber, setGovtIdNumber] = useState(pass.govt_id_number || '');
  const [photoUrl, setPhotoUrl] = useState<string>(pass.photo_url || '');

  // Duty assignment state
  const [policeZone, setPoliceZone] = useState(pass.police_zone || '');
  const [policeSectorNumber, setPoliceSectorNumber] = useState(pass.police_sector_number || '');
  const [policeSectorName, setPoliceSectorName] = useState(pass.police_sector_name || '');
  const [policeCustomSector, setPoliceCustomSector] = useState(pass.police_custom_sector || '');
  const [securityComponent, setSecurityComponent] = useState(pass.security_component || '');

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG or PNG)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUrl(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDutyChange = (updates: {
    police_zone: string;
    police_sector_number: string;
    police_sector_name: string;
    police_custom_sector?: string;
    security_component?: string;
  }) => {
    setPoliceZone(updates.police_zone);
    setPoliceSectorNumber(updates.police_sector_number);
    setPoliceSectorName(updates.police_sector_name);
    setPoliceCustomSector(updates.police_custom_sector || '');
    setSecurityComponent(updates.security_component || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleting || loading) return;
    setError(null);

    if (!fullName.trim()) {
      setError('Officer Full Name is required');
      return;
    }

    const cleanMob = mobileNumber.replace(/\D/g, '');
    if (cleanMob.length < 10) {
      setError('A valid 10-digit mobile number is required');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        rank: rank.trim(),
        designation_or_trade: rank.trim(),
        police_id_number: policeIdNumber.trim(),
        police_unit_district: policeUnitDistrict.trim(),
        police_station: canonicalStation(masterStations, policeUnitDistrict, policeStation) ?? (policeStation.trim() || null),
        date_of_birth: dateOfBirth || null,
        mobile_number: cleanMob,
        govt_id_type: govtIdType,
        govt_id_number: govtIdNumber.trim(),
        photo_url: photoUrl || null,
        police_zone: policeZone || null,
        police_sector_number: policeSectorNumber || null,
        police_sector_name: policeSectorName || null,
        police_custom_sector: policeCustomSector || null,
        security_component: securityComponent || null,
      };

      const res = await fetch(`/api/passes/${pass.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update police officer record');
      }

      const updated = await res.json();
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update record');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleted || deleting || loading ||
        !window.confirm(`Permanently delete the pass for ${pass.full_name} (${pass.pass_number})?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/passes/${pass.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Could not delete the officer record.');
      }
      onDeleted(pass.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the officer record.');
    } finally {
      setDeleting(false);
    }
  };

  const formattedPhoto = photoUrl ? formatPhotoUrl(photoUrl) : '';

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B2545] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-slate-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight uppercase">
                  Edit Police Officer Record
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#8B1A1A] text-white">
                  {pass.pass_number}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Update officer identification, photo credentials, and Bandobusth sector posting
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-200 hover:bg-white/20 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs text-rose-800 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Officer Identification & Photo (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0B2545] pb-2 border-b border-slate-100">
                <User className="w-4 h-4 text-[#8B1A1A]" />
                <span>Officer Identification</span>
              </div>

              {/* Photo Box & Actions */}
              <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-20 h-24 rounded-lg border border-slate-300 bg-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                  {formattedPhoto ? (
                    <img
                      src={formattedPhoto}
                      alt={fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-400">
                      <User className="w-8 h-8 text-slate-300" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Officer Photograph
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <PillButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setIsCameraOpen(true)}
                      icon={<Camera className="w-3.5 h-3.5" />}
                    >
                      Capture Spot Photo
                    </PillButton>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <PillButton
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      icon={<Upload className="w-3.5 h-3.5" />}
                    >
                      Upload Image
                    </PillButton>
                  </div>
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Officer Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value.toUpperCase())}
                  placeholder="e.g. S. GOUSE BASHA"
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-[#0B2545] rounded-xl text-xs font-semibold text-slate-900 uppercase focus:outline-hidden focus:ring-1 focus:ring-[#0B2545] transition"
                />
              </div>


              <div className="grid grid-cols-2 gap-3">
                {/* Rank */}
                <div className="space-y-1">
                  <span aria-hidden="true" className="block text-[11px] font-bold text-slate-700">Rank *</span>
                  <CustomSelect ariaLabel="Officer rank" value={rank} onChange={setRank} options={rankOptions} searchable />
                </div>

                {/* Police ID Number */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Police ID / Gen No
                  </label>
                  <input
                    type="text"
                    value={policeIdNumber}
                    onChange={(e) => setPoliceIdNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. AP-41782"
                    className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-[#0B2545] rounded-xl text-xs font-mono font-semibold text-slate-900 uppercase focus:outline-hidden focus:ring-1 focus:ring-[#0B2545] transition"
                  />
                </div>
              </div>

              {/* District / Unit */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Unit / Home District
                </label>
                <input
                  type="text"
                  value={policeUnitDistrict}
                  onChange={(e) => setPoliceUnitDistrict(e.target.value)}
                  placeholder="e.g. Sri Sathya Sai, Greyhounds, Tirupati"
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-[#0B2545] rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-[#0B2545] transition"
                />
              </div>

              {/* Police station: suggestions from the master list of the officer's district */}
              <div className="space-y-1">
                <label htmlFor="officer-police-station" className="block text-[11px] font-bold text-slate-700">
                  Police Station
                </label>
                <span id="officer-police-station" className="block">
                  <StationInput value={policeStation} onChange={setPoliceStation} district={policeUnitDistrict} stations={masterStations}
                    ariaLabel="Police station"
                    className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-[#0B2545] rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-[#0B2545] transition" />
                </span>
              </div>

              {/* Date of birth (used for the ASI/HC old:young selection ratio) */}
              <div className="space-y-1">
                <label htmlFor="officer-dob" className="block text-[11px] font-bold text-slate-700">
                  Date of birth
                </label>
                <input
                  id="officer-dob"
                  type="date"
                  value={dateOfBirth}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-[#0B2545] rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-[#0B2545] transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Mobile */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="10 digits"
                    className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-[#0B2545] rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-[#0B2545] transition"
                  />
                </div>

                {/* Aadhaar Number */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    Aadhaar Number
                  </label>
                  <input
                    type="text"
                    value={govtIdNumber}
                    onChange={(e) => setGovtIdNumber(e.target.value)}
                    placeholder="12 digits"
                    className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-[#0B2545] rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-[#0B2545] transition"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Duty Posting & Sector Selection (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <PoliceBandobusthSelector
                zone={policeZone}
                sectorNumber={policeSectorNumber}
                sectorName={policeSectorName}
                customSector={policeCustomSector}
                securityComponent={securityComponent}
                onChange={handleDutyChange}
                loading={loading}
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
            {onDeleted && (
              <PillButton type="button" variant="outline" size="md" className="mr-auto text-rose-800"
                onClick={handleDelete} disabled={loading || deleting} icon={<Trash2 className="size-4" />}>
                {deleting ? 'Deleting…' : 'Delete officer'}
              </PillButton>
            )}
            <PillButton
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              disabled={loading || deleting}
            >
              Cancel
            </PillButton>
            <PillButton
              type="submit"
              variant="crimson"
              size="md"
              disabled={loading || deleting}
              icon={<Save className="w-4 h-4" />}
            >
              {loading ? 'Saving Changes...' : 'Save Changes'}
            </PillButton>
          </div>
        </form>
      </div>

      {/* Spot Camera Modal */}
      {isCameraOpen && (
        <CameraCaptureModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onPhotoCaptured={(url) => {
            setPhotoUrl(url);
            setIsCameraOpen(false);
          }}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
};
