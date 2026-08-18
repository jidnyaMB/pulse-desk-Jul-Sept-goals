import { SetMetadata } from '@nestjs/common';

export interface RequiredPermission {
  relation: string;
  objectType: string;
  // Name of the route :param that holds the object's id, e.g. 'id' for /patients/:id
  paramName: string;
}

export const REQUIRE_PERMISSION_KEY = 'require_permission';

// Usage: @RequirePermission('viewer', 'patient', 'id')
export const RequirePermission = (relation: string, objectType: string, paramName: string) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { relation, objectType, paramName } as RequiredPermission);
