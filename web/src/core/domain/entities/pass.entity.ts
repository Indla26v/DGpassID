import { PassStatus, InstitutionType, CategoryType, GovtIdType, PassType, PoliceDistributionStatus } from '../types/pass-status.enum';

export type PersonnelType = 'INTERNAL' | 'EXTERNAL';

export interface PassEntity {
  office_id?: import('../offices').OfficeId | null;
  id: string;
  pass_number: string;
  pass_type?: PassType;
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
  
  // Police Bandobusth Profile Attributes
  rank?: string | null;
  police_id_number?: string | null;
  police_unit_district?: string | null;
  
  // Bandobusth Duty Assignment
  police_zone?: string | null;
  police_sector_number?: string | null;
  police_sector_name?: string | null;
  police_point_code?: string | null;
  police_point_name?: string | null;
  date_of_birth?: string | null;
  age_years?: number | null;
  force_category?: string | null;
  police_station?: string | null;
  gender?: string | null;
  deployment_batch_id?: string | null;
  police_custom_sector?: string | null;
  security_component?: string | null;
  custom_security_component?: string | null;
  
  // Multi-Counter Distribution & Handover
  issuing_counter_id?: string | null;
  distribution_status?: PoliceDistributionStatus;
  collected_at?: string | null;
  collected_by_officer?: boolean;
  handover_officer_name?: string | null;

  zone_a: boolean;
  gate_zone_a?: string | null;
  zone_b: boolean;
  gate_zone_b?: string | null;
  zone_c: boolean;
  gate_zone_c?: string | null;
  valid_from: string;
  valid_to: string;
  photo_url?: string | null;
  hasPhoto?: boolean;
  cardholder_signature_url?: string | null;
  authority_signature_url?: string | null;
  authority_name?: string | null;
  authority_title?: string | null;
  has_hologram: boolean;
  has_official_seal: boolean;
  verification_token: string;
  qr_payload: string;
  is_imported?: boolean;
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
  pass_type?: PassType;
  is_imported?: boolean;
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
  
  rank?: string;
  police_id_number?: string;
  police_unit_district?: string;
  police_zone?: string;
  police_sector_number?: string;
  police_sector_name?: string;
  police_point_code?: string;
  police_point_name?: string;
  date_of_birth?: string;
  age_years?: number;
  force_category?: string;
  police_station?: string;
  gender?: string;
  police_custom_sector?: string;
  security_component?: string;
  custom_security_component?: string;
  issuing_counter_id?: string;
  distribution_status?: PoliceDistributionStatus;

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
