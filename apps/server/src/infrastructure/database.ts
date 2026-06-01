import mongoose from 'mongoose';
import { logger } from '../shared/logger';

export async function connectDatabase(): Promise<void> {
  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('MONGODB_URI is not defined');

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
  });
}

export { mongoose };
