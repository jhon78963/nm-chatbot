import type { AgentRole } from '../../../domain/entities/agent.entity.js';
import { ForbiddenError } from '../../services/conversation-access.service.js';
import type { QuickReplyPrismaRepository, QuickReplyDto } from '../../../infrastructure/database/prisma/repositories/quick-reply.prisma-repository.js';

export { ForbiddenError };

export class QuickReplyUseCase {
  constructor(private readonly quickReplyRepo: QuickReplyPrismaRepository) {}

  async list(): Promise<QuickReplyDto[]> {
    return this.quickReplyRepo.findAll();
  }

  async create(
    data: { title: string; body: string },
    requestingAgentId: string,
    role: AgentRole,
  ): Promise<QuickReplyDto> {
    if (role !== 'admin') throw new ForbiddenError('Solo un administrador puede crear respuestas rápidas');
    if (!data.title.trim()) throw new Error('El título no puede estar vacío');
    if (!data.body.trim()) throw new Error('El cuerpo no puede estar vacío');

    return this.quickReplyRepo.create({
      title: data.title,
      body: data.body,
      createdBy: requestingAgentId,
    });
  }

  async update(
    id: string,
    data: { title?: string; body?: string },
    role: AgentRole,
  ): Promise<QuickReplyDto> {
    if (role !== 'admin') throw new ForbiddenError('Solo un administrador puede editar respuestas rápidas');
    const result = await this.quickReplyRepo.update(id, data);
    if (!result) throw new Error('Respuesta rápida no encontrada');
    return result;
  }

  async delete(id: string, role: AgentRole): Promise<void> {
    if (role !== 'admin') throw new ForbiddenError('Solo un administrador puede eliminar respuestas rápidas');
    const deleted = await this.quickReplyRepo.delete(id);
    if (!deleted) throw new Error('Respuesta rápida no encontrada');
  }
}
