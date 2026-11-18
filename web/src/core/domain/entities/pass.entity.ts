import { PassStatus, InstitutionType, CategoryType, GovtIdType } from '../types/pass-status.enum';

export type PersonnelType = 'INTERNAL' | 'EXTERNAL';

export interface PassEntity {
  office_id?: import('../offices').OfficeId | null;
  id: string;
  pass_number: string;
  full_name: string;
  father_or_spouse_name: string;
  personnel_type: PersonnelType;
  institution: InstitutionType;
  institution_other?: string | null;
  category: CategoryType | string;
  category_other?: string | null;
  department: string;
  designation_or_trade?: string | null;
  dept_hostel_quarter?: string | null;
  mobile_number: string;
  govt_id_type: GovtIdType;
  govt_id_number: string;
  zone_a: boolean;
  gate_zone_a?: string | null;
  zone_b: boolean;
  gate_zone_b?: string | null;
  zone_c: boolean;
  gate_zone_c?: string | null;
  valid_from: string;
  valid_to: string;
  photo_url?: string | null;
  cardholder_signature_url?: string | null;
  authority_signature_url?: string | null;
  has_hologram: boolean;
  has_official_seal: boolean;
  verification_token: string;
  qr_payload: string;
  status: PassStatus;
  printed_count: number;
  last_printed_at?: string | null;
  last_printed_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePassInput {
  office_id?: import('../offices').OfficeId;
  pass_number?: string;
  full_name: string;
  father_or_spouse_name: string;
  personnel_type?: PersonnelType;
  institution: InstitutionType;
  institution_other?: string;
  category: CategoryType | string;
  category_other?: string;
  department: string;
  designation_or_trade?: string;
  dept_hostel_quarter?: string;
  mobile_number: string;
  govt_id_type: GovtIdType;
  govt_id_number: string;
  zone_a?: boolean;
  gate_zone_a?: string;
  zone_b?: boolean;
  gate_zone_b?: string;
  zone_c?: boolean;
  gate_zone_c?: string;
  valid_from?: string;
  valid_to?: string;
  photo_url?: string;
  cardholder_signature_url?: string;
  authority_signature_url?: string;
  has_hologram?: boolean;
  has_official_seal?: boolean;
  status?: PassStatus;
  approved_by?: string;
}

export interface UpdatePassInput extends Partial<CreatePassInput> {
  status?: PassStatus;
  last_printed_by?: string;
}
