export interface JwtPayload {
  sub: string; // user id
  tid: string; // tenant id
  role: string;
  jti: string; // unique token id, for tracing
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: string;
}
