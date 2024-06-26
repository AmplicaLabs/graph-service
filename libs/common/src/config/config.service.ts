/*
https://docs.nestjs.com/providers#services
*/

import { EnvironmentType } from '@dsnp/graph-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { ICapacityLimit } from '../interfaces/capacity-limit.interface';

export interface ConfigEnvironmentVariables {
  REDIS_URL: URL;
  FREQUENCY_URL: URL;
  QUEUE_HIGH_WATER: number;
  API_PORT: number;
  DEBOUNCE_SECONDS: number;
  GRAPH_ENVIRONMENT_TYPE: keyof EnvironmentType;
  PROVIDER_ACCOUNT_SEED_PHRASE: string;
  PROVIDER_ID: string;
  RECONNECTION_SERVICE_REQUIRED: boolean;
  BLOCKCHAIN_SCAN_INTERVAL_MINUTES: number;
  PROVIDER_BASE_URL: string;
  PROVIDER_ACCESS_TOKEN: string;
  WEBHOOK_FAILURE_THRESHOLD: number;
  HEALTH_CHECK_SUCCESS_THRESHOLD: number;
  WEBHOOK_RETRY_INTERVAL_SECONDS: number;
  HEALTH_CHECK_MAX_RETRY_INTERVAL_SECONDS: number;
  HEALTH_CHECK_MAX_RETRIES: number;
  CONNECTIONS_PER_PROVIDER_RESPONSE_PAGE: number;
  CAPACITY_LIMIT: number;
}

/// Config service to get global app and provider-specific config values.
@Injectable()
export class ConfigService {
  private capacityLimit: ICapacityLimit;

  private logger: Logger;

  constructor(private nestConfigService: NestConfigService<ConfigEnvironmentVariables>) {
    this.logger = new Logger(this.constructor.name);
    this.capacityLimit = JSON.parse(this.nestConfigService.get<string>('CAPACITY_LIMIT')!);
  }

  public get providerBaseUrl(): URL {
    return this.nestConfigService.get<URL>('PROVIDER_BASE_URL')!;
  }

  public get providerApiToken(): string | undefined {
    return this.nestConfigService.get<string>('PROVIDER_ACCESS_TOKEN');
  }

  public getProviderId(): string {
    return this.nestConfigService.get<string>('PROVIDER_ID')!;
  }

  public getQueueHighWater(): number {
    return this.nestConfigService.get<number>('QUEUE_HIGH_WATER')!;
  }

  public getApiPort(): number {
    return this.nestConfigService.get<number>('API_PORT')!;
  }

  public getReconnectionServiceRequired(): boolean {
    return this.nestConfigService.get<boolean>('RECONNECTION_SERVICE_REQUIRED')!;
  }

  public getBlockchainScanIntervalMinutes(): number {
    return this.nestConfigService.get<number>('BLOCKCHAIN_SCAN_INTERVAL_MINUTES')!;
  }

  public getRedisUrl(): URL {
    return this.nestConfigService.get<URL>('REDIS_URL')!;
  }

  public getFrequencyUrl(): URL {
    return this.nestConfigService.get<URL>('FREQUENCY_URL')!;
  }

  public getGraphEnvironmentType(): keyof EnvironmentType {
    return this.nestConfigService.get<keyof EnvironmentType>('GRAPH_ENVIRONMENT_TYPE')!;
  }

  public getProviderAccountSeedPhrase(): string {
    return this.nestConfigService.get<string>('PROVIDER_ACCOUNT_SEED_PHRASE')!;
  }

  public get redisUrl(): URL {
    return this.nestConfigService.get('REDIS_URL')!;
  }

  public get frequencyUrl(): URL {
    return this.nestConfigService.get('FREQUENCY_URL')!;
  }

  public getHealthCheckMaxRetries(): number {
    return this.nestConfigService.get<number>('HEALTH_CHECK_MAX_RETRIES')!;
  }

  public getHealthCheckMaxRetryIntervalSeconds(): number {
    return this.nestConfigService.get<number>('HEALTH_CHECK_MAX_RETRY_INTERVAL_SECONDS')!;
  }

  public getHealthCheckSuccessThreshold(): number {
    return this.nestConfigService.get<number>('HEALTH_CHECK_SUCCESS_THRESHOLD')!;
  }

  public getWebhookFailureThreshold(): number {
    return this.nestConfigService.get<number>('WEBHOOK_FAILURE_THRESHOLD')!;
  }

  public getWebhookRetryIntervalSeconds(): number {
    return this.nestConfigService.get<number>('WEBHOOK_RETRY_INTERVAL_SECONDS')!;
  }

  public get webhookRetryIntervalSeconds(): number {
    return this.nestConfigService.get('WEBHOOK_RETRY_INTERVAL_SECONDS')!;
  }

  public getPageSize(): number {
    return this.nestConfigService.get('CONNECTIONS_PER_PROVIDER_RESPONSE_PAGE')!;
  }

  public getDebounceSeconds(): number {
    return this.nestConfigService.get<number>('DEBOUNCE_SECONDS')!;
  }

  public getCapacityLimit(): ICapacityLimit {
    return this.capacityLimit;
  }
}
