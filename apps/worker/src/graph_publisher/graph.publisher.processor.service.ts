import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { Hash } from '@polkadot/types/interfaces';
import { KeyringPair } from '@polkadot/keyring/types';
import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { MILLISECONDS_PER_SECOND } from 'time-constants';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { ConfigService } from '../../../../libs/common/src/config/config.service';
import { QueueConstants, NonceService } from '../../../../libs/common/src';
import { BaseConsumer } from '../BaseConsumer';
import { GraphUpdateJob } from '../../../../libs/common/src/dtos/graph.update.job';
import { BlockchainService } from '../../../../libs/common/src/blockchain/blockchain.service';
import { createKeys } from '../../../../libs/common/src/blockchain/create-keys';
import { ITxMonitorJob } from '../../../../libs/common/src/dtos/graph.notifier.job';

export const SECONDS_PER_BLOCK = 12;
const CAPACITY_EPOCH_TIMEOUT_NAME = 'capacity_check';

/**
 * Service responsible for publishing graph updates.
 */
@Injectable()
@Processor(QueueConstants.GRAPH_CHANGE_PUBLISH_QUEUE)
export class GraphUpdatePublisherService extends BaseConsumer {
  private capacityExhausted = false;

  public processMutex = new Mutex();

  public async onApplicationBootstrap() {
    await this.checkCapacity();
  }

  // public async onModuleDestroy() {
  //   try {
  //     this.schedulerRegistry.deleteTimeout(CAPACITY_EPOCH_TIMEOUT_NAME);
  //   } catch (err) {
  //     // ignore
  // }

  constructor(
    @InjectRedis() private cacheManager: Redis,
    @InjectQueue(QueueConstants.GRAPH_CHANGE_PUBLISH_QUEUE) private graphChangePublishQueue: Queue,
    @InjectQueue(QueueConstants.GRAPH_CHANGE_NOTIFY_QUEUE) private graphChangeNotifyQueue: Queue,
    private configService: ConfigService,
    private blockchainService: BlockchainService,
    private nonceService: NonceService,
    // private emitter: EventEmitter2,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    super();
  }

  /**
   * Processes a job for graph update.
   * @param job - The job to process.
   * @returns A promise that resolves when the job is processed.
   */
  async process(job: Job<GraphUpdateJob, any, string>): Promise<any> {
    // Acquire a lock to prevent multiple jobs from processing at the same time
    this.logger.debug(`Acquiring lock for job ${job.id}`);
    const release = await this.processMutex.acquire();
    let statefulStorageTxHash: Hash = {} as Hash;
    try {
      this.logger.log(`Processing job ${job.id} of type ${job.name}`);
      const lastFinalizedBlockHash = await this.blockchainService.getLatestFinalizedBlockHash();
      const currentCapacityEpoch = await this.blockchainService.getCurrentCapacityEpoch();
      switch (job.data.update.type) {
        case 'PersistPage': {
          let payloadData: number[] = [];
          if (typeof job.data.update.payload === 'object' && 'data' in job.data.update.payload) {
            payloadData = Array.from((job.data.update.payload as { data: Uint8Array }).data);
          }
          const providerKeys = createKeys(this.configService.getProviderAccountSeedPhrase());
          const tx = this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'upsertPage' },
            job.data.update.ownerDsnpUserId,
            job.data.update.schemaId,
            job.data.update.pageId,
            job.data.update.prevHash,
            payloadData,
          );
          statefulStorageTxHash = await this.processSingleBatch(providerKeys, tx);
          break;
        }
        case 'DeletePage': {
          const providerKeys = createKeys(this.configService.getProviderAccountSeedPhrase());
          const tx = this.blockchainService.createExtrinsicCall(
            { pallet: 'statefulStorage', extrinsic: 'deletePage' },
            job.data.update.ownerDsnpUserId,
            job.data.update.schemaId,
            job.data.update.pageId,
            job.data.update.prevHash,
          );
          statefulStorageTxHash = await this.processSingleBatch(providerKeys, tx);
          break;
        }
        default:
          break;
      }

      this.logger.debug(`successful job: ${JSON.stringify(job, null, 2)}`);

