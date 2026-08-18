import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenFgaClient } from '@openfga/sdk';

@Injectable()
export class FgaService {
  private readonly client: OpenFgaClient;

  constructor(configService: ConfigService) {
    this.client = new OpenFgaClient({
      apiUrl: configService.getOrThrow<string>('FGA_API_URL'),
      storeId: configService.getOrThrow<string>('FGA_STORE_ID'),
      authorizationModelId: configService.getOrThrow<string>('FGA_MODEL_ID'),
    });
  }

  async check(userId: string, relation: string, objectType: string, objectId: string): Promise<boolean> {
    const result = await this.client.check({
      user: `user:${userId}`,
      relation,
      object: `${objectType}:${objectId}`,
    });
    return result.allowed ?? false;
  }

  async writeTuple(userObject: string, relation: string, targetObject: string): Promise<void> {
    await this.client.write({ writes: [{ user: userObject, relation, object: targetObject }] });
  }

  async deleteTuple(userObject: string, relation: string, targetObject: string): Promise<void> {
    await this.client.write({ deletes: [{ user: userObject, relation, object: targetObject }] });
  }
}
