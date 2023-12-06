import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';

export const initSwagger = async (app: INestApplication, apiPath: string) => {
  const options = new DocumentBuilder()
    .setTitle('Graph Service')
    .setDescription('Graph Service API')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      description: 'Enter JWT token',
    })
    .addCookieAuth('SESSION')
    .build();
  const document = SwaggerModule.createDocument(app, options, {
    extraModels: [],
  });
  // write swagger.json to disk
  fs.writeFileSync('./swagger.json', JSON.stringify(document));
  SwaggerModule.setup(apiPath, app, document);
};
