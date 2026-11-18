import { PostgresUserRepository } from '@/infrastructure/repositories/postgres-user.repository';
import { PostgresPassRepository } from '@/infrastructure/repositories/postgres-pass.repository';
import { PostgresAuditRepository } from '@/infrastructure/repositories/postgres-audit.repository';
import { PostgresDepartmentRepository } from '@/infrastructure/repositories/postgres-department.repository';
import { PostgresConfigRepository } from '@/infrastructure/repositories/postgres-config.repository';

class ServiceContainer {
  private static instance: ServiceContainer;

  public readonly userRepository = new PostgresUserRepository();
  public readonly passRepository = new PostgresPassRepository();
  public readonly auditRepository = new PostgresAuditRepository();
  public readonly departmentRepository = new PostgresDepartmentRepository();
  public readonly configRepository = new PostgresConfigRepository();

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }
}

export const services = ServiceContainer.getInstance();
