import { type Model, type Document, type FilterQuery, type UpdateQuery, type QueryOptions } from 'mongoose';
import { logger } from '../logger';

/**
 * Base Repository - Abstract tầng truy xuất dữ liệu
 * Theo Repository Pattern: Service chỉ gọi repo methods, không gọi trực tiếp Model.
 */
export abstract class BaseRepository<T extends Document> {
  protected constructor(protected readonly model: Model<T>) {}

  async findById(id: string): Promise<T | null> {
    try {
      return await this.model.findById(id).lean() as T | null;
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] findById error`, err);
      throw err;
    }
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    try {
      return await this.model.findOne(filter).lean() as T | null;
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] findOne error`, err);
      throw err;
    }
  }

  async find(filter: FilterQuery<T>, options?: QueryOptions): Promise<T[]> {
    try {
      return await this.model.find(filter, null, options).lean() as T[];
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] find error`, err);
      throw err;
    }
  }

  async create(data: Partial<T>): Promise<T> {
    try {
      const doc = new this.model(data);
      return await doc.save() as unknown as T;
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] create error`, err);
      throw err;
    }
  }

  async updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<boolean> {
    try {
      const result = await this.model.updateOne(filter, update);
      return result.modifiedCount > 0;
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] updateOne error`, err);
      throw err;
    }
  }

  async updateMany(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<number> {
    try {
      const result = await this.model.updateMany(filter, update);
      return result.modifiedCount;
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] updateMany error`, err);
      throw err;
    }
  }

  async deleteOne(filter: FilterQuery<T>): Promise<boolean> {
    try {
      const result = await this.model.deleteOne(filter);
      return result.deletedCount > 0;
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] deleteOne error`, err);
      throw err;
    }
  }

  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    try {
      const result = await this.model.deleteMany(filter);
      return result.deletedCount;
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] deleteMany error`, err);
      throw err;
    }
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    try {
      return !!(await this.model.exists(filter));
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] exists error`, err);
      throw err;
    }
  }

  async count(filter: FilterQuery<T>): Promise<number> {
    try {
      return await this.model.countDocuments(filter);
    } catch (err) {
      logger.error(`[${this.model.modelName}Repository] count error`, err);
      throw err;
    }
  }
}
