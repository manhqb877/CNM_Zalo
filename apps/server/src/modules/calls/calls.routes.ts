import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { validateBody } from '../../shared/middleware/validate.middleware';
import {
  acceptCallSessionHandler,
  createCallSessionHandler,
  endCallSessionHandler,
  getActiveCallHandler,
  getCallSessionHandler,
  issueCallSessionTokenHandler,
  rejectCallSessionHandler,
} from './calls.controller';
import { CreateCallSessionSchema, EndCallSessionSchema, RejectCallSessionSchema } from './calls.schema';

export const callsRouter = Router();

callsRouter.use(authenticate);

callsRouter.get('/active', getActiveCallHandler);
callsRouter.post('/sessions', validateBody(CreateCallSessionSchema), createCallSessionHandler);
callsRouter.get('/sessions/:sessionId', getCallSessionHandler);
callsRouter.post('/sessions/:sessionId/token', issueCallSessionTokenHandler);
callsRouter.post('/sessions/:sessionId/accept', acceptCallSessionHandler);
callsRouter.post('/sessions/:sessionId/reject', validateBody(RejectCallSessionSchema), rejectCallSessionHandler);
callsRouter.post('/sessions/:sessionId/end', validateBody(EndCallSessionSchema), endCallSessionHandler);
