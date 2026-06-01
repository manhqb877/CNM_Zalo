import type { HomeMockData } from './home.types';

export const HOME_MOCK_DATA: HomeMockData = {
  brand: 'ZYNC',
  releaseLabel: 'Developer community workspace',
  title: 'Nơi developer kết nối,',
  titleAccent: 'trao đổi và lớn lên cùng AI',
  subtitle:
    'ZYNC gom chat real-time, cộng đồng chuyên môn, chia sẻ kiến thức và trợ lý AI vào một không gian gọn gàng cho developer hiện đại.',
  ctaPrimary: 'Tham gia miễn phí',
  ctaSecondary: 'Xem tính năng',
  navItems: [
    { id: 'nav-features', label: 'Tính năng', href: '#features' },
    { id: 'nav-use-cases', label: 'Use cases', href: '#use-cases' },
    { id: 'nav-community', label: 'Cộng đồng', href: '#community' },
    { id: 'nav-ai', label: 'AI support', href: '#ai-support' },
  ],
  navAuthLabel: 'Đăng nhập',
  navPrimaryLabel: 'Bắt đầu',
  features: [
    {
      id: 'chat',
      icon: 'chat',
      title: 'Chat real-time',
      description: 'Nhắn tin 1-1, nhóm, reaction và trạng thái đọc giúp cuộc trao đổi kỹ thuật không bị đứt mạch.',
    },
    {
      id: 'community',
      icon: 'community',
      title: 'Không gian cộng đồng',
      description: 'Tạo nhóm theo stack, dự án hoặc chủ đề để hỏi đáp, tuyển cộng tác và theo dõi hoạt động.',
    },
    {
      id: 'knowledge',
      icon: 'knowledge',
      title: 'Chia sẻ tri thức',
      description: 'Đăng bài, thảo luận, lưu kinh nghiệm và biến các đoạn hội thoại tốt thành nguồn học lại.',
    },
    {
      id: 'ai',
      icon: 'ai',
      title: 'AI hỗ trợ developer',
      description: 'Tóm tắt catch-up, gợi ý phản hồi, nhắc việc và tìm lại ngữ cảnh quan trọng trong cộng đồng.',
    },
    {
      id: 'realtime',
      icon: 'realtime',
      title: 'Luồng công việc liền mạch',
      description: 'Tin nhắn, thông báo, cuộc gọi và hoạt động cộng đồng đồng bộ để bạn không bỏ lỡ nội dung cần xử lý.',
    },
    {
      id: 'safety',
      icon: 'safety',
      title: 'Trải nghiệm có kiểm soát',
      description: 'OTP, moderation, notification preferences và các lớp bảo vệ giúp cộng đồng vận hành ổn định.',
    },
  ],
  metrics: [
    {
      id: 'm1',
      value: 'Realtime',
      label: 'Messaging',
      description: 'Chat, nhóm, reaction và trạng thái đọc tức thì.',
    },
    {
      id: 'm2',
      value: 'AI',
      label: 'Assistant',
      description: 'Tóm tắt, nhắc việc và hỗ trợ tìm lại ngữ cảnh.',
    },
    {
      id: 'm3',
      value: 'Community',
      label: 'Knowledge',
      description: 'Bài viết, nhóm chuyên môn và trao đổi theo chủ đề.',
    },
  ],
  benefits: [
    'Giảm nhiễu giữa chat, bài viết và thông báo.',
    'Tập trung các cuộc trao đổi kỹ thuật trong một workspace.',
    'Giúp thành viên mới bắt nhịp nhanh bằng AI catch-up.',
    'Dễ duy trì kết nối giữa bạn bè, nhóm học và cộng đồng dự án.',
  ],
  useCases: [
    {
      id: 'study',
      title: 'Nhóm học và mentoring',
      description: 'Tổ chức kênh hỏi đáp, chia sẻ tài liệu, nhắc deadline và tổng hợp điểm chính sau mỗi buổi.',
    },
    {
      id: 'project',
      title: 'Team dự án nhỏ',
      description: 'Trao đổi nhanh, gọi trực tiếp, lưu quyết định kỹ thuật và tìm lại context khi cần bàn giao.',
    },
    {
      id: 'community',
      title: 'Cộng đồng theo stack',
      description: 'Nuôi thảo luận về frontend, backend, mobile, AI hoặc career với trải nghiệm gọn như chat.',
    },
  ],
  communityTitle: 'Một cộng đồng developer dễ theo dõi, dễ đóng góp',
  communitySubtitle:
    'ZYNC ưu tiên những tương tác có ích: câu hỏi rõ ràng, phản hồi nhanh, bài viết ngắn gọn và các nhóm chuyên môn có nhịp hoạt động thật.',
  aiTitle: 'AI không thay thế cộng đồng, AI giúp cộng đồng bắt nhịp nhanh hơn',
  aiSubtitle:
    'Trợ lý ZYNC hỗ trợ tóm tắt hội thoại, gợi ý việc cần làm, nhắc follow-up và tìm lại thông tin đã trao đổi.',
  aiHighlights: ['Catch-up digest', 'Semantic search', 'Task reminders', 'AI assistant trong chat'],
  ctaBlockTitle: 'Bắt đầu xây cộng đồng developer của bạn trên ZYNC',
  ctaBlockSubtitle:
    'Tạo tài khoản, tham gia nhóm phù hợp và giữ mọi cuộc trao đổi kỹ thuật ở một nơi dễ đọc, dễ tìm, dễ quay lại.',
  ctaBlockButton: 'Tạo tài khoản ZYNC',
  footerBrand: 'ZYNC',
  footerCopyright: '© 2026 ZYNC. Built for developer communities.',
  footerLinks: [
    { id: 'f-privacy', label: 'Bảo mật', href: '#' },
    { id: 'f-terms', label: 'Điều khoản', href: '#' },
    { id: 'f-support', label: 'Hỗ trợ', href: '#' },
  ],
};