      // Add a job to the graph change notify queue
      const txMonitorJob: ITxMonitorJob = {
        id: job.data.referenceId,
        txHash: statefulStorageTxHash,
        epoch: currentCapacityEpoch.toString(),
        lastFinalizedBlockHash,
        referencePublishJob: job.data,
      };
      const blockDelay = SECONDS_PER_BLOCK * MILLISECONDS_PER_SECOND;

      this.logger.debug(`Adding job to graph change notify queue: ${txMonitorJob.id}`);
      this.graphChangeNotifyQueue.add(`Graph Change Notify Job - ${txMonitorJob.id}`, txMonitorJob, {
        delay: blockDelay,
      });
    } catch (error: any) {
      // If error message starts with `1010: Invalid Transaction: Inability to pay some fees, e.g. account balance too low`
      // then remove the job from the failed queue and add it to the paused queue
      if (error.message.startsWith('1010: Invalid Transaction: Inability to pay some fees')) {
        this.logger.error(`Job ${job.data.referenceId} failed (attempts=${job.attemptsMade})`);
        const isDeadLetter = job.data.referenceId?.search(this.configService.getDeadLetterPrefix()) === 0;
        if (!isDeadLetter && job.attemptsMade === 1 && job.data.referenceId) {
          this.logger.debug(`Adding delay to job ${job.data.referenceId}`);
          const deadLetterDelayedJobId = `${this.configService.getDeadLetterPrefix()}${job.data.referenceId}`;
          // Add this job with priority to the paused queue
          this.graphChangePublishQueue.remove(deadLetterDelayedJobId);
          this.graphChangePublishQueue.remove(job.data.referenceId);
          this.graphChangePublishQueue.add(`Graph Change Publish Job - ${job.data.referenceId}`, job.data, {
            jobId: deadLetterDelayedJobId,
            delay: 1000,
            priority: 1,
          });
        }
      }
      // Failed transaction due to low capacity errors will be caught here and checkCapacity() will pause the queues
      this.logger.error(error);
      throw error;
    } finally {
      await this.checkCapacity();
      release();
    }
  }

  /**
   * Processes a single batch by submitting a transaction to the blockchain.
   *
   * @param providerKeys The key pair used for signing the transaction.
   * @param tx The transaction to be submitted.
   * @returns The hash of the submitted transaction.
   * @throws Error if the transaction hash is undefined or if there is an error processing the batch.
   */
  async processSingleBatch(providerKeys: KeyringPair, tx: SubmittableExtrinsic<'rxjs', ISubmittableResult>): Promise<Hash> {
    this.logger.debug(`Submitting tx of size ${tx.length}, nonce:${tx.nonce}, method: ${tx.method.section}.${tx.method.method}`);
    try {
      const ext = this.blockchainService.createExtrinsic(
        { pallet: 'frequencyTxPayment', extrinsic: 'payWithCapacity' },
        { eventPallet: 'frequencyTxPayment', event: 'CapacityPaid' },
        providerKeys,
        tx,
      );
      const nonce = await this.nonceService.getNextNonce();
      this.logger.debug(`Capacity Wrapped Extrinsic: ${ext}, nonce:${nonce}`);
      const [txHash, _] = await ext.signAndSend(nonce);
      if (!txHash) {
        throw new Error('Tx hash is undefined');
      }
      this.logger.debug(`Tx hash: ${txHash}`);
      return txHash;
    } catch (error: any) {
      this.logger.error(`Error processing batch: ${error}`);
      throw error;
    }
  }

  // @OnEvent('capacity.exhausted', { async: true, promisify: true })
  // private async handleCapacityExhausted() {
  //   this.logger.debug('Received capacity.exhausted event');
  //   this.capacityExhausted = true;
  //   await this.graphChangePublishQueue.pause();
  //   const capacityLimit = this.configService.getCapacityLimit();
  //   const capacityInfo = await this.blockchainService.capacityInfo(this.configService.getProviderId());

  //   await this.graphChangePublishQueue.pause();
  //   const blocksRemaining = capacityInfo.nextEpochStart - capacityInfo.currentBlockNumber;
  //   try {
  //     // Check if a timeout with the same name already exists
  //     if (this.schedulerRegistry.doesExist('timeout', CAPACITY_EPOCH_TIMEOUT_NAME)) {
  //       // If it does, delete it
  //       this.schedulerRegistry.deleteTimeout(CAPACITY_EPOCH_TIMEOUT_NAME);
  //     }

  //     // Add the new timeout
  //     this.schedulerRegistry.addTimeout(
  //       CAPACITY_EPOCH_TIMEOUT_NAME,
  //       setTimeout(() => this.checkCapacity(), blocksRemaining * SECONDS_PER_BLOCK * MILLISECONDS_PER_SECOND),
  //     );
  //   } catch (err) {
  //     // Handle any errors
  //     console.error(err);
  //   }
  // }

  // @OnEvent('capacity.refilled', { async: true, promisify: true })
  // private async handleCapacityRefilled() {
  //   this.logger.debug('Received capacity.refilled event');
  //   this.capacityExhausted = false;
  //   try {
  //     this.schedulerRegistry.deleteTimeout(CAPACITY_EPOCH_TIMEOUT_NAME);
  //   } catch (err) {
  //     // ignore
  //   }

  //   await this.graphChangePublishQueue.resume();
  // }

  private async checkCapacity(): Promise<void> {
    try {
      const capacityLimit = this.configService.getCapacityLimit();
      const capacityInfo = await this.blockchainService.capacityInfo(this.configService.getProviderId());
      const { remainingCapacity } = capacityInfo;
      const { currentEpoch } = capacityInfo;
      const epochCapacityKey = `epochCapacity:${currentEpoch}`;
      const epochUsedCapacity = BigInt((await this.cacheManager.get(epochCapacityKey)) ?? 0); // Fetch capacity used by the service
      let outOfCapacity = remainingCapacity <= 0n;

      if (!outOfCapacity) {
        this.logger.debug(`Capacity remaining: ${remainingCapacity}`);
        if (capacityLimit.type === 'percentage') {
          const capacityLimitPercentage = BigInt(capacityLimit.value);
          const capacityLimitThreshold = (capacityInfo.totalCapacityIssued * capacityLimitPercentage) / 100n;
          this.logger.debug(`Capacity limit threshold: ${capacityLimitThreshold}`);
          if (epochUsedCapacity >= capacityLimitThreshold) {
            outOfCapacity = true;
            this.logger.warn(`Capacity threshold reached: used ${epochUsedCapacity} of ${capacityLimitThreshold}`);
          }
        } else if (epochUsedCapacity >= capacityLimit.value) {
          outOfCapacity = true;
          this.logger.warn(`Capacity threshold reached: used ${epochUsedCapacity} of ${capacityLimit.value}`);
        }
      }

      if (outOfCapacity) {
        // await this.emitter.emitAsync('capacity.exhausted');
        this.logger.debug('Capacity Exhausted: Pausing graph change publish queue and setting timeout');
        this.capacityExhausted = true;

        await this.graphChangePublishQueue.pause();
        const blocksRemaining = capacityInfo.nextEpochStart - capacityInfo.currentBlockNumber;
        try {
          // Check if a timeout with the same name already exists
          if (this.schedulerRegistry.doesExist('timeout', CAPACITY_EPOCH_TIMEOUT_NAME)) {
            // If it does, delete it
            this.schedulerRegistry.deleteTimeout(CAPACITY_EPOCH_TIMEOUT_NAME);
          }

          // Add the new timeout
          this.schedulerRegistry.addTimeout(
            CAPACITY_EPOCH_TIMEOUT_NAME,
            setTimeout(() => this.checkCapacity(), blocksRemaining * SECONDS_PER_BLOCK * MILLISECONDS_PER_SECOND),
          );
        } catch (err) {
          // Handle any errors
          console.error(err);
        }
      } else {
        // await this.emitter.emitAsync('capacity.refilled');
        this.logger.debug('Received capacity.refilled event');
        this.capacityExhausted = false;
        try {
          this.schedulerRegistry.deleteTimeout(CAPACITY_EPOCH_TIMEOUT_NAME);
        } catch (err) {
          // ignore
        }

        await this.graphChangePublishQueue.resume();
      }
    } catch (err) {
      this.logger.error('Caught error in checkCapacity', err);
    }
  }
}
