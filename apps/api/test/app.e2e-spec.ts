/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-undef */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomFill } from 'crypto';
import { ApiModule } from '../src/api.module';
import { PrivacyType, ProviderGraphDto } from '../../../libs/common/src';
import { Direction } from '../../../libs/common/src/dtos/direction.dto';
import { ConnectionType } from '../../../libs/common/src/dtos/connection.type.dto';

describe('Graph Service E2E request verification!', () => {
  let app: INestApplication;
  let module: TestingModule;
  // eslint-disable-next-line no-promise-executor-return
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile();

    app = module.createNestApplication();
    const eventEmitter = app.get<EventEmitter2>(EventEmitter2);
    eventEmitter.on('shutdown', async () => {
      await app.close();
    });
    app.useGlobalPipes(new ValidationPipe());
    app.enableShutdownHooks();
    await app.init();
  });

  it('(GET) /api/health', () => request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 200, message: 'Service is healthy' }));

  describe('(POST) /api/update-graph', () => {
    it('Valid graph update request should work', async () => {
      const validGraphChangeRequest: ProviderGraphDto = {
        dsnpId: '2',
        connections: {
          data: [
            {
              dsnpId: '3',
              privacyType: PrivacyType.Public,
              direction: Direction.ConnectionTo,
              connectionType: ConnectionType.Follow,
            },
          ],
        },
      };

      return request(app.getHttpServer())
        .post(`/api/update-graph`)
        .send(validGraphChangeRequest)
        .expect(201)
        .expect((res) => expect(res.text).toContain('referenceId'));
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
