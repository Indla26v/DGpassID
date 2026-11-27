export type PassType = 'CAMPUS' | 'POLICE_FORCE';

export type PoliceDistributionStatus =
  | 'PENDING_ASSIGNMENT'
  | 'ASSIGNED'
  | 'PRINTED'
  | 'COLLECTED';

export type PassStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'READY_TO_PRINT'
  | 'PRINTED'
  | 'ISSUED'
  | 'REVOKED';

export type InstitutionType = 'IISER' | 'IIT' | 'ICI' | 'ICU' | 'Other';

export type CategoryType = 'Student' | 'Faculty/Staff' | 'Worker' | 'Other';

export type GovtIdType =
  | 'Aadhaar'
  | 'Institute ID'
  | 'Voter ID'
  | 'PAN Card'
  | 'Driving License'
  | 'Passport';

export type UserRole = 'ADMIN' | 'PRINT_TEAM' | 'POLICE_PRINT' | 'BANDOBAST_OFFICER' | 'SECURITY_GATE';
