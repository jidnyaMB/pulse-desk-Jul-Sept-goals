import { ClsStore } from 'nestjs-cls';

export interface AppClsStore extends ClsStore {
  tenantId?: string;
  userId?: string;
  requestId: string;
}
