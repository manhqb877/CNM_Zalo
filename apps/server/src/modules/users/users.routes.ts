import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { validateBody } from '../../shared/middleware/validate.middleware';
import { UpdateProfileSchema, UpsertDeviceTokenSchema } from '../auth/auth.schema';
import { UpdateAccountSettingsSchema } from './users.schema';
import {
  getMeHandler,
  getUserByIdHandler,
  getPublicProfileHandler,
  searchUsersHandler,
  updateProfileHandler,
  upsertDeviceTokenHandler,
  discoverUsersHandler,
  getUserPresenceHandler,
  getBulkPresenceHandler,
  getAccountSettingsHandler,
  updateAccountSettingsHandler,
} from './users.controller';

export const usersRouter = Router();

// All user routes require authentication
usersRouter.use(authenticate);

// GET /api/users/me – get own profile
usersRouter.get('/me', getMeHandler);

// GET /api/users/me/settings – get account settings
usersRouter.get('/me/settings', getAccountSettingsHandler);

// GET /api/users/search?query=...&limit=10 – search users for friend request
usersRouter.get('/search', searchUsersHandler);

// GET /api/users/discover – nổi bật theo skills/tags
usersRouter.get('/discover', discoverUsersHandler);

// GET /api/users/:userId/public-profile – get safe public profile
usersRouter.get('/:userId/public-profile', getPublicProfileHandler);

// GET /api/users/:userId – get user profile (public)
usersRouter.get('/:userId', getUserByIdHandler);

// GET /api/users/presence/bulk – batch presence for friend list
usersRouter.get('/presence/bulk', getBulkPresenceHandler);

// GET /api/users/:userId/presence – presence for single user
usersRouter.get('/:userId/presence', getUserPresenceHandler);

// PATCH /api/users/me – update own profile
usersRouter.patch('/me', validateBody(UpdateProfileSchema), updateProfileHandler);

// PATCH /api/users/me/settings – update account settings
usersRouter.patch('/me/settings', validateBody(UpdateAccountSettingsSchema), updateAccountSettingsHandler);

// POST /api/users/me/device-token – register device token for push notifications
usersRouter.post('/me/device-token', validateBody(UpsertDeviceTokenSchema), upsertDeviceTokenHandler);
