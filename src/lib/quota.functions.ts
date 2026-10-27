import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Quota, upgrade-request and admin-management server functions.
 * All enforcement lives in security-definer database functions; these thin
 * wrappers only authenticate the caller and forward to them. The browser can
 * never set quota counts, plans or roles directly.
 */

export interface QuotaStatus {
  plan: "free" | "professional" | "premium";
  unlimited: boolean;
  batch_size: number | null;
  used: number;
  remaining: number | null;
  cooldown_until: string | null;
  next_available_at: string | null;
}

export const getQuotaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuotaStatus> => {
    const { data, error } = await context.supabase.rpc("quota_status");
    if (error) throw new Error(error.message);
    return data as unknown as QuotaStatus;
  });

/** Reserves one quota unit before any provider work starts. Throws when blocked. */
export const reserveAnalysisQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string> => {
    const { data, error } = await context.supabase.rpc("reserve_analysis_quota");
    if (error) throw new Error(error.message);
    return data as string;
  });

const finalizeInput = z.object({ reservationId: z.string().uuid(), analysisId: z.string().uuid() });

/** Links the reservation to the saved analysis. Idempotent per analysis ID. */
export const finalizeAnalysisQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(finalizeInput)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("finalize_analysis_quota", {
      _reservation_id: data.reservationId,
      _analysis_id: data.analysisId,
    });
    if (error) throw new Error(error.message);
  });

/** Releases an unused reservation when the analysis fails before saving real results. */
export const releaseAnalysisQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ reservationId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("release_analysis_quota", {
      _reservation_id: data.reservationId,
    });
    if (error) throw new Error(error.message);
  });

/* ---------------- upgrade requests ---------------- */

const upgradeInput = z.object({
  plan: z.enum(["professional", "premium"]),
  message: z.string().max(1000).optional(),
  phone: z.string().max(40).optional(),
});

export const submitUpgradeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(upgradeInput)
  .handler(async ({ context, data }): Promise<string> => {
    const { data: id, error } = await context.supabase.rpc("submit_upgrade_request", {
      _plan: data.plan,
      _message: data.message ?? "",
      _phone: data.phone ?? "",
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

/** Own upgrade requests for the signed-in user. */
export const listMyUpgradeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("upgrade_requests")
      .select("id,current_plan,requested_plan,status,message,phone,created_at,reviewed_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ---------------- admin operations ---------------- */

/** Admin/Super Admin: all upgrade requests with requester info. */
export const listUpgradeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("upgrade_requests")
      .select("id,user_id,current_plan,requested_plan,status,message,phone,contact_email,admin_note,created_at,reviewed_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const reviewInput = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["contacted", "approved", "rejected"]),
  note: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().nullish(),
});

export const reviewUpgradeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reviewInput)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("admin_review_upgrade_request", {
      _request_id: data.requestId,
      _action: data.action,
      ...(data.note ? { _note: data.note } : {}),
      ...(data.expiresAt ? { _expires_at: data.expiresAt } : {}),
    });
    if (error) throw new Error(error.message);
  });

const setPlanInput = z.object({
  userId: z.string().uuid(),
  plan: z.enum(["free", "professional", "premium"]),
  expiresAt: z.string().datetime().nullish(),
  reason: z.string().max(1000).optional(),
});

export const setUserPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(setPlanInput)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("admin_set_user_plan", {
      _user_id: data.userId,
      _plan: data.plan,
      ...(data.expiresAt ? { _expires_at: data.expiresAt } : {}),
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
  });

const setRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "super_admin"]),
  grant: z.boolean(),
  reason: z.string().max(1000).optional(),
});

/** Super Admin only (enforced in the database function). */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(setRoleInput)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("superadmin_set_role", {
      _user_id: data.userId,
      _role: data.role,
      _grant: data.grant,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
  });

/** Admin/Super Admin: audit log entries, newest first. */
export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("admin_audit_log")
      .select("id,actor_id,action,target_user_id,target_request_id,previous_plan,new_plan,previous_role,new_role,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
