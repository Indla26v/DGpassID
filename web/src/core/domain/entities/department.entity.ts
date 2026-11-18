export interface DepartmentEntity {
  id: number;
  name: string;
  department_type: 'EXTERNAL' | 'INTERNAL';
  is_active: boolean;
  created_at: string;
  created_by?: string | null;
}

export interface StaffRoleEntity {
  id: number;
  name: string;
  applicable_to: string;
  is_active: boolean;
  created_at: string;
  created_by?: string | null;
}
