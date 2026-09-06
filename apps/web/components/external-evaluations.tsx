import Link from "next/link";

import type { ExternalEvaluationRecord, ExternalMeasure } from "@/lib/data";
import { formatDate, formatNative } from "@/lib/format";

const MEASURE_LABEL: Record<ExternalMeasure, string> = {
  score: "Reported score",
  accuracy: "Accuracy",
  hallucination: "Hallucination rate",
  "all-pass": "All-pass",
};

function measureNote(evaluation: ExternalEvaluationRecord): string {
  if (evaluation.measure === "hallucination") return "Lower is better";
  if (evaluation.scoreUnit === "elo") return "Native Elo";
  return evaluation.scoreUnit === "percent" ? "Native percent" : evaluation.scoreUnit;
}

export function ExternalEvaluations({
  evaluations,
}: {
  evaluations: readonly ExternalEvaluationRecord[];
}) {
  if (!evaluations.length) return null;
  const sources = [
    ...new Map(
      evaluations.map((evaluation) => [
        evaluation.methodologyUrl,
        evaluation.methodologyUrl,
      ]),
    ).values(),
  ];
  return (
    <section
      className="content-section"
      aria-labelledby="external-evaluations-heading"
    >
      <div className="section-heading">
        <h2 id="external-evaluations-heading">External evaluations</h2>
        <p>
          Attributed Artificial Analysis measurements in the unit the source
          reported. They are display-only: they do not enter the ACI posterior,
          coverage badges, snapshots, or bulk exports. Missing evaluations are
          omitted rather than inferred.
        </p>
      </div>
      <div className="data-table-wrap">
        <table className="data-table evidence-table">
          <thead>
            <tr>
              <th>Evaluation</th>
              <th>Measure</th>
              <th>Observed</th>
              <th>Config</th>
              <th>Observed on</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((evaluation) => {
              const name = `${evaluation.benchmarkName} · ${evaluation.version}`;
              return (
                <tr
                  key={`${evaluation.benchmarkId}:${evaluation.measure}:${evaluation.configuration}:${evaluation.observedOn}`}
                >
                  <td className="model-cell">
                    {evaluation.internalSlug ? (
                      <Link
                        className="model-link"
                        href={`/benchmarks/${evaluation.internalSlug}`}
                      >
                        {name}
                      </Link>
                    ) : (
                      <a
                        className="model-link"
                        href={evaluation.sourceUrl}
                        rel="noreferrer"
                      >
                        {name}
                      </a>
                    )}
                    <span className="cell-note">
                      {evaluation.scoring ?? "Source scoring as published"}
                      {evaluation.nItems
                        ? ` · ${evaluation.nItems.toLocaleString("en-US")} items`
                        : ""}
                      {evaluation.repeats ? ` · ${evaluation.repeats} repeats` : ""}
                    </span>
                  </td>
                  <td data-label="Measure">
                    {MEASURE_LABEL[evaluation.measure]}
                    <span className="cell-note">{measureNote(evaluation)}</span>
                  </td>
                  <td data-label="Observed">
                    {formatNative(evaluation.score, evaluation.scoreUnit)}
                  </td>
                  <td data-label="Config">
                    {evaluation.configuration}
                    {evaluation.systemId ? (
                      <span className="cell-note">{evaluation.systemId}</span>
                    ) : null}
                  </td>
                  <td data-label="Observed on">
                    {formatDate(evaluation.observedOn)}
                  </td>
                  <td data-label="Source" className="evidence-source">
                    <a
                      className="text-link"
                      href={evaluation.sourceUrl}
                      rel="noreferrer"
                    >
                      Artificial Analysis ↗
                    </a>
                    <span
                      className="badge badge-accent"
                      title="Source forbids redistribution"
                    >
                      Display-only · not redistributable
                    </span>
                    {evaluation.graderVersion ? (
                      <span className="cell-note">{evaluation.graderVersion}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="cell-note">
        Methodology:{" "}
        {sources.map((url, index) => (
          <span key={url}>
            {index ? " · " : null}
            <a className="text-link" href={url} rel="noreferrer">
              {url.replace(/^https:\/\//u, "")}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}
