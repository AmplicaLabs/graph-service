import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrivacyType } from '@dsnp/graph-sdk';
import { MessageSourceId, SchemaId } from '@frequency-chain/api-augment/interfaces';
import { QueueConstants } from '../utils/queues';
import { DsnpGraphEdge } from '../dtos/dsnp.graph.edge.dto';
import { ConfigService } from '../config/config.service';
import { GraphStateManager } from './graph-state-manager';
import { GraphKeyPairDto } from '../dtos/graph.key.pair.dto';

@Injectable()
export class AsyncDebouncerService {
  private readonly logger: Logger;

  constructor(
    private redis: Redis,
    private readonly configService: ConfigService,
    private readonly graphStateManager: GraphStateManager,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  public async getGraphForDsnpId(dsnpId: MessageSourceId, privacyType: string, graphKeyPairs?: GraphKeyPairDto[]): Promise<DsnpGraphEdge[]> {
    return this.debounceAsyncOperation(dsnpId, privacyType, graphKeyPairs);
  }

  public async setGraphForSchemaId(dsnpId: MessageSourceId, schemaId: SchemaId, graphKeyPairs?: GraphKeyPairDto[]): Promise<DsnpGraphEdge[]> {
    if (!schemaId) {
      throw new Error('Schema ID is required');
    }
    const privacyType = this.graphStateManager.getPrivacyForSchema(schemaId.toNumber());
    return this.debounceAsyncOperation(dsnpId, privacyType, graphKeyPairs);
  }

  async debounceAsyncOperation(dsnpId: MessageSourceId, privacyType: string, graphKeyPairs?: GraphKeyPairDto[]): Promise<DsnpGraphEdge[]> {
    const cacheKey = this.getCacheKey(dsnpId.toString(), privacyType);

    const cachedFuture = await this.redis.get(cacheKey);
    if (cachedFuture) {
      this.logger.debug(`Async operation for key ${dsnpId} is already inflight`);
      return JSON.parse(cachedFuture);
    }

    let privacyTypeValue = PrivacyType.Public;
    if (privacyType === 'private') {
      privacyTypeValue = PrivacyType.Private;
    }

    // Use async/await to wait for the asynchronous operation to complete
    const graphEdges = this.graphStateManager.getConnectionsWithPrivacyType(dsnpId, privacyTypeValue, graphKeyPairs);

    // Continue with the rest of the debounce logic
    const debounceTime = this.configService.getAsyncDebounceTime();
    await this.redis.setex(cacheKey, debounceTime, JSON.stringify(graphEdges));

    return Promise.resolve(graphEdges);
  }

  async getInflightFuture<T>(key: string, privacyType: string): Promise<T | null> {
    const cacheKey = this.getCacheKey(key, privacyType);
    const cachedFuture = await this.redis.get(cacheKey);
    return cachedFuture ? JSON.parse(cachedFuture) : null;
  }

  private getCacheKey(key: string, privacyType: string): string {
    this.logger.debug(`Async operation for key ${key}:${privacyType}`);
    return `${QueueConstants.DEBOUNCER_CACHE_KEY}:${key}:${privacyType}`;
  }
}
