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
      switch (job.data.update.type) {
        case 'PersistPage': {
          let payloadData: number[] = [];
          if (typeof job.data.update.payload === 'object' && 'data' in job.data.update.payload) {
            payloadData = Array.from((job.data.update.payload as { data: Uint8Array }).data);
          }
          const result = this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'upsertPage' },
            job.data.update.ownerDsnpUserId,
            job.data.update.schemaId,
            job.data.update.pageId,
            job.data.update.prevHash,
            payloadData,
          );
          this.logger.debug(`PersistPage: dsnpId:${job.data.update.ownerDsnpUserId.toString()}`);
          this.logger.debug(`PersistPage: result:${result}`);
          this.logger.debug(`PersistPage: result:${JSON.stringify(result, null, 2)}`);
          break;
        }
        case 'DeletePage':
          this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'deletePage' },
            job.data.update.ownerDsnpUserId,
            job.data.update.schemaId,
            job.data.update.pageId,
            job.data.update.prevHash,
          );
          this.logger.debug(`DeletePage: dsnpId:${job.data.update.ownerDsnpUserId.toString()}`);
          break;
        case 'AddKey':
          this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'addKey' },
            job.data.update.ownerDsnpUserId,
            job.data.update.prevHash,
            Array.from(job.data.update.payload),
          );
          this.logger.debug(`AddKey: dsnpId:${job.data.update.ownerDsnpUserId.toString()}`);
          break;
        default:
          break;
      }

      this.logger.debug(`job: ${JSON.stringify(job, null, 2)}`);
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }
}
