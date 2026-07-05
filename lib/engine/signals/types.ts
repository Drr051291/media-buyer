export type EntityLevel = "campaign" | "adset" | "ad";

export interface EntityRef {
  level: EntityLevel;
  metaId: string;
  name: string;
}

export type SignalSeverity = "info" | "warning" | "critical";

export interface Signal {
  signal: string;
  entity: EntityRef;
  severity: SignalSeverity;
  evidence: string[];
}
