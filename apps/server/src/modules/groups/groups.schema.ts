import { z } from 'zod';

export const CreateGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(100, 'Group name too long'),
  avatarUrl: z.string().url('avatarUrl must be a valid URL').optional(),
  memberIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user id')).max(100, 'Maximum 100 members').optional().default([]),
  category: z.enum(['frontend','backend','devops','ai-ml','mobile','career','general','other']).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
  rules: z.string().max(2000).optional(),
  isPublic: z.boolean().optional(),
});

export const UpdateGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(100, 'Group name too long').optional(),
  avatarUrl: z.string().url('avatarUrl must be a valid URL').nullable().optional(),
}).refine((data) => data.name !== undefined || data.avatarUrl !== undefined, {
  message: 'At least one field must be provided',
});

export const AddGroupMembersSchema = z.object({
  memberIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user id')).min(1, 'Select at least 1 member').max(100, 'Maximum 100 members per request'),
});

export const UpdateGroupMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export const UpdateGroupMemberApprovalSchema = z.object({
  memberApprovalEnabled: z.boolean(),
});

export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupDto = z.infer<typeof UpdateGroupSchema>;
export type AddGroupMembersDto = z.infer<typeof AddGroupMembersSchema>;
export type UpdateGroupMemberRoleDto = z.infer<typeof UpdateGroupMemberRoleSchema>;
export type UpdateGroupMemberApprovalDto = z.infer<typeof UpdateGroupMemberApprovalSchema>;
