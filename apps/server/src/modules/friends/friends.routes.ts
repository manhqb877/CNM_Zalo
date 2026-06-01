import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { friendRequestRateLimiter } from '../../shared/middleware/rate-limiter.middleware';
import { validateBody } from '../../shared/middleware/validate.middleware';
import { SendFriendRequestSchema } from './friends.schema';
import {
  acceptFriendRequestHandler,
  blockUserHandler,
  getFriendsCountHandler,
  listFriendRequestsHandler,
  listFriendsHandler,
  rejectFriendRequestHandler,
  sendFriendRequestHandler,
  unblockUserHandler,
  unfriendHandler,
} from './friends.controller';

export const friendsRouter = Router();

friendsRouter.use(authenticate);

// POST /api/friends/request – send friend request
friendsRouter.post(
  '/request',
  friendRequestRateLimiter,
  validateBody(SendFriendRequestSchema),
  sendFriendRequestHandler,
);

// PUT /api/friends/request/:requestId/accept
friendsRouter.put('/request/:requestId/accept', acceptFriendRequestHandler);

// PUT /api/friends/request/:requestId/reject
friendsRouter.put('/request/:requestId/reject', rejectFriendRequestHandler);

// DELETE /api/friends/:friendId – unfriend
friendsRouter.delete('/:friendId', unfriendHandler);

// POST /api/friends/:userId/block
friendsRouter.post('/:userId/block', blockUserHandler);

// DELETE /api/friends/:userId/block – unblock
friendsRouter.delete('/:userId/block', unblockUserHandler);

// GET /api/friends/requests – incoming/outgoing pending requests
friendsRouter.get('/requests', listFriendRequestsHandler);

// GET /api/friends/count – get total friends count
friendsRouter.get('/count', getFriendsCountHandler);

// GET /api/friends – list friends (cursor paginated)
friendsRouter.get('/', listFriendsHandler);
