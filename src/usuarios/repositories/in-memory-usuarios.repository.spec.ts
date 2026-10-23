import { UserRole } from '../../common/enums/user-role.enum.js';
import { InMemoryUsuariosRepository } from './in-memory-usuarios.repository.js';

describe('InMemoryUsuariosRepository copies', () => {
  it('does not expose stored users or dates through create and queries', async () => {
    const repository = new InMemoryUsuariosRepository();
    const created = await repository.create({
      nombre: 'Agente',
      correo: 'agente@example.com',
      passwordHash: 'hash',
      rol: UserRole.AGENTE,
      areaId: 'area-1',
      activo: true,
    });
    created.nombre = 'alterado';
    created.fechaCreacion.setFullYear(2000);
    (await repository.list())[0].areaId = 'area-mutada';
    (await repository.findById(created.id))!.passwordHash = 'hash-mutado';

    const updated = await repository.update(created.id, { nombre: 'Supervisor' });
    updated!.nombre = 'mutado';

    const stored = await repository.findById(created.id);
    expect(stored?.nombre).toBe('Supervisor');
    expect(stored?.areaId).toBe('area-1');
    expect(stored?.passwordHash).toBe('hash');
    expect(stored?.fechaCreacion.getFullYear()).not.toBe(2000);
  });
});
