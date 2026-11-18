export type PassStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'READY_TO_PRINT'
  | 'PRINTED'
  | 'ISSUED'
  | 'REVOKED';

export type InstitutionType = 'IISER' | 'IIT' | 'ICU' | 'Other';

export type CategoryType = 'Student' | 'Faculty/Staff' | 'Worker' | 'Other';

export type GovtIdType =
  | 'Aadhaar'
  | 'Institute ID'
  | 'Voter ID'
  | 'PAN Card'
  | 'Driving License'
  | 'Passport';

export type UserRole = 'ADMIN' | 'PRINT_TEAM' | 'SECURITY_GATE';
