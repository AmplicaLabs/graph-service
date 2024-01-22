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

  public async onApplicationBootstrap() {
    await this.checkCapacity();
  }

  // public public onModuleDestroy() {
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
    private emitter: EventEmitter2,
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
    let statefulStorageTxHash: Hash = {} as Hash;
    const lastFinalizedBlockHash = await this.blockchainService.getLatestFinalizedBlockHash();
    const currentCapacityEpoch = await this.blockchainService.getCurrentCapacityEpoch();
    try {
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
        default:
          break;
      }

      this.logger.debug(`job: ${JSON.stringify(job, null, 2)}`);

      // Add a job to the graph change notify queue
      const txMonitorJob: ITxMonitorJob = {
        id: job.data.referenceId,
        txHash: statefulStorageTxHash,
        epoch: currentCapacityEpoch.toString(),
        lastFinalizedBlockHash,
        referencePublishJob: job.data,
      };
      const blockDelay = SECONDS_PER_BLOCK * MILLISECONDS_PER_SECOND;

      this.graphChangeNotifyQueue.add(`Graph Change Notify Job - ${txMonitorJob.id}`, txMonitorJob, {
        delay: blockDelay,
      });
    } catch (error: any) {
      // If error message starts with `1010: Invalid Transaction: Inability to pay some fees, e.g. account balance too low`
      // then emit an event to pause the queues
      if (error.message.startsWith('1010: Invalid Transaction: Inability to pay some fees')) {
        this.emitter.emit('lowCapacity');
      }
      this.logger.error(error);
      throw error;
    } finally {
      await this.checkCapacity();
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
    this.logger.debug(`Submitting tx of size ${tx.length}`);
    try {
      const ext = this.blockchainService.createExtrinsic(
        { pallet: 'frequencyTxPayment', extrinsic: 'payWithCapacity' },
        { eventPallet: 'frequencyTxPayment', event: 'CapacityPaid' },
        providerKeys,
        tx,
      );
      const nonce = await this.nonceService.getNextNonce();
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

  /**
   * Handles low capacity by pausing the graph change notify queue.
   * @returns A promise that resolves when the queue is paused.
   */
  @OnEvent('lowCapacity', { async: true, promisify: true })
  private async handleLowCapacity(): Promise<void> {
    this.logger.debug('Pausing graph change notify queue');
    await this.graphChangePublishQueue.pause();

    // Get the current epoch length
    const epochLength = await this.blockchainService.getCurrentEpochLength();
    // Get the current epoch start block number
    const currentEpochStart = await this.blockchainService.getCurrentCapacityEpochStart();
    // Get the current block number
    const currentBlockNumber = await this.blockchainService.getLatestFinalizedBlockNumber();
    // Calculate the start of the next epoch
    const nextEpochStart = currentEpochStart.toNumber() + epochLength;
    // Calculate the number of seconds to pause the queue
    const pauseSeconds = BigInt(nextEpochStart - Number(currentBlockNumber)) * BigInt(SECONDS_PER_BLOCK);
    // Set a timeout to resume the queue
    setTimeout(
      async () => {
        this.logger.debug('Resuming graph change notify queue');
        await this.graphChangePublishQueue.resume();
      },
      Number(pauseSeconds) * MILLISECONDS_PER_SECOND,
    );
  }

  /**
   * Handles capacity recovered by resuming the graph change notify queue.
   * @returns A promise that resolves when the queue is resumed.
   */
  @OnEvent('capacityRecovered', { async: true, promisify: true })
  private async handleCapacityRecovered(): Promise<void> {
    this.logger.debug('Resuming graph change notify queue');
    // await this.graphChangeNotifyQueue.resume();
  }

  @OnEvent('capacity.exhausted', { async: true, promisify: true })
  private async handleCapacityExhausted() {
    this.logger.debug('Received capacity.exhausted event');
    this.capacityExhausted = true;
    await this.graphChangePublishQueue.pause();
    const capacityLimit = this.configService.getCapacityLimit();
    const capacity = await this.blockchainService.capacityInfo(this.configService.getProviderId());

    this.logger.debug(`
    Capacity limit: ${JSON.stringify(capacityLimit)}
    Capacity info: ${JSON.stringify(capacity)}`);

    await this.graphChangePublishQueue.pause();
    const blocksRemaining = capacity.nextEpochStart - capacity.currentBlockNumber;
    try {
      this.schedulerRegistry.addTimeout(
        CAPACITY_EPOCH_TIMEOUT_NAME,
        setTimeout(() => this.checkCapacity(), blocksRemaining * SECONDS_PER_BLOCK * MILLISECONDS_PER_SECOND),
      );
    } catch (err) {
      // ignore duplicate timeout
    }
  }

  @OnEvent('capacity.refilled', { async: true, promisify: true })
  private async handleCapacityRefilled() {
    this.logger.debug('Received capacity.refilled event');
    this.capacityExhausted = false;
    try {
      this.schedulerRegistry.deleteTimeout(CAPACITY_EPOCH_TIMEOUT_NAME);
    } catch (err) {
      // ignore
    }

    if (this.webhookOk) {
      await this.graphChangePublishQueue.resume();
    }
  }

  private async checkCapacity(): Promise<void> {
    try {
      const capacityLimit = this.configService.getCapacityLimit();
      const capacity = await this.blockchainService.capacityInfo(this.configService.getProviderId());
      const { remainingCapacity } = capacity;
      const { currentEpoch } = capacity;
      const epochCapacityKey = `epochCapacity:${currentEpoch}`;
      const epochUsedCapacity = BigInt((await this.cacheManager.get(epochCapacityKey)) ?? 0); // Fetch capacity used by the service
      let outOfCapacity = remainingCapacity <= 0n;

      if (!outOfCapacity) {
        this.logger.debug(`Capacity remaining: ${remainingCapacity}`);
        if (capacityLimit.type === 'percentage') {
          const capacityLimitPercentage = BigInt(capacityLimit.value);
          const capacityLimitThreshold = (capacity.totalCapacityIssued * capacityLimitPercentage) / 100n;
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
        await this.emitter.emitAsync('capacity.exhausted');
      } else {
        await this.emitter.emitAsync('capacity.refilled');
      }
    } catch (err) {
      this.logger.error('Caught error in checkCapacity', err);
    }
  }
}
