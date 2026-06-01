import { createContainer, asClass, InjectionMode, Lifetime } from 'awilix';
import { MessageRepository } from './shared/repositories/message.repository';
import { PostRepository, CommentRepository } from './shared/repositories/post.repository';
import { logger } from './shared/logger';

/**
 * Awilix IoC Container - Quản lý tất cả dependencies
 * 
 * Pattern:
 * - SINGLETON: Repositories, Services (mỗi class chỉ được tạo 1 lần)
 * - TRANSIENT: Dùng cho request-scoped objects (nếu cần sau này)
 * 
 * Cách dùng:
 *   const { messageRepository } = container.cradle;
 */
export interface AppContainer {
  messageRepository: MessageRepository;
  postRepository: PostRepository;
  commentRepository: CommentRepository;
}

const container = createContainer<AppContainer>({
  injectionMode: InjectionMode.PROXY,
});

container.register({
  // ─── Repositories ───────────────────────────────────────────────────────────
  messageRepository: asClass(MessageRepository, { lifetime: Lifetime.SINGLETON }),
  postRepository: asClass(PostRepository, { lifetime: Lifetime.SINGLETON }),
  commentRepository: asClass(CommentRepository, { lifetime: Lifetime.SINGLETON }),
});

logger.info('[Container] IoC Container initialized with repositories');

export { container };
export default container;
