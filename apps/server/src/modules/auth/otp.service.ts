import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { getRedis } from '../../infrastructure/redis';
import { BadRequestError } from '../../shared/errors';
import { logger } from '../../shared/logger';

const OTP_TTL_SECONDS = 5 * 60; // 5 phút

type OtpEmailProvider = 'smtp' | 'resend';

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
export async function sendOtp(email: string, otp: string): Promise<void> {
  // Môi trường non-production có thể dùng OTP hardcode để tránh phụ thuộc SMTP
  if (shouldUseOtpHardcode()) {
    logger.info(`[OTP HARDCODE] email=${email} otp=${otp}`);
    return;
  }

  await sendEmailResend(email, otp);
}

async function sendEmailResend(email: string, otp: string): Promise<void> {
  const resendApiKey = process.env['RESEND_API_KEY'];
  const resendFrom = process.env['RESEND_FROM'] ?? process.env['SMTP_FROM'] ?? 'onboarding@resend.dev';
  const provider = (process.env['OTP_EMAIL_PROVIDER'] ?? 'smtp').toLowerCase() as OtpEmailProvider;

  if (provider === 'resend' && resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      const { error } = await resend.emails.send({
        from: resendFrom,
        to: [email],
        subject: 'Mã xác thực Zync',
        text: `Mã xác thực của bạn là: ${otp}. Có hiệu lực trong 5 phút.`,
        html: `<p>Mã xác thực của bạn là: <strong>${otp}</strong>. Có hiệu lực trong <strong>5 phút</strong>.</p>`,
      });

      if (error) {
        throw new Error(error.message);
      }

      logger.info(`OTP email sent via Resend API to ${email}`);
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

  const smtpHost = process.env['SMTP_HOST'] ?? 'smtp.gmail.com';
  const smtpUser = process.env['SMTP_USER'];
  const rawSmtpPass = process.env['SMTP_PASS'];
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
      from: process.env['SMTP_FROM'] ?? process.env['SMTP_USER'] ?? resendFrom,
      to: email,
      subject: 'Mã xác thực Zync',
      text: `Mã xác thực của bạn là: ${otp}. Có hiệu lực trong 5 phút.`,
      html: `<p>Mã xác thực của bạn là: <strong>${otp}</strong>. Có hiệu lực trong <strong>5 phút</strong>.</p>`,
    });
    logger.info(`OTP email sent via SMTP to ${email}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    const isGmailAuthError =
      message.includes('Invalid login') ||
      message.includes('BadCredentials') ||
      message.includes('Username and Password not accepted');
    const isResendSandboxError =
      message.includes('You can only send testing emails to your own email address') ||
      message.includes('verify a domain at resend.com/domains');

    if (isGmailAuthError) {
      throw new BadRequestError(
        'Gmail SMTP đăng nhập thất bại. Hãy dùng đúng SMTP_USER là email Gmail và SMTP_PASS là App Password 16 ký tự (không phải mật khẩu Gmail thường).',
      );
    }

    if (isResendSandboxError) {
      throw new BadRequestError(
        'Resend đang ở chế độ test. Hãy verify domain tại resend.com/domains và đặt SMTP_FROM bằng email thuộc domain đã verify.',
      );
    }

    throw error;
  }
}
