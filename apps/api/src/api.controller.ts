import { Controller, Get, HttpCode, HttpStatus, Logger, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiService } from './api.service';
import { GraphsQueryParamsDto } from '../../../libs/common/src';

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
  health() {
    return {
      status: HttpStatus.OK,
    };
  }

  // Fetch graphs for list of `dsnpIds` at optional `blockNumber`
  @Get('graphs')
  @HttpCode(HttpStatus.OK)
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
}
