import { resolveCustomerFromRequest } from "@/lib/auth/resolveCustomer";
import { db } from "@/lib/billing/db";
import { QUANTUM_JOB_REFUND_PREFIX } from "@/lib/billing/ledgerReasons";
import { canCancelOn } from "@/lib/quantum/backends";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NOT_SUPPORTED = { error: "not_supported", message: "This backend doesn't support cancelling jobs." };

/**
 * POST /api/lr/quantum/jobs/:id/cancel
 *
 * Cancels a job that hasn't run yet, through qpu-proxy's
 * POST /jobs/{uuid}/cancel. Only IonQ supports it (backends.ts: cancelable);
 * qpu-proxy answers 501 for the others, and so does this route, without
 * calling it. Same ownership rule as GET jobs/:id: 404 for a job that isn't
 * yours. The new status is cached on our row so the Jobs list shows it.
 *
 * A paid job (IonQ Forte, a priced simulator) that qpu-proxy confirms as
 * cancelled gets its charge back, under the same ledger reason as a job
 * qpu-proxy refused at submit (QUANTUM_JOB_REFUND_PREFIX, so it never counts
 * as a purchase). Once only: see refundCancelledJob.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) {
    return NextResponse.json(
      { error: "Not signed in, and no valid API key provided." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const submission = await db.quantumJobSubmission.findUnique({ where: { jobId: id } });
  if (!submission || submission.customerId !== customer.id) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (!canCancelOn(submission.backend)) {
    return NextResponse.json(NOT_SUPPORTED, { status: 501 });
  }

  const proxyRes = await fetch(
    `${process.env.QUANTUM_PROXY_URL}/jobs/${encodeURIComponent(id)}/cancel`,
    { method: "POST", headers: { Authorization: `Bearer ${process.env.QUANTUM_PROXY_SERVICE_KEY}` } },
  ).catch((err) => {
    console.error("qpu-proxy unreachable:", err);
    return null;
  });

  if (!proxyRes) {
    return NextResponse.json(
      { error: "cancel_failed", message: "Job submission service is currently unreachable. Try again later." },
      { status: 502 },
    );
  }
  const body: Record<string, unknown> = await proxyRes.json().catch(() => ({}));
  if (proxyRes.status === 501) return NextResponse.json(NOT_SUPPORTED, { status: 501 });
  if (!proxyRes.ok) {
    // e.g. the job already started or finished: qpu-proxy's own reason.
    const detail = typeof body.detail === "string" ? body.detail : "";
    return NextResponse.json(
      { error: "cancel_failed", message: detail || `Couldn't cancel this job (HTTP ${proxyRes.status}).` },
      { status: proxyRes.status >= 500 ? 502 : proxyRes.status },
    );
  }

  const status = typeof body.status === "string" ? body.status : "CANCELLED";
  await db.quantumJobSubmission
    .update({ where: { jobId: id }, data: { status } })
    .catch(() => {});
  const refundedCredits = status === "CANCELLED" ? await refundCancelledJob(id, customer.id) : 0;
  return NextResponse.json({ status, refundedCredits });
}

/**
 * Returns a cancelled job's charge. Claiming the row (refundedAt still null,
 * something charged) and crediting happen in one transaction, so a repeated
 * or concurrent cancel finds it claimed and refunds nothing. Returns the
 * credits refunded: 0 for a free job, one already refunded, or a failed
 * refund (logged for manual follow-up; the cancel itself still stands).
 */
async function refundCancelledJob(jobId: string, customerId: string): Promise<number> {
  try {
    return await db.$transaction(async (tx) => {
      const job = await tx.quantumJobSubmission.findUnique({ where: { jobId } });
      if (!job || job.customerId !== customerId || job.costCents <= 0) return 0;
      const claimed = await tx.quantumJobSubmission.updateMany({
        where: { jobId, refundedAt: null },
        data: { refundedAt: new Date() },
      });
      if (claimed.count === 0) return 0;
      await tx.customer.update({
        where: { id: customerId },
        data: { creditsBalanceCents: { increment: job.costCents } },
      });
      await tx.creditLedgerEntry.create({
        data: { customerId, amountCents: job.costCents, reason: `${QUANTUM_JOB_REFUND_PREFIX}${job.backend}` },
      });
      return job.costCents;
    });
  } catch (err) {
    console.error(`[ionq] REFUND FAILED: customer ${customerId}, cancelled job ${jobId}:`, err);
    return 0;
  }
}
