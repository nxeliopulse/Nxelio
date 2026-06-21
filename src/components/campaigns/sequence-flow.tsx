import { Fragment } from "react";
import { Mail, Clock, Play, CircleStop, GitBranch } from "lucide-react";

/** Tiny abstract workflow diagram for template gallery cards. */
export function MiniSequencePreview({ steps }: { steps: number }) {
  const nodes = Math.min(Math.max(steps, 1), 3);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      <span className="h-2.5 w-px bg-slate-300" />
      {Array.from({ length: nodes }).map((_, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              <span className="h-2.5 w-px bg-slate-300" />
              <span className="h-3 w-7 rounded-full bg-blue-100" />
              <span className="h-2.5 w-px bg-slate-300" />
            </>
          )}
          <div className="relative">
            <div className="h-6 w-24 rounded-md bg-white border border-slate-200 shadow-sm flex items-center gap-1.5 px-1.5">
              <span className="h-3 w-3 rounded bg-blue-500 flex-shrink-0" />
              <span className="h-1.5 flex-1 rounded bg-slate-200" />
            </div>
            {i === 0 && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 flex items-center">
                <span className="h-px w-4 bg-slate-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              </div>
            )}
          </div>
        </Fragment>
      ))}
      <span className="h-2.5 w-px bg-slate-300" />
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
    </div>
  );
}

export interface FlowStep {
  day: string;
  subject: string;
  body?: string;
  /** "email" (default) or "linkedin" */
  channel?: "email" | "linkedin";
  /** for LinkedIn: "connection_request" | "linkedin_message" */
  action?: "email" | "connection_request" | "linkedin_message";
}

function VLine({ h = "h-5" }: { h?: string }) {
  return <div className={`${h} w-px bg-slate-300`} aria-hidden="true" />;
}

function DelayPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1 border border-blue-100 whitespace-nowrap">
      <Clock className="h-3 w-3" /> {label}
    </span>
  );
}

function EmailNode({ step, index, onClick }: { step: FlowStep; index: number; onClick?: (i: number) => void }) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onPointerDown={clickable ? (e) => e.stopPropagation() : undefined}
      onClick={clickable ? () => onClick!(index) : undefined}
      className={`w-full max-w-sm bg-white rounded-xl border shadow-sm px-4 py-3 transition-all ${
        clickable ? "border-slate-200 hover:border-blue-400 hover:shadow-md cursor-pointer" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Step {index + 1} · Email · {step.day}</p>
          <p className="text-sm font-medium text-slate-900 truncate">{step.subject || "Untitled email"}</p>
        </div>
      </div>
    </div>
  );
}

function Terminator({ label, end }: { label: string; end?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-3 py-1 ${end ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-600"}`}>
      {end ? <CircleStop className="h-3.5 w-3.5" /> : <Play className="h-3 w-3 fill-slate-500 text-slate-500" />} {label}
    </span>
  );
}

/**
 * Branching workflow visualization of an email sequence (Dripify-style, our theme):
 *   Start → opener email → "Did they reply?" split
 *     • Replied  → put on hold (End)
 *     • No reply → delay → email → … → End of sequence
 * Read-only; used in the template preview modal + campaign detail Sequence tab.
 */
export function SequenceFlow({ steps, onStepClick }: { steps: FlowStep[]; onStepClick?: (index: number) => void }) {
  if (steps.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-8">No steps in this sequence yet.</p>;
  }
  const [first, ...rest] = steps;

  return (
    <div
      className="w-full rounded-xl border border-slate-200 p-6 flex flex-col items-center overflow-x-auto"
      style={{ backgroundColor: "#f8fafc", backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)", backgroundSize: "18px 18px" }}
    >
      <Terminator label="Start" />
      <VLine />
      <EmailNode step={first} index={0} onClick={onStepClick} />
      <VLine />

      {/* Condition split */}
      <div className="inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-4 py-2">
        <GitBranch className="h-4 w-4" /> Did the lead reply?
      </div>

      {/* Two branches */}
      <div className="w-full max-w-3xl mt-1 grid grid-cols-2 gap-6 pt-4 border-t border-dashed border-slate-300">
        {/* Replied → stop */}
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-emerald-600 mb-2">Replied</span>
          <Terminator label="Put on hold" end />
        </div>

        {/* No reply → continue */}
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold text-rose-500 mb-2">No reply — continue</span>
          {rest.length === 0 ? (
            <Terminator label="End of sequence" end />
          ) : (
            <>
              {rest.map((s, i) => (
                <Fragment key={i}>
                  <DelayPill label={s.day} />
                  <VLine />
                  <EmailNode step={s} index={i + 1} onClick={onStepClick} />
                  <VLine />
                </Fragment>
              ))}
              <Terminator label="End of sequence" end />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
