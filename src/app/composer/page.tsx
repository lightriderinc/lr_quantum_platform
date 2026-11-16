import Composer from "@/components/composer/Composer";
import { getSession } from "@/lib/auth/session";

export const metadata = {
  title: "Composer | Light Rider Quantum",
};

// Open to everyone: building a circuit, the preview and the QASM need no
// account. Running it asks the visitor to log in (see RunPanel).
export default async function ComposerPage() {
  const { isAuthenticated } = await getSession();

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-semibold text-gray-700">Composer</h1>
      <p className="mb-8 text-sm text-gray-600">
        Build a circuit, preview its outcomes, and run it on a simulator or a QPU.
      </p>

      <Composer isAuthenticated={isAuthenticated} />
    </div>
  );
}
