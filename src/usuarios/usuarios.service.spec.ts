import { BadRequestException, ConflictException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { UserRole } from '../common/enums/user-role.enum.js';
import { AreasService } from '../areas/areas.service.js';
import { InMemoryAreasRepository } from '../areas/repositories/in-memory-areas.repository.js';
import { InMemoryCategoriasRepository } from '../categorias/repositories/in-memory-categorias.repository.js';
import { InMemorySessionsRepository } from './repositories/in-memory-sessions.repository.js';
import { InMemoryUsuariosRepository } from './repositories/in-memory-usuarios.repository.js';
import { UsuariosService } from './usuarios.service.js';
import { validatePasswordPolicy } from './validation/password-policy.js';

describe('UsuariosService', () => {
  let usuarios: InMemoryUsuariosRepository;
  let sessions: InMemorySessionsRepository;
  let categories: InMemoryCategoriasRepository;
  let areas: AreasService;
  let service: UsuariosService;

  beforeEach(async () => {
    sessions = new InMemorySessionsRepository();
    categories = new InMemoryCategoriasRepository();
    usuarios = new InMemoryUsuariosRepository();
    areas = new AreasService(new InMemoryAreasRepository(), categories, usuarios);
    const config = {
      get: (key: string, fallback?: string) =>
        key === 'ADMIN_AREA_NOMBRE' ? 'Seguridad y accesos' : fallback,
      getOrThrow: (key: string) =>
        ({
          ADMIN_EMAIL: ' Admin@Example.com ',
          ADMIN_NAME: 'Administrador',
          ADMIN_PASSWORD: 'AdminSeedPass123',
        })[key],
    };
    service = new UsuariosService(
      usuarios,
      sessions,
      areas,
      config as never,
    );
    await areas.seedInitialAreas();
    await service.seedInitialUsers();
  });

  const createAgentDto = async (): Promise<{
    nombre: string;
    correo: string;
    password: string;
    rol: UserRole.AGENTE;
    areaId: string;
  }> => ({
    nombre: ' Agente nuevo ',
    correo: ' Agent@Example.com ',
    password: 'InitialPass123',
    rol: UserRole.AGENTE,
    areaId: (await areas.findAll(true))[0].id,
  });

  it('normalizes email and hashes passwords with bcrypt cost 10 or higher', async () => {
    const created = await service.create(await createAgentDto());
    const user = await usuarios.findById(created.id);
    expect(user?.correo).toBe('agent@example.com');
    expect(await bcrypt.compare('InitialPass123', user!.passwordHash)).toBe(true);
    expect(Number(user!.passwordHash.split('$')[2])).toBeGreaterThanOrEqual(10);
  });

  it('rejects duplicate normalized emails with 409', async () => {
    await service.create(await createAgentDto());
    await expect(
      service.create({
        ...(await createAgentDto()),
        correo: 'agent@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps email uniqueness when concurrent user creations race', async () => {
    const dto = await createAgentDto();
    const results = await Promise.allSettled([
      service.create(dto),
      service.create({ ...dto, nombre: 'Otro agente' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('enforces the reusable password policy', async () => {
    expect(validatePasswordPolicy('Short1')).toContain(
      'La contraseña debe tener al menos 10 caracteres.',
    );
    expect(validatePasswordPolicy('LongPassword')).toContain(
      'La contraseña debe incluir al menos un número.',
    );
    expect(validatePasswordPolicy(`á${'a'.repeat(71)}1`)).toContain(
      'La contraseña no puede superar 72 bytes.',
    );
    expect(validatePasswordPolicy(' InitialPass123')).toContain(
      'La contraseña no puede iniciar ni terminar con espacios.',
    );
    await expect(
      service.create({ ...(await createAgentDto()), password: 'bad' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive areas for create and update', async () => {
    const created = await service.create(await createAgentDto());
    const inactiveArea = await areas.create({ nombre: 'Área inactiva' });
    await areas.update(inactiveArea.id, { activa: false });

    await expect(
      service.create({
        ...(await createAgentDto()),
        correo: 'other@example.com',
        areaId: inactiveArea.id,
      }),
    ).rejects.toThrow('El área del usuario debe estar activa.');
    await expect(
      service.update(created.id, { areaId: inactiveArea.id }, 'admin-id'),
    ).rejects.toThrow('El área del usuario debe estar activa.');
  });

  it('prevents self-deactivation, self-role changes, and degrading the last active administrator', async () => {
    const admin = (await usuarios.list({ rol: UserRole.ADMINISTRADOR }))[0];
    await expect(service.deactivate(admin.id, admin.id)).rejects.toThrow(
      'No puedes desactivar tu propia cuenta.',
    );
    await expect(
      service.update(admin.id, { rol: UserRole.AGENTE }, admin.id),
    ).rejects.toThrow('No puedes cambiar tu propio rol.');

    const agent = await service.create(await createAgentDto());
    await expect(
      service.update(admin.id, { rol: UserRole.SUPERVISOR }, agent.id),
    ).rejects.toThrow('No se puede degradar al último administrador activo.');
    await expect(service.deactivate(admin.id, agent.id)).rejects.toThrow(
      'No se puede desactivar al último administrador activo.',
    );
  });

  it('does not allow deactivation of the last admin but permits it when another admin exists', async () => {
    const admin = (await usuarios.list({ rol: UserRole.ADMINISTRADOR }))[0];
    const areaId = admin.areaId;
    const secondAdmin = await service.create({
      nombre: 'Segundo administrador',
      correo: 'second-admin@example.com',
      password: 'SecondAdmin123',
      rol: UserRole.ADMINISTRADOR,
      areaId,
    });
    const result = await service.deactivate(secondAdmin.id, admin.id);
    expect(result.activo).toBe(false);
  });

  it('serializes concurrent attempts to remove the final active administrator', async () => {
    const admin = (await usuarios.list({ rol: UserRole.ADMINISTRADOR }))[0];
    const secondAdmin = await service.create({
      nombre: 'Segundo administrador',
      correo: 'concurrent-admin@example.com',
      password: 'ConcurrentAdmin123',
      rol: UserRole.ADMINISTRADOR,
      areaId: admin.areaId,
    });

    const outcomes = await Promise.allSettled([
      service.deactivate(admin.id, secondAdmin.id),
      service.deactivate(secondAdmin.id, admin.id),
    ]);

    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      expect(rejected.reason.message).toContain('No se puede desactivar al último administrador');
    }
    expect(await usuarios.countActiveAdministrators()).toBe(1);
  });

  it('uses ADMIN_AREA_NOMBRE for the administrator seed and fails when that area is missing', async () => {
    const configuredArea = await areas.create({ nombre: 'Área de administración configurada' });
    const seededUsers = new InMemoryUsuariosRepository();
    const configuredService = new UsuariosService(
      seededUsers,
      new InMemorySessionsRepository(),
      areas,
      {
        get: (key: string) =>
          key === 'ADMIN_AREA_NOMBRE' ? ' Área de administración configurada ' : undefined,
        getOrThrow: (key: string) =>
          ({
            ADMIN_EMAIL: 'custom-admin@example.com',
            ADMIN_NAME: 'Administrador configurado',
            ADMIN_PASSWORD: 'ConfiguredAdmin123',
          })[key],
      } as never,
    );

    await configuredService.onModuleInit();
    expect((await seededUsers.findByEmail('custom-admin@example.com'))?.areaId).toBe(
      configuredArea.id,
    );

    const missingAreaService = new UsuariosService(
      new InMemoryUsuariosRepository(),
      new InMemorySessionsRepository(),
      areas,
      {
        get: (key: string) => (key === 'ADMIN_AREA_NOMBRE' ? 'Área inexistente' : undefined),
        getOrThrow: (key: string) =>
          ({
            ADMIN_EMAIL: 'missing-area-admin@example.com',
            ADMIN_NAME: 'Administrador sin área',
            ADMIN_PASSWORD: 'MissingAreaAdmin123',
          })[key],
      } as never,
    );
    await expect(missingAreaService.onModuleInit()).rejects.toThrow(
      'El área inicial del administrador "Área inexistente" no existe o está inactiva.',
    );
  });

  it('closes all sessions after role/area changes, deactivation, and password reset', async () => {
    const admin = (await usuarios.list({ rol: UserRole.ADMINISTRADOR }))[0];
    const agent = await service.create(await createAgentDto());
    const sessionIds = ['one', 'two'];
    for (const id of sessionIds) {
      await sessions.create({ id, usuarioId: agent.id, ultimaActividad: new Date() });
    }

    const areasList = await areas.findAll(true);
    await service.update(agent.id, { areaId: areasList[1].id }, admin.id);
    expect(await sessions.findById('one')).toBeNull();

    await sessions.create({ id: 'three', usuarioId: agent.id, ultimaActividad: new Date() });
    await service.update(agent.id, { rol: UserRole.SUPERVISOR }, admin.id);
    expect(await sessions.findById('three')).toBeNull();

    await sessions.create({ id: 'four', usuarioId: agent.id, ultimaActividad: new Date() });
    await service.resetPassword(agent.id, { password: 'NewPassword123' });
    expect(await sessions.findById('four')).toBeNull();

    await sessions.create({ id: 'five', usuarioId: agent.id, ultimaActividad: new Date() });
    await service.deactivate(agent.id, admin.id);
    expect(await sessions.findById('five')).toBeNull();
  });

  it('keeps all user references synchronized and reports active user count on area deactivation', async () => {
    const admin = (await usuarios.list({ rol: UserRole.ADMINISTRADOR }))[0];
    const agent = await service.create(await createAgentDto());
    const referenceArea = await areas.create({ nombre: 'Área de referencia de usuarios' });
    const alternateArea = await areas.create({ nombre: 'Área alternativa de usuarios' });
    await service.update(agent.id, { areaId: referenceArea.id }, admin.id);
    const second = await service.create({
      ...(await createAgentDto()),
      correo: 'second-agent@example.com',
      areaId: referenceArea.id,
    });
    await expect(areas.update(referenceArea.id, { activa: false })).rejects.toThrow(
      'tiene 2 usuario(s) activo(s)',
    );
    await service.update(agent.id, { areaId: alternateArea.id }, admin.id);
    await expect(areas.update(referenceArea.id, { activa: false })).rejects.toThrow(
      'tiene 1 usuario(s) activo(s)',
    );
    await service.deactivate(second.id, admin.id);
    expect((await areas.update(referenceArea.id, { activa: false })).activa).toBe(false);
    await service.update(agent.id, { areaId: admin.areaId }, admin.id);
    await service.deactivate(agent.id, admin.id);
    expect(await usuarios.countActiveByAreaId(admin.areaId)).toBe(1);
  });
});
