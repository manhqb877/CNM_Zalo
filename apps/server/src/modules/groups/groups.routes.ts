import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { validateBody } from '../../shared/middleware/validate.middleware';
import {
  addGroupMembersHandler,
  createGroupHandler,
  deleteGroupHandler,
  leaveGroupHandler,
  removeGroupMemberHandler,
  updateGroupHandler,
  updateGroupMemberApprovalHandler,
  updateGroupMemberRoleHandler,
  getPublicChannelsHandler,
  discoverChannelsHandler,
  joinPublicChannelHandler,
} from './groups.controller';
import {
  AddGroupMembersSchema,
  CreateGroupSchema,
  UpdateGroupMemberApprovalSchema,
  UpdateGroupMemberRoleSchema,
  UpdateGroupSchema,
} from './groups.schema';

export const groupsRouter = Router();

groupsRouter.use(authenticate);

// GET /api/groups/public – public channels list
groupsRouter.get('/public', getPublicChannelsHandler);

// GET /api/groups/discover – channels by interests
groupsRouter.get('/discover', discoverChannelsHandler);

// POST /api/groups – create group
groupsRouter.post('/', validateBody(CreateGroupSchema), createGroupHandler);

// PATCH /api/groups/:groupId – update group (admin only)
groupsRouter.patch('/:groupId', validateBody(UpdateGroupSchema), updateGroupHandler);

// POST /api/groups/:groupId/members – add members
groupsRouter.post('/:groupId/members', validateBody(AddGroupMembersSchema), addGroupMembersHandler);

// POST /api/groups/:groupId/join – join public channel
groupsRouter.post('/:groupId/join', joinPublicChannelHandler);

// DELETE /api/groups/:groupId/members/me – leave group
groupsRouter.delete('/:groupId/members/me', leaveGroupHandler);

// PATCH /api/groups/:groupId/members/:userId/role – update member role (admin/member)
groupsRouter.patch(
  '/:groupId/members/:userId/role',
  validateBody(UpdateGroupMemberRoleSchema),
  updateGroupMemberRoleHandler,
);

// PATCH /api/groups/:groupId/member-approval – toggle member approval setting (creator only)
groupsRouter.patch(
  '/:groupId/member-approval',
  validateBody(UpdateGroupMemberApprovalSchema),
  updateGroupMemberApprovalHandler,
);

// DELETE /api/groups/:groupId/members/:userId – remove member
groupsRouter.delete('/:groupId/members/:userId', removeGroupMemberHandler);

// DELETE /api/groups/:groupId – disband group (admin only)
groupsRouter.delete('/:groupId', deleteGroupHandler);
