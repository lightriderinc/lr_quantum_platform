import Composer from "@/components/composer/Composer";
import { getSession } from "@/lib/auth/session";
import { templateFromQuery } from "@/lib/circuits/templates";
import { fromLrCircuit } from "@/lib/composer/circuit";

export const metadata = {
  title: "Composer | Light Rider Quantum",
};

// Open to everyone: building a circuit, the preview and the QASM need no
// account. Running it asks the visitor to log in (see RunPanel).
// ?template=<id>&angles=... (from a submit popup's "Open in composer") starts
// from that template, with the same Haar angles. Built here so the server and
// client render the same circuit; fixed ids for the same reason.
export default async function ComposerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { isAuthenticated } = await getSession();
  const { template, angles } = await searchParams;
  const fromLink = templateFromQuery(template, angles);
  let id = 0;
  const initialCircuit = fromLink ? fromLrCircuit(fromLink.built.payload, () => `tpl-${id++}`) : undefined;

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-semibold text-gray-700">Composer</h1>
      <p className="mb-8 text-sm text-gray-600">
        Build a circuit, preview its outcomes, and run it on a simulator or a QPU.
      </p>

      <Composer isAuthenticated={isAuthenticated} initialCircuit={initialCircuit} initialTemplateName={fromLink?.template.name} />
    </div>
  );
}
