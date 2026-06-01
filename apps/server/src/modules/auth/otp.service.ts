import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getRedis } from '../../infrastructure/redis';
import { BadRequestError } from '../../shared/errors';
import { logger } from '../../shared/logger';

const OTP_TTL_SECONDS = 5 * 60; // 5 phút

type OtpEmailProvider = 'smtp' | 'resend';
export type OtpPurpose = 'register' | 'login' | 'reset-password';

function getHardcodedOtpValue(): string {
  return process.env['OTP_HARDCODE_VALUE'] ?? '123456';
}

function shouldUseOtpHardcode(): boolean {
  return process.env['OTP_HARDCODE'] === 'true';
}

/** Sinh mã OTP 6 chữ số (hoặc dùng hardcode nếu môi trường dev) */
export function generateOtp(): string {
  if (shouldUseOtpHardcode()) {
    return getHardcodedOtpValue();
  }
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

/** Lưu OTP vào Redis với TTL 5 phút */
export async function storeOtp(email: string, otp: string): Promise<void> {
  if (shouldUseOtpHardcode()) {
    return;
  }

  const redis = getRedis();
  await redis.set(`otp:${email}`, otp, 'EX', OTP_TTL_SECONDS);
}

/** Kiểm tra OTP. Trả về true nếu hợp lệ và xóa OTP sau khi verify thành công. */
export async function verifyOtp(email: string, otp: string): Promise<boolean> {
  if (shouldUseOtpHardcode()) {
    return otp === getHardcodedOtpValue();
  }

  const redis = getRedis();
  const stored = await redis.get(`otp:${email}`);
  if (!stored || stored !== otp) return false;
  // Xóa OTP sau khi dùng (one-time use)
  await redis.del(`otp:${email}`);
  return true;
}

/** Gửi OTP qua email (Nodemailer/Resend) */
export async function sendOtp(
  email: string,
  otp: string,
  purpose: OtpPurpose = 'login',
): Promise<void> {
  // Môi trường non-production có thể dùng OTP hardcode để tránh phụ thuộc SMTP
  if (shouldUseOtpHardcode()) {
    logger.info(`[OTP HARDCODE] email=${email} otp=${otp} purpose=${purpose}`);
    return;
  }

  await sendEmailOtp(email, otp, purpose);
}

// ─── Email HTML Builder ──────────────────────────────────────────────────────

function getPurposeLabel(purpose: OtpPurpose): { subject: string; title: string; description: string; actionText: string } {
  switch (purpose) {
    case 'register':
      return {
        subject: '🔑 Mã xác thực đăng ký Zync',
        title: 'Xác nhận đăng ký tài khoản',
        description: 'Bạn đang đăng ký tài khoản Zync. Sử dụng mã OTP bên dưới để hoàn tất đăng ký:',
        actionText: 'Mã này có hiệu lực trong <strong>5 phút</strong>. Nếu bạn không thực hiện đăng ký, hãy bỏ qua email này.',
      };
    case 'reset-password':
      return {
        subject: '🔐 Đặt lại mật khẩu Zync',
        title: 'Yêu cầu đặt lại mật khẩu',
        description: 'Bạn đã yêu cầu đặt lại mật khẩu Zync. Sử dụng mã OTP bên dưới:',
        actionText: 'Mã này có hiệu lực trong <strong>5 phút</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này và bảo mật tài khoản.',
      };
    case 'login':
    default:
      return {
        subject: '🔑 Mã xác thực đăng nhập Zync',
        title: 'Xác thực đăng nhập',
        description: 'Ai đó vừa đăng nhập vào tài khoản Zync của bạn. Nhập mã OTP bên dưới để xác nhận:',
        actionText: 'Mã này có hiệu lực trong <strong>5 phút</strong>. Nếu bạn không thực hiện đăng nhập này, hãy đổi mật khẩu ngay.',
      };
  }
}

function buildOtpEmailHtml(otp: string, purpose: OtpPurpose): { subject: string; html: string; text: string } {
  const { subject, title, description, actionText } = getPurposeLabel(purpose);
  const digits = otp.split('');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:16px;padding:12px 24px;">
                <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:2px;">⚡ ZYNC</span>
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:linear-gradient(145deg,#1e293b,#0f172a);border:1px solid #1e3a2f;border-radius:24px;padding:40px 36px;box-shadow:0 0 40px rgba(34,197,94,0.08);">

              <!-- Title -->
              <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#f1f5f9;text-align:center;">${title}</h1>
              <p style="margin:0 0 32px 0;font-size:15px;color:#94a3b8;text-align:center;line-height:1.6;">${description}</p>

              <!-- OTP Digits -->
              <div style="text-align:center;margin-bottom:32px;">
                ${digits.map(d => `<span style="display:inline-block;width:48px;height:60px;line-height:60px;background:#0f172a;border:2px solid #22c55e;border-radius:12px;color:#22c55e;font-size:28px;font-weight:800;text-align:center;margin:0 4px;box-shadow:0 0 12px rgba(34,197,94,0.3);">${d}</span>`).join('')}
              </div>

              <!-- OTP as plain text fallback -->
              <div style="text-align:center;margin-bottom:8px;">
                <p style="margin:0;font-size:13px;color:#64748b;">Hoặc sao chép mã: <code style="background:#1e293b;color:#22c55e;padding:4px 10px;border-radius:6px;font-size:15px;font-weight:700;letter-spacing:3px;">${otp}</code></p>
              </div>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #1e293b;margin:28px 0;" />

              <!-- Action note -->
              <p style="margin:0;font-size:13px;color:#64748b;text-align:center;line-height:1.6;">${actionText}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#475569;">
                © 2025 Zync Platform · Gửi tự động, vui lòng không trả lời email này.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${title}\n\nMã OTP của bạn: ${otp}\n\n${actionText.replace(/<[^>]+>/g, '')}\n\n— Zync Platform`;

  return { subject, html, text };
}

// ─── SMTP / Resend Sender ────────────────────────────────────────────────────

async function sendEmailOtp(email: string, otp: string, purpose: OtpPurpose): Promise<void> {
  const resendApiKey = process.env['RESEND_API_KEY'];
  const resendFrom = process.env['RESEND_FROM'] ?? process.env['SMTP_FROM'] ?? 'onboarding@resend.dev';
  const provider = (process.env['OTP_EMAIL_PROVIDER'] ?? 'smtp').toLowerCase() as OtpEmailProvider;

  const { subject, html, text } = buildOtpEmailHtml(otp, purpose);

  if (provider === 'resend' && resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      const { error } = await resend.emails.send({
        from: resendFrom,
        to: [email],
        subject,
        text,
        html,
      });

      if (error) {
        throw new Error(error.message);
      }

      logger.info(`[OTP] Email sent via Resend to ${email} (purpose: ${purpose})`);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown Resend API error';
      const isResendSandboxError =
        message.includes('You can only send testing emails to your own email address') ||
        message.includes('verify a domain at resend.com/domains');

      if (isResendSandboxError) {
        throw new BadRequestError(
          'Resend đang ở chế độ test. Hãy verify domain tại resend.com/domains và đặt RESEND_FROM bằng email thuộc domain đã verify.',
        );
      }

      throw new BadRequestError(`Resend API gửi OTP thất bại: ${message}`);
    }
  }

  // ── SMTP (Gmail App Password) ──
  const smtpHost = process.env['SMTP_HOST'] ?? 'smtp.gmail.com';
  const smtpUser = process.env['SMTP_USER'];
  const rawSmtpPass = process.env['SMTP_PASS'];
  // Gmail App Password có dấu cách, cần xóa đi
  const smtpPass = smtpHost.includes('gmail.com') ? rawSmtpPass?.replace(/\s/g, '') : rawSmtpPass;

  if (!smtpUser || !smtpPass) {
    throw new BadRequestError('Thiếu cấu hình SMTP_USER/SMTP_PASS để gửi OTP email.');
  }

  if (smtpHost.includes('gmail.com') && !smtpUser.includes('@')) {
    throw new BadRequestError('SMTP_USER phải là địa chỉ Gmail đầy đủ, ví dụ your_email@gmail.com');
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    secure: process.env['SMTP_SECURE'] === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? smtpUser,
      to: email,
      subject,
      text,
      html,
    });
    logger.info(`[OTP] Email sent via Gmail SMTP to ${email} (purpose: ${purpose})`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    const isGmailAuthError =
      message.includes('Invalid login') ||
      message.includes('BadCredentials') ||
      message.includes('Username and Password not accepted');

    if (isGmailAuthError) {
      throw new BadRequestError(
        'Gmail SMTP đăng nhập thất bại. Hãy dùng đúng SMTP_USER là email Gmail và SMTP_PASS là App Password 16 ký tự (không phải mật khẩu Gmail thường).',
      );
    }

    logger.error('[OTP] SMTP send failed', { message });
    throw error;
  }
}
