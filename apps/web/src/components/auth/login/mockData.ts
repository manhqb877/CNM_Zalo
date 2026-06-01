import type { LoginScreenMockData } from './login.types';

export const LOGIN_SCREEN_MOCK_DATA: LoginScreenMockData = {
  brand: 'ZYNC',
  headline: ['Đăng nhập ZYNC', 'bắt nhịp cộng đồng.'],
  subtitle:
    'Truy cập chat real-time, nhóm developer, bài viết kiến thức và AI assistant trong cùng một workspace.',
  members: [
    { id: '1', name: 'An', initials: 'AN', tone: 'bg-[#DDFBF5] text-[#0F766E]' },
    { id: '2', name: 'Binh', initials: 'BI', tone: 'bg-white text-[#082F49]' },
    { id: '3', name: 'Chi', initials: 'CH', tone: 'bg-[#E0F2FE] text-[#0369A1]' },
  ],
  extraMembersLabel: '+2k',
  bottomCaption: 'Developer đang trao đổi, chia sẻ và catch-up mỗi ngày trên ZYNC.',
  cardTitle: 'Chào mừng trở lại',
  cardSubtitle: 'Dùng email, mật khẩu và OTP để bảo vệ tài khoản ZYNC của bạn.',
  loginTabLabel: 'Đăng nhập',
  registerTabLabel: 'Đăng ký',
  socialTitle: 'Hoặc tiếp tục với',
  registerHint: 'Bạn chưa có tài khoản?',
  loginHint: 'Bạn đã có tài khoản?',
  loginHintAction: 'Đăng nhập',
  registerHintAction: 'Tạo tài khoản',
  footer: {
    copyright: '© 2026 ZYNC. Built for developer communities.',
    links: ['Bảo mật', 'Điều khoản', 'Liên hệ'],
    statusLabel: 'Hệ thống ổn định',
  },
};
