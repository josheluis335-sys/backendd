export interface AttemptDecision {
  blocked: boolean;
  retryAfterSeconds: number;
}

export interface PublicAttemptsStore {
  blocked(ip: string, caseNumber: string): AttemptDecision;
  failure(ip: string, caseNumber: string): AttemptDecision;
  success(ip: string, caseNumber: string): void;
  clearExpired(): number;
}
