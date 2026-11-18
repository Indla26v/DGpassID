import { IDepartmentRepository } from '@/core/interfaces/department-repository.interface';
import { DepartmentEntity, StaffRoleEntity } from '@/core/domain/entities/department.entity';
import { query } from '../db/pool';
import { PoolClient } from 'pg';

export class PostgresDepartmentRepository implements IDepartmentRepository {
  async listExternalDepartments(): Promise<DepartmentEntity[]> {
    const res = await query<DepartmentEntity>(
      "SELECT * FROM departments WHERE is_active = true AND department_type = 'EXTERNAL' ORDER BY name"
    );
    return res.rows;
  }

  async listInternalStaffRoles(): Promise<StaffRoleEntity[]> {
    const res = await query<StaffRoleEntity>(
      'SELECT * FROM staff_roles WHERE is_active = true ORDER BY id'
    );
    return res.rows;
  }

  async addExternalDepartment(name: string, createdBy: string = 'System', client?: PoolClient): Promise<DepartmentEntity> {
    const res = await query<DepartmentEntity>(
      `INSERT INTO departments (name, created_by)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET is_active = true
       RETURNING *`,
      [name.trim(), createdBy],
      client
    );
    return res.rows[0];
  }

  async addInternalStaffRole(name: string, applicableTo: string = 'INTERNAL', createdBy: string = 'System', client?: PoolClient): Promise<StaffRoleEntity> {
    const res = await query<StaffRoleEntity>(
      `INSERT INTO staff_roles (name, applicable_to, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET is_active = true
       RETURNING *`,
      [name.trim(), applicableTo, createdBy],
      client
    );
    return res.rows[0];
  }

  async deleteDepartment(id: number): Promise<boolean> {
    const res = await query('UPDATE departments SET is_active = false WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
