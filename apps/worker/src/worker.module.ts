import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { BlockchainModule } from '../../../libs/common/src/blockchain/blockchain.module';
import { RequestProcessorModule } from './request_processor/request.processor.module';
import { RequestProcessorService } from './request_processor/request.processor.service';
import { ConfigModule } from '../../../libs/common/src/config/config.module';
import { ConfigService } from '../../../libs/common/src/config/config.service';
import { GraphUpdatePublisherModule } from './graph_publisher/graph.publisher.processor.module';
import { GraphUpdatePublisherService } from './graph_publisher/graph.publisher.processor.service';
import { GraphNotifierModule } from './graph_notifier/graph.monitor.processor.module';
import { GraphNotifierService } from './graph_notifier/graph.monitor.processor.service';
import { ProviderWebhookService, NonceService, QueueConstants, GraphStateManager } from '../../../libs/common/src';
import { BlockchainScannerService } from '../../../libs/common/src/services/blockchain-scanner.service';

@Module({
  imports: [
    BullModule,
    ConfigModule,
    RedisModule.forRootAsync(
      {
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          config: [{ url: configService.redisUrl.toString() }],
        }),
        inject: [ConfigService],
      },
      true, // isGlobal
    ),
    EventEmitterModule.forRoot({
      // Use this instance throughout the application
      global: true,
      // set this to `true` to use wildcards
      wildcard: false,
      // the delimiter used to segment namespaces
      delimiter: '.',
      // set this to `true` if you want to emit the newListener event
      newListener: false,
      // set this to `true` if you want to emit the removeListener event
      removeListener: false,
      // the maximum amount of listeners that can be assigned to an event
      maxListeners: 10,
      // show event name in memory leak message when more than maximum amount of listeners is assigned
      verboseMemoryLeak: false,
      // disable throwing uncaughtException if an error event is emitted and it has no listeners
      ignoreErrors: false,
    }),
    BullModule.registerQueue(
      {
        name: QueueConstants.GRAPH_CHANGE_REQUEST_QUEUE,
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
          attempts: 3,
        },
      },
      {
        name: QueueConstants.GRAPH_CHANGE_PUBLISH_QUEUE,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 1,
        },
      },
      {
        name: QueueConstants.GRAPH_CHANGE_NOTIFY_QUEUE,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
        },
      },
      {
        name: QueueConstants.RECONNECT_REQUEST_QUEUE,
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
          attempts: 3,
        },
      },
    ),
    ScheduleModule.forRoot(),
    BlockchainModule,
    RequestProcessorModule,
    GraphUpdatePublisherModule,
    GraphNotifierModule,
  ],
  providers: [
    ConfigService,
    RequestProcessorService,
    GraphUpdatePublisherService,
    GraphNotifierService,
    ProviderWebhookService,
    NonceService,
    BlockchainScannerService,
    GraphStateManager,
  ],
})
export class WorkerModule {}
