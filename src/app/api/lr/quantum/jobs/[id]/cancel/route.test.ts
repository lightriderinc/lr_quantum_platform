import { beforeEach, describe, expect, test, vi } from "vitest";

// Offline only: fetch is stubbed and answers only the fake qpu-proxy host.

const PROXY = "http://qpu-proxy.test";

const state = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  calls: [] as string[],
  balance: 0,
  ledger: [] as { customerId: string; amountCents: number; reason: string }[],
  cancelStatus: 200,
  cancelBody: { status: "CANCELLED" } as Record<string, unknown>,
}));

vi.mock("@/lib/auth/resolveCustomer", () => ({
  resolveCustomerFromRequest: async () => ({ id: "cust_1" }),
}));
vi.mock("@/lib/billing/db", () => {
  const db = {
    quantumJobSubmission: {
      findUnique: async ({ where }: { where: { jobId: string } }) => state.rows.get(where.jobId) ?? null,
      update: async ({ where, data }: { where: { jobId: string }; data: Record<string, unknown> }) => {
        Object.assign(state.rows.get(where.jobId)!, data);
        return {};
      },
      // Compare-and-set like Postgres: only a row still matching `where` changes.
      updateMany: async ({ where, data }: { where: { jobId: string; refundedAt: null }; data: Record<string, unknown> }) => {
        const r = state.rows.get(where.jobId);
        if (!r || r.refundedAt != null) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      },
    },
    customer: {
      update: async ({ data }: { data: { creditsBalanceCents: { increment: number } } }) => {
        state.balance += data.creditsBalanceCents.increment;
        return {};
      },
    },
    creditLedgerEntry: {
      create: async ({ data }: { data: { customerId: string; amountCents: number; reason: string } }) => {
        state.ledger.push(data);
        return {};
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});

const row = (jobId: string, backend: string, extra: Record<string, unknown> = {}) =>
  state.rows.set(jobId, { jobId, backend, customerId: "cust_1", status: "PENDING", costCents: 0, circuit: null, refundedAt: null, createdAt: new Date(0), ...extra });

beforeEach(() => {
  state.rows.clear();
  state.calls = [];
  state.balance = 0;
  state.ledger = [];
  state.cancelStatus = 200;
  state.cancelBody = { status: "CANCELLED" };
  vi.stubEnv("QUANTUM_PROXY_URL", PROXY);
  vi.stubEnv("QUANTUM_PROXY_SERVICE_KEY", "lr_test");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (!url.startsWith(PROXY)) throw new Error(`unexpected fetch ${url}`);
    state.calls.push(`${init?.method ?? "GET"} ${url.slice(PROXY.length)}`);
    if (url.endsWith("/cancel")) return Response.json(state.cancelBody, { status: state.cancelStatus });
    return Response.json({ id: url.split("/").pop(), status: "COMPLETED" });
  });
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST jobs/:id/cancel", () => {
  test("IonQ: cancelled through qpu-proxy and the new status cached for the Jobs list", async () => {
    const { POST } = await import("./route");
    row("j1", "ionq-forte-1");
    const res = await POST(new Request("http://x/") as never, ctx("j1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "CANCELLED", refundedCredits: 0 });
    expect(state.calls).toEqual(["POST /jobs/j1/cancel"]);
    expect(state.rows.get("j1")!.status).toBe("CANCELLED");
  });

  test("backends without cancel: 501, qpu-proxy never called", async () => {
    const { POST } = await import("./route");
    row("j2", "iqm-garnet");
    const res = await POST(new Request("http://x/") as never, ctx("j2"));
    expect(res.status).toBe(501);
    expect(state.calls).toEqual([]);
  });

  test("qpu-proxy's own refusal (e.g. already running) is passed on, status unchanged", async () => {
    const { POST } = await import("./route");
    row("j3", "ionq-simulator");
    state.cancelStatus = 409;
    state.cancelBody = { detail: "job is already running" };
    const res = await POST(new Request("http://x/") as never, ctx("j3"));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("job is already running");
    expect(state.rows.get("j3")!.status).toBe("PENDING");
  });

  test("free simulator: cancelled, nothing to refund", async () => {
    const { POST } = await import("./route");
    row("s1", "ionq-simulator");
    const res = await POST(new Request("http://x/") as never, ctx("s1"));
    expect(await res.json()).toEqual({ status: "CANCELLED", refundedCredits: 0 });
    expect(state.ledger).toEqual([]);
    expect(state.rows.get("s1")!.refundedAt).toBeNull();
  });

  test("someone else's job: 404", async () => {
    const { POST } = await import("./route");
    row("j4", "ionq-simulator", { customerId: "cust_2" });
    const res = await POST(new Request("http://x/") as never, ctx("j4"));
    expect(res.status).toBe(404);
    expect(state.calls).toEqual([]);
  });
});

describe("cancelling a paid IonQ job refunds its charge, once", () => {
  const ctxPost = async (id: string) => {
    const { POST } = await import("./route");
    return POST(new Request("http://x/") as never, ctx(id));
  };

  test("Forte: the charge comes back under the job refund reason (excluded from purchases)", async () => {
    row("f1", "ionq-forte-1", { costCents: 130 });
    const res = await ctxPost("f1");
    expect(await res.json()).toEqual({ status: "CANCELLED", refundedCredits: 130 });
    expect(state.balance).toBe(130);
    expect(state.ledger).toEqual([{ customerId: "cust_1", amountCents: 130, reason: "quantum_job_refund:ionq-forte-1" }]);
    expect(state.rows.get("f1")!.refundedAt).toBeInstanceOf(Date);
  });

  test("cancel again, or twice at once: still a single refund", async () => {
    row("f2", "ionq-forte-enterprise-1", { costCents: 500 });
    const [a, b] = await Promise.all([ctxPost("f2"), ctxPost("f2")]);
    const third = await ctxPost("f2");
    const refunds = [await a.json(), await b.json(), await third.json()].map((r) => r.refundedCredits);
    expect(refunds.sort((x, y) => y - x)).toEqual([500, 0, 0]);
    expect(state.ledger).toHaveLength(1);
    expect(state.balance).toBe(500);
  });

  test("a priced simulator job is refunded too", async () => {
    row("n1", "ionq-forte-1-simulator", { costCents: 30 });
    expect((await (await ctxPost("n1")).json()).refundedCredits).toBe(30);
    expect(state.ledger).toEqual([{ customerId: "cust_1", amountCents: 30, reason: "quantum_job_refund:ionq-forte-1-simulator" }]);
  });

  test("no refund unless qpu-proxy confirms the cancel", async () => {
    row("f3", "ionq-forte-1", { costCents: 130 });
    state.cancelStatus = 409;
    state.cancelBody = { detail: "job is already running" };
    expect((await ctxPost("f3")).status).toBe(409);

    row("f4", "ionq-forte-1", { costCents: 130 });
    state.cancelStatus = 200;
    state.cancelBody = { status: "COMPLETED" };
    expect(await (await ctxPost("f4")).json()).toEqual({ status: "COMPLETED", refundedCredits: 0 });

    expect(state.ledger).toEqual([]);
    expect(state.balance).toBe(0);
  });

  test("the job details then show 0 credits charged", async () => {
    const { GET } = await import("../route");
    row("f5", "ionq-forte-1", { costCents: 130 });
    await ctxPost("f5");
    const detail = await (await GET(new Request("http://x/") as never, ctx("f5"))).json();
    expect(detail.creditsCharged).toBe(0);
  });
});

describe("GET jobs/:id: circuit and credits from our own row", () => {
  test("credits charged (0 on a free simulator) and the stored circuit", async () => {
    const { GET } = await import("../route");
    const circuit = { name: "bell", num_qubits: 2, instructions: [{ name: "h", qubits: [0] }] };
    row("p1", "iqm-garnet", { costCents: 200, circuit });
    row("f1", "ionq-simulator", { costCents: 0 });
    const paid = await (await GET(new Request("http://x/") as never, ctx("p1"))).json();
    expect(paid).toMatchObject({ status: "COMPLETED", creditsCharged: 200, circuit });
    const free = await (await GET(new Request("http://x/") as never, ctx("f1"))).json();
    expect(free).toMatchObject({ creditsCharged: 0, circuit: null });
  });
});
