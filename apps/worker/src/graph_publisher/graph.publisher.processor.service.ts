import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { ConfigService } from '../../../../libs/common/src/config/config.service';
import { QueueConstants, NonceService } from '../../../../libs/common/src';
import { BaseConsumer } from '../BaseConsumer';
import { GraphUpdateJob } from '../../../../libs/common/src/dtos/graph.update.job';
import { BlockchainService } from '../../../../libs/common/src/blockchain/blockchain.service';

@Injectable()
@Processor(QueueConstants.GRAPH_CHANGE_PUBLISH_QUEUE)
export class GraphUpdatePublisherService extends BaseConsumer {
  constructor(
    @InjectRedis() private cacheManager: Redis,
    private configService: ConfigService,
    private blockchainService: BlockchainService,
    private nonceService: NonceService,
  ) {
    super();
  }

  /**
   * Processes a job for graph update.
   * @param job - The job to process.
   * @returns A promise that resolves when the job is processed.
   */
  async process(job: Job<GraphUpdateJob, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);
    try {
      // TODO: add logic to process graph change requests
      switch (job.data.update.type) {
        case 'PersistPage':
          this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'upsertPage' },
            job.data.update.ownerDsnpUserId,
            job.data.update.schemaId,
            job.data.update.pageId,
            job.data.update.prevHash,
            Array.from(job.data.update.payload),
          );
          break;
        case 'DeletePage':
          this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'deletePage' },
            job.data.update.ownerDsnpUserId,
            job.data.update.schemaId,
            job.data.update.pageId,
            job.data.update.prevHash,
          );
          break;
        case 'AddKey':
          this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'addKey' },
            job.data.update.ownerDsnpUserId,
            job.data.update.prevHash,
            Array.from(job.data.update.payload),
          );
          break;
        default:
          break;
      }

      this.logger.debug(job.asJSON());
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }
}
