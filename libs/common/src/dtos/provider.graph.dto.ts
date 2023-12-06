import { IsEnum, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrivacyType } from './privacy.type.dto';
import { GraphKeyPairDto } from './graph.key.pair.dto';
import { ConnectionDto } from './connections.dto';

export class ProviderGraphDto {
  @IsNotEmpty()
  @IsString()
  dsnpId: string;

  @IsNotEmpty()
  @IsEnum(PrivacyType)
  privacyType: PrivacyType;

  @IsNotEmpty()
  @IsString()
  @ValidateNested({ each: true })
  @Type(() => ConnectionDto)
  connections: { data: ConnectionDto[] };

  @IsNotEmpty()
  @IsString()
  graphKeyPairs: GraphKeyPairDto[];
}
