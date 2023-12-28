import { Test, TestingModule } from '@nestjs/testing';
import { describe, beforeEach, it, jest, expect } from '@jest/globals';
import { Job } from 'bullmq';
import { GraphUpdatePublisherService } from './graph.publisher.processor.service';
import { BlockchainService } from '../../../../libs/common/src/blockchain/blockchain.service';
import { GraphUpdateJob } from '../../../../libs/common/src';

describe('GraphPublisherProcessorService', () => {
  let service: GraphUpdatePublisherService;
  let blockchainService: BlockchainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphUpdatePublisherService,
        {
          provide: BlockchainService,
          useValue: {
            createExtrinsicCall: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GraphUpdatePublisherService>(GraphUpdatePublisherService);
    blockchainService = module.get<BlockchainService>(BlockchainService);
  });

  describe('process', () => {
    it('should call createExtrinsicCall with correct parameters for PersistPage update', async () => {
      const job = {
        id: 'jobId',
        name: 'jobName',
        data: {
          update: {
            type: 'PersistPage',
            ownerDsnpUserId: 'userId',
            schemaId: 1,
            pageId: 'pageId',
            prevHash: 'prevHash',
            payload: [1, 2, 3],
          },
        },
      } as unknown as Job<GraphUpdateJob, any, string>;

      await service.process(job);

      expect(blockchainService.createExtrinsicCall).toHaveBeenCalledWith({ pallet: 'statefulStorage', extrinsic: 'upsertPage' }, 'userId', 1, 'pageId', 'prevHash', [1, 2, 3]);
    });

    it('should call createExtrinsicCall with correct parameters for DeletePage update', async () => {
      const job = {
        id: 'jobId',
        name: 'jobName',
        data: {
          update: {
            type: 'DeletePage',
            ownerDsnpUserId: 'userId',
            schemaId: 1,
            pageId: 'pageId',
            prevHash: 'prevHash',
          },
        },
      } as unknown as Job<GraphUpdateJob, any, string>;

      await service.process(job);

      expect(blockchainService.createExtrinsicCall).toHaveBeenCalledWith({ pallet: 'statefulStorage', extrinsic: 'deletePage' }, 'userId', 1, 'pageId', 'prevHash');
    });

    it('should call createExtrinsicCall with correct parameters for AddKey update', async () => {
      const job = {
        id: 'jobId',
        name: 'jobName',
        data: {
          update: {
            type: 'AddKey',
            ownerDsnpUserId: 'userId',
            prevHash: 'prevHash',
            payload: [1, 2, 3],
          },
        },
      } as unknown as Job<GraphUpdateJob, any, string>;

      await service.process(job);

      expect(blockchainService.createExtrinsicCall).toHaveBeenCalledWith({ pallet: 'statefulStorage', extrinsic: 'addKey' }, 'userId', 'prevHash', [1, 2, 3]);
    });

    // Add more test cases for other update types if needed

    // it('should log the job as JSON', async () => {
    //   const job = {
    //     id: 'jobId',
    //     name: 'jobName',
    //     data: {
    //       update: {
    //         type: 'PersistPage',
    //         ownerDsnpUserId: 'userId',
    //         schemaId: 1,
    //         pageId: 'pageId',
    //         prevHash: 'prevHash',
    //         payload: [1, 2, 3],
    //       },
    //     },
    //     asJSON: jest.fn(),
    //   } as unknown as Job<GraphUpdateJob, any, string>;

    //   await service.process(job);

    //   expect(job.asJSON).toHaveBeenCalled();
    // });

    // it('should throw an error and log it if an exception occurs', async () => {
    //   const job = {
    //     id: 'jobId',
    //     name: 'jobName',
    //     data: {
    //       update: {
    //         type: 'PersistPage',
    //         ownerDsnpUserId: 'userId',
    //         schemaId: 1,
    //         pageId: 'pageId',
    //         prevHash: 'prevHash',
    //         payload: [1, 2, 3],
    //       },
    //     },
    //   } as unknown as Job<GraphUpdateJob, any, string>;

    //   const error = new Error('Something went wrong');
    //   jest.spyOn(blockchainService, 'createExtrinsicCall').mockRejectedValueOnce(error);
    //   await expect(service.process(job)).rejects.toThrow(error);
    // });
  });
});
