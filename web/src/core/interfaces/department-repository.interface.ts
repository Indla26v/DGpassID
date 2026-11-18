import { DepartmentEntity, StaffRoleEntity } from '../domain/entities/department.entity';

export interface IDepartmentRepository {
  listExternalDepartments(): Promise<DepartmentEntity[]>;
  listInternalStaffRoles(): Promise<StaffRoleEntity[]>;
  addExternalDepartment(name: string, createdBy?: string): Promise<DepartmentEntity>;
  addInternalStaffRole(name: string, applicableTo?: string, createdBy?: string): Promise<StaffRoleEntity>;
  deleteDepartment(id: number): Promise<boolean>;
}
