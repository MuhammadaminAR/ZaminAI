import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/metric-card";
import { AnalysisStatusBadge } from "@/components/status-badge";
import { DemoBadge, EmptyState, LoadingState } from "@/components/ui-states";
import { useSession } from "@/hooks/use-session";
import { listAnalyses, listUsers } from "@/lib/store";
import {
  listAuditLog,
  listUpgradeRequests,
  reviewUpgradeRequest,
  setUserPlan,
  setUserRole,
} from "@/lib/quota.functions";
import { localizeError, useLanguage } from "@/lib/i18n";
import type { Analysis, PlanId, User } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — ZaminAI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Users, subscriptions and analyses across the platform." },
      { property: "og:title", content: "Admin dashboard — ZaminAI" },
      { property: "og:description", content: "Platform users, subscriptions and analyses." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const PLAN_IDS: PlanId[] = ["free", "professional", "premium"];

type UpgradeRequest = {
  id: string;
  user_id: string;
  current_plan: PlanId;
  requested_plan: PlanId;
  status: "pending" | "contacted" | "approved" | "rejected";
  message: string | null;
  phone: string | null;
  contact_email: string;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type AuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  target_user_id: string | null;
  previous_plan: PlanId | null;
  new_plan: PlanId | null;
  previous_role: string | null;
  new_role: string | null;
  reason: string | null;
  created_at: string;
};

const statusStyles: Record<UpgradeRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  contacted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-muted text-muted-foreground",
};

function AdminPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const { t, fmtDate, fmtDateTime } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [planChoice, setPlanChoice] = useState<Record<string, PlanId>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchRequests = useServerFn(listUpgradeRequests);
  const fetchAudit = useServerFn(listAuditLog);
  const reviewRequest = useServerFn(reviewUpgradeRequest);
  const applyPlan = useServerFn(setUserPlan);
  const applyRole = useServerFn(setUserRole);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuper = user?.role === "super_admin";

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  const refresh = useCallback(async () => {
    const [u, a, r, log] = await Promise.all([
      listUsers().catch(() => [] as User[]),
      listAnalyses().catch(() => [] as Analysis[]),
      fetchRequests().catch(() => []).then((r) => r as UpgradeRequest[]),
      fetchAudit().catch(() => []).then((l) => l as AuditEntry[]),
    ]);
    setUsers(u);
    setAnalyses(a);
    setRequests(r);
    setAudit(log);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
  }, [isAdmin, refresh]);

  if (!ready || !user) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <EmptyState
          icon="🔒"
          title={t("admin.accessTitle")}
          message={t("admin.accessText")}
          action={
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("admin.backToDashboard")}
            </Link>
          }
        />
      </AppShell>
    );
  }

  const paying = users.filter((u) => u.plan !== "free");
  const openRequests = requests.filter((r) => r.status === "pending" || r.status === "contacted");

  async function runAction(key: string, fn: () => Promise<unknown>) {
    setBusyKey(key);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setActionError(localizeError((err as Error).message, t));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("admin.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.sub")}
            {isSuper ? ` ${t("admin.superNote")}` : ""}
          </p>
        </div>
        <DemoBadge />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.users")} value={users.length} />
        <StatCard label={t("admin.paidSubs")} value={paying.length} />
        <StatCard label={t("admin.analyses")} value={analyses.length} />
        <StatCard label={t("admin.openRequests")} value={openRequests.length} />
      </div>

      {actionError ? (
        <p className="mt-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{actionError}</p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{t("admin.upgradeRequests")}</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("admin.colUser")}</th>
                <th className="px-4 py-3">{t("admin.colRequest")}</th>
                <th className="px-4 py-3">{t("admin.colDetails")}</th>
                <th className="px-4 py-3">{t("admin.colStatus")}</th>
                <th className="px-4 py-3">{t("admin.colReview")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((r) => {
                const open = r.status === "pending" || r.status === "contacted";
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{r.contact_email}</p>
                      <p className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t(`plan.${r.current_plan}.name`)} →{" "}
                      <span className="font-medium text-foreground">{t(`plan.${r.requested_plan}.name`)}</span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                      {r.message ? <p>{r.message}</p> : null}
                      {r.phone ? <p className="mt-1">{t("admin.phone")}: {r.phone}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[r.status]}`}>
                        {t(`reqStatus.${r.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {open ? (
                        <div className="space-y-2">
                          <input
                            value={notes[r.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            placeholder={t("admin.notePlaceholder")}
                            maxLength={1000}
                            className="w-44 rounded-md border border-input bg-card px-2 py-1 text-xs outline-none focus:border-primary"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {(["contacted", "approved", "rejected"] as const).map((action) => (
                              <button
                                key={action}
                                type="button"
                                disabled={busyKey === r.id}
                                onClick={() =>
                                  runAction(r.id, () =>
                                    reviewRequest({
                                      data: { requestId: r.id, action, note: notes[r.id] || undefined },
                                    }),
                                  )
                                }
                                className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${
                                  action === "approved"
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border bg-card text-foreground hover:bg-accent"
                                }`}
                              >
                                {action === "approved" ? t("admin.approve") : action === "rejected" ? t("admin.reject") : t("admin.markContacted")}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {r.reviewed_at ? t("admin.decided", { date: fmtDate(r.reviewed_at) }) : "—"}
                          {r.admin_note ? <span className="block">{r.admin_note}</span> : null}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {t("admin.noRequests")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{t("admin.usersPlans")}</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("admin.colName")}</th>
                <th className="px-4 py-3">{t("admin.colEmail")}</th>
                <th className="px-4 py-3">{t("admin.colRole")}</th>
                <th className="px-4 py-3">{t("admin.colPlan")}</th>
                <th className="px-4 py-3">{t("admin.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{u.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t(`role.${u.role}`)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                      {t(`plan.${u.plan}.name`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={planChoice[u.id] ?? u.plan}
                        onChange={(e) =>
                          setPlanChoice((p) => ({ ...p, [u.id]: e.target.value as PlanId }))
                        }
                        className="rounded-md border border-input bg-card px-2 py-1 text-xs outline-none focus:border-primary"
                      >
                        {PLAN_IDS.map((p) => (
                          <option key={p} value={p}>
                            {t(`plan.${p}.name`)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyKey === `plan-${u.id}` || (planChoice[u.id] ?? u.plan) === u.plan}
                        onClick={() =>
                          runAction(`plan-${u.id}`, () =>
                            applyPlan({
                              data: { userId: u.id, plan: planChoice[u.id] ?? u.plan },
                            }),
                          )
                        }
                        className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
                      >
                        {t("admin.setPlan")}
                      </button>
                      {isSuper && u.id !== user.id ? (
                        u.role === "admin" ? (
                          <button
                            type="button"
                            disabled={busyKey === `role-${u.id}`}
                            onClick={() =>
                              runAction(`role-${u.id}`, () =>
                                applyRole({ data: { userId: u.id, role: "admin", grant: false } }),
                              )
                            }
                            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-destructive hover:bg-accent disabled:opacity-60"
                          >
                            {t("admin.removeAdmin")}
                          </button>
                        ) : u.role === "farmer" || u.role === "consultant" ? (
                          <button
                            type="button"
                            disabled={busyKey === `role-${u.id}`}
                            onClick={() =>
                              runAction(`role-${u.id}`, () =>
                                applyRole({ data: { userId: u.id, role: "admin", grant: true } }),
                              )
                            }
                            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
                          >
                            {t("admin.makeAdmin")}
                          </button>
                        ) : null
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {t("admin.noUsers")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("admin.planNote")}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{t("admin.recentAnalyses")}</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("admin.colLocation")}</th>
                <th className="px-4 py-3">{t("admin.colRegion")}</th>
                <th className="px-4 py-3">{t("admin.colScore")}</th>
                <th className="px-4 py-3">{t("admin.colStatus")}</th>
                <th className="px-4 py-3">{t("admin.colDate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {analyses.slice(0, 10).map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{a.farmName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.location.region}</td>
                  <td className="px-4 py-3 text-foreground">{a.suitabilityScore}/100</td>
                  <td className="px-4 py-3">
                    <AnalysisStatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(a.createdAt)}</td>
                </tr>
              ))}
              {analyses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {t("admin.noAnalyses")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{t("admin.auditLog")}</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("admin.colWhen")}</th>
                <th className="px-4 py-3">{t("admin.colAction")}</th>
                <th className="px-4 py-3">{t("admin.colChange")}</th>
                <th className="px-4 py-3">{t("admin.colReason")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {audit.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(e.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{e.action}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e.previous_plan || e.new_plan ? (
                      <span>
                        {e.previous_plan ? t(`plan.${e.previous_plan}.name`) : "—"} → {e.new_plan ? t(`plan.${e.new_plan}.name`) : "—"}
                      </span>
                    ) : null}
                    {e.previous_role || e.new_role ? (
                      <span>
                        {e.previous_role ? t(`role.${e.previous_role}`) : "—"} → {e.new_role ? t(`role.${e.new_role}`) : "—"}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">{e.reason ?? "—"}</td>
                </tr>
              ))}
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    {t("admin.noAudit")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
