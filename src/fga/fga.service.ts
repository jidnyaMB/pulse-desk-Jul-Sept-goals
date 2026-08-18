import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenFgaClient } from '@openfga/sdk';

export interface ContextualTuple {
  user: string;
  relation: string;
  object: string;
}

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

  // contextualTuples exist ONLY for the duration of this single check call —
  // they're never persisted in the OpenFGA store. That's what makes
  // time-bounded access grants work: we hand OpenFGA a tuple representing
  // "user:X granted_viewer patient:Y" only when Postgres currently says that
  // grant is valid (not expired, not revoked), decided fresh on every check.
  async check(
    userId: string,
    relation: string,
    objectType: string,
    objectId: string,
    contextualTuples: ContextualTuple[] = [],
  ): Promise<boolean> {
    const result = await this.client.check({
      user: `user:${userId}`,
      relation,
      object: `${objectType}:${objectId}`,
      ...(contextualTuples.length > 0 ? { contextualTuples } : {}),
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
