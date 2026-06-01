import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/auth.middleware';
import {
  getAssistantListHandler,
  getUnreadConversationsHandler,
  createCatchupDigestHandler,
  getCatchupLatestHandler,
  regenerateCatchupHandler,
  updateSettingsHandler,
  listAssistantTasksHandler,
  createAssistantTaskHandler,
  updateAssistantTaskHandler,
  deleteAssistantTaskHandler,
  searchAssistantMessagesHandler,
  listGroupNotesHandler,
  createGroupNoteHandler,
  getGroupNoteDetailHandler,
  updateGroupNoteHandler,
  deleteGroupNoteHandler,
  regenerateGroupNoteHandler,
} from './assistant.controller';

export const assistantRouter = Router({ mergeParams: true });

// GET /api/ai/assistant?type=catchup_digest&limit=10&skip=0
assistantRouter.get('/', authenticate, getAssistantListHandler);

// GET /api/ai/assistant/catchup/unread-conversations
assistantRouter.get('/catchup/unread-conversations', authenticate, getUnreadConversationsHandler);

// GET /api/ai/assistant/search?q=&conversationId=&limit=20
assistantRouter.get('/search', authenticate, searchAssistantMessagesHandler);

// POST /api/ai/assistant/catchup
assistantRouter.post('/catchup', authenticate, createCatchupDigestHandler);

// GET /api/ai/assistant/catchup/:conversationId
assistantRouter.get('/catchup/:conversationId', authenticate, getCatchupLatestHandler);

// POST /api/ai/assistant/catchup/:conversationId/regenerate
assistantRouter.post('/catchup/:conversationId/regenerate', authenticate, regenerateCatchupHandler);

// PATCH /api/ai/assistant/conversations/:conversationId/settings
assistantRouter.patch(
  '/conversations/:conversationId/settings',
  authenticate,
  updateSettingsHandler,
);

// GET /api/ai/assistant/tasks?status=active
assistantRouter.get('/tasks', authenticate, listAssistantTasksHandler);

// POST /api/ai/assistant/tasks
assistantRouter.post('/tasks', authenticate, createAssistantTaskHandler);

// PATCH /api/ai/assistant/tasks/:taskId
assistantRouter.patch('/tasks/:taskId', authenticate, updateAssistantTaskHandler);

// DELETE /api/ai/assistant/tasks/:taskId
assistantRouter.delete('/tasks/:taskId', authenticate, deleteAssistantTaskHandler);

// GET /api/ai/assistant/notes?conversationId=&limit=20
assistantRouter.get('/notes', authenticate, listGroupNotesHandler);

// POST /api/ai/assistant/conversations/:conversationId/notes
assistantRouter.post('/conversations/:conversationId/notes', authenticate, createGroupNoteHandler);

// GET /api/ai/assistant/notes/:noteId
assistantRouter.get('/notes/:noteId', authenticate, getGroupNoteDetailHandler);

// PATCH /api/ai/assistant/notes/:noteId
assistantRouter.patch('/notes/:noteId', authenticate, updateGroupNoteHandler);

// DELETE /api/ai/assistant/notes/:noteId
assistantRouter.delete('/notes/:noteId', authenticate, deleteGroupNoteHandler);

// POST /api/ai/assistant/notes/:noteId/regenerate
assistantRouter.post('/notes/:noteId/regenerate', authenticate, regenerateGroupNoteHandler);
