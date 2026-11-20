import SignInRequired from "@/components/auth/SignInRequired";
import JobsList from "@/components/jobs/JobsList";
import { getSession } from "@/lib/auth/session";

export const metadata = {
  title: "Jobs | Light Rider Quantum",
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { isAuthenticated } = await getSession();
  // /jobs?job=<id> opens that job's details (linked from composer Compare results).
  const { job } = await searchParams;
  const initialJobId = typeof job === "string" && job ? job : null;

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-semibold text-gray-700">Jobs</h1>
      <p className="mb-12 text-sm text-gray-600">
        Track and manage your submitted jobs.
      </p>

      {!isAuthenticated && <SignInRequired target="your jobs" />}
      {isAuthenticated && <JobsList initialJobId={initialJobId} />}
    </div>
  );
}
