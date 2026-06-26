// Shared types + client helpers for talking to the NOVA backend.

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

export interface StatColumn {
  test: "KS" | "Chi2";
  statistic?: number;
  tvd?: number;
  p_value: number;
  similarity: number;
  pass: boolean;
}

export interface ValidationReport {
  statistical: {
    per_column: Record<string, StatColumn>;
    summary: {
      pass_rate: number;
      mean_similarity: number;
      n_columns: number;
      overall_pass: boolean;
    };
  };
  correlation: { l1_diff: number; max_diff: number; n_features: number; pass: boolean };
  tstr?: {
    real_accuracy: number;
    synth_accuracy: number;
    real_auc: number;
    synth_auc: number;
    performance_ratio: number;
    auc_ratio: number;
    pass: boolean;
  };
  privacy: {
    median_dcr_ratio: number;
    duplicate_share: number;
    median_synth_distance: number;
    median_holdout_distance: number;
    pass: boolean;
  };
  distinguishability: {
    attack_accuracy: number;
    baseline: number;
    advantage: number;
    pass: boolean;
  };
  overall: { passed: number; total: number; all_pass: boolean };
}

export interface GenerateResponse {
  num_rows: number;
  generation_seconds: number;
  columns: string[];
  preview: Record<string, string | number>[];
  target_column: string | null;
  synthetic_default_rate: number | null;
  real_default_rate: number | null;
  validation: ValidationReport;
  csv: string;
}

export interface StatusResponse {
  model_loaded: boolean;
  reference_dataset?: string;
  trained_epochs?: number | null;
  best_ks?: number | null;
  n_columns?: number;
  columns?: string[];
  discrete_columns?: string[];
  target?: string | null;
  device?: string;
  max_rows?: number;
}

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch(`${BACKEND_URL}/api/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export async function generate(form: FormData): Promise<GenerateResponse> {
  // Posts to the Next.js proxy route, which forwards to the backend.
  const res = await fetch("/api/generate", { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.error || `Generation failed (${res.status})`);
  }
  return res.json();
}
