import AlertVariantsPreview from "@/components/tailgrids/core/alert-variants-preview";

export default function AlertTestPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0f141b] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Alert styles</h1>
        <p className="mt-1 mb-7 text-sm text-slate-500 dark:text-slate-400">
          The five inline alert statuses, shown with real Nxelio messages.
        </p>
        <AlertVariantsPreview />
      </div>
    </main>
  );
}
