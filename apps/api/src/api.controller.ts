import { Controller, Get, Post, HttpCode, HttpStatus, Logger, Query, Body } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiService } from './api.service';
import { GraphsQueryParamsDto, ProviderGraphDto } from '../../../libs/common/src';

@Controller('api')
@ApiTags('API') // Specify the tag for Swagger documentation
export class ApiController {
  private readonly logger: Logger;

  constructor(private apiService: ApiService) {
    this.logger = new Logger(this.constructor.name);
  }

  // Health endpoint
  // eslint-disable-next-line class-methods-use-this
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check the health status of the service' })
  @ApiOkResponse({ description: 'Service is healthy' })
  health() {
    return {
      status: HttpStatus.OK,
      message: 'Service is healthy',
    };
  }

  // Fetch graphs for list of `dsnpIds` at optional `blockNumber`
  @Get('graphs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch graphs for specified dsnpIds and blockNumber' })
  @ApiOkResponse({ description: 'Graphs retrieved successfully' })
  async getGraphs(@Query() queryParams: GraphsQueryParamsDto) {
    try {
      // TODO: Uncomment this line once the ApiService is implemented
      // const graphs = await this.apiService.getGraphs(queryParams.dsnpIds, queryParams.blockNumber);
      return {
        status: HttpStatus.OK,
        data: [],
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Failed to fetch graphs');
    }
  }

  // Create a provider graph
  @Post('update-graph')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request an update to given users graph' })
  @ApiCreatedResponse({ description: 'Successfully queued job to update user graph' })
  @ApiBody({ type: ProviderGraphDto })
  async updateGraph(@Body() providerGraphDto: ProviderGraphDto) {
    try {
      // TODO: Uncomment this line once the ApiService is implemented
      // const result = await this.apiService.updateGraph(providerGraphDto);
      return {
        status: HttpStatus.CREATED,
        data: 'Successfully queued job to update user graph',
      };
    } catch (error) {
      this.logger.error(error);
      throw new Error('Failed to update graph');
    }
  }
}
