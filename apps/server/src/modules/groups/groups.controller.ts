import { type NextFunction, type Request, type Response } from 'express';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { GroupsService } from './groups.service';
import type {
  AddGroupMembersDto,
  CreateGroupDto,
  UpdateGroupMemberApprovalDto,
  UpdateGroupDto,
  UpdateGroupMemberRoleDto,
} from './groups.schema';

export async function createGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const body = req.body as CreateGroupDto;
    const group = await GroupsService.createGroup(userId, body);
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function updateGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const group = await GroupsService.updateGroup(userId, req.params['groupId'] as string, req.body as UpdateGroupDto);
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function addGroupMembersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const body = req.body as AddGroupMembersDto;
    const group = await GroupsService.addMembers(userId, req.params['groupId'] as string, body.memberIds);
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function updateGroupMemberRoleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const body = req.body as UpdateGroupMemberRoleDto;
    const group = await GroupsService.updateMemberRole(
      userId,
      req.params['groupId'] as string,
      req.params['userId'] as string,
      body.role,
    );
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function updateGroupMemberApprovalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const body = req.body as UpdateGroupMemberApprovalDto;
    const group = await GroupsService.updateMemberApproval(
      userId,
      req.params['groupId'] as string,
      body.memberApprovalEnabled,
    );
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function removeGroupMemberHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const group = await GroupsService.removeMember(
      userId,
      req.params['groupId'] as string,
      req.params['userId'] as string,
    );
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

export async function leaveGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const result = await GroupsService.leaveGroup(userId, req.params['groupId'] as string);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function deleteGroupHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    await GroupsService.deleteGroup(userId, req.params['groupId'] as string);
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function getPublicChannelsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const channels = await GroupsService.getPublicChannels();
    res.json({ success: true, data: channels });
  } catch (err) {
    next(err);
  }
}

export async function discoverChannelsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const channels = await GroupsService.discoverChannels(userId);
    res.json({ success: true, data: channels });
  } catch (err) {
    next(err);
  }
}

export async function joinPublicChannelHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const group = await GroupsService.joinPublicChannel(userId, req.params['groupId'] as string);
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

