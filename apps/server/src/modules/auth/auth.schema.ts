import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRegex = /^[a-z0-9._]{3,30}$/;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => emailRegex.test(value), 'Email must be valid');

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .transform((value) => value.replace(/^@/, '').toLowerCase())
  .refine((value) => usernameRegex.test(value), 'Username only supports letters, numbers, dot and underscore');

export const RegisterSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const VerifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  username: usernameSchema,
  displayName: z.string().min(1).max(50).optional(),
  password: passwordSchema,
  deviceToken: z.string().optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});
export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

export const LoginPasswordRequestOtpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type LoginPasswordRequestOtpDto = z.infer<typeof LoginPasswordRequestOtpSchema>;

export const LoginPasswordVerifyOtpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  deviceToken: z.string().optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});
export type LoginPasswordVerifyOtpDto = z.infer<typeof LoginPasswordVerifyOtpSchema>;

export const GoogleLoginSchema = z.object({
  idToken: z.string().min(20, 'Google idToken is required'),
  deviceToken: z.string().optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});
export type GoogleLoginDto = z.infer<typeof GoogleLoginSchema>;

export const ForgotPasswordRequestOtpSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordRequestOtpDto = z.infer<typeof ForgotPasswordRequestOtpSchema>;

export const ForgotPasswordResetSchema = z.object({
  email: emailSchema,
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  newPassword: passwordSchema,
});
export type ForgotPasswordResetDto = z.infer<typeof ForgotPasswordResetSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
  confirmNewPassword: passwordSchema,
}).refine((value) => value.newPassword === value.confirmNewPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmNewPassword'],
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

export const UpdateProfileSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().trim().min(1).max(50).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().trim().max(500).optional(),
  skills: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  githubUrl: z.string().url().optional().or(z.literal('')),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  devRole: z.enum(['developer','mentor','student','recruiter','other']).optional(),
  onboardingCompleted: z.boolean().optional(),
}).strict();
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const UpsertDeviceTokenSchema = z.object({
  deviceToken: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
});
export type UpsertDeviceTokenDto = z.infer<typeof UpsertDeviceTokenSchema>;

export const LogoutSchema = z.object({
  deviceToken: z.string().min(1).optional(),
});
export type LogoutDto = z.infer<typeof LogoutSchema>;
