"use client";

import { useId, useSyncExternalStore } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear, scaleLog, scaleTime } from "@visx/scale";
import { Bar, Circle, LinePath } from "@visx/shape";
import { Hint } from "@/components/ui/hint";
import { TextureButton } from "@/components/ui/texture-button";
import { paretoFrontier } from "@/lib/charts/pareto";
import { orgColor } from "@/lib/charts/org-color";

export interface ChartPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  group?: string;
  date?: string | undefined;
  low?: number | null;
  high?: number | null;
  highlighted?: boolean;
  provisional?: boolean;
  striped?: boolean;
  outlier?: boolean;
}

const margin = { top: 16, right: 24, bottom: 38, left: 50 };
const ink = "var(--color-ink)";
const muted = "var(--color-muted)";
const rule = "var(--color-rule)";
const accent = "var(--color-accent)";
const subscribeMounted = () => () => undefined;
const useMounted = () =>
  useSyncExternalStore(
    subscribeMounted,
    () => true,
    () => false,
  );

function Placeholder({
  title,
  tall = false,
}: {
  title: string;
  tall?: boolean;
}) {
  return (
    <figure className="chart-figure">
      <figcaption>
        <strong>{title}</strong>
      </figcaption>
      <div className={`chart-frame ${tall ? "chart-tall" : ""}`} />
    </figure>
  );
}

function EmptyChart({
  title,
  message = "No published values for the current selection.",
}: {
  title: string;
  message?: string;
}) {
  return (
    <figure className="chart-figure chart-empty">
      <figcaption>
        <strong>{title}</strong>
      </figcaption>
      <div className="chart-empty-message" role="status">
        <strong>No data to plot</strong>
        <span>{message}</span>
      </div>
    </figure>
  );
}

function HiddenTable({
  title,
  points,
  xLabel = "X",
  yLabel = "Value",
}: {
  title: string;
  points: ChartPoint[];
  xLabel?: string;
  yLabel?: string;
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{title} data</caption>
        <thead>
          <tr>
            <th>Model</th>
            <th>{xLabel}</th>
            <th>{yLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.id}>
              <td>{point.label}</td>
              <td>{point.date ?? point.x}</td>
              <td>{point.y}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportButton() {
  return (
    <TextureButton
      variant="secondary"
      size="sm"
      type="button"
      className="chart-export"
      onClick={(event) => {
        const svg = event.currentTarget.closest("figure")?.querySelector("svg");
        if (!svg) return;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, svg.clientWidth * 2);
        canvas.height = Math.max(1, svg.clientHeight * 2);
        const context = canvas.getContext("2d");
        if (!context) return;
        const image = new Image();
        image.onload = () => {
          context.scale(2, 2);
          context.drawImage(image, 0, 0);
          const link = document.createElement("a");
          link.download = "actualanalysis-chart.png";
          link.href = canvas.toDataURL("image/png");
          link.click();
        };
        const clone = svg.cloneNode(true) as SVGSVGElement;
        const originals = [svg, ...svg.querySelectorAll("*")];
        const copies = [clone, ...clone.querySelectorAll("*")];
        originals.forEach((element, index) => {
          const style = getComputedStyle(element);
          for (const property of [
            "fill",
            "stroke",
            "stroke-width",
            "font-family",
            "font-size",
            "opacity",
            "visibility",
          ]) {
            (copies[index] as SVGElement).style.setProperty(
              property,
              style.getPropertyValue(property),
            );
          }
        });
        clone.style.background = getComputedStyle(
          document.documentElement,
        ).getPropertyValue("--color-paper");
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
      }}
    >
      Export PNG
    </TextureButton>
  );
}

export function RankedBars({
  title,
  points,
  onSelect,
}: {
  title: string;
  points: ChartPoint[];
  onSelect?: (id: string) => void;
}) {
  const patternId = useId().replaceAll(":", "");
  if (!useMounted()) return <Placeholder title={title} tall />;
  const shown = [...points]
    .filter((point) => Number.isFinite(point.y))
    .sort((a, b) => b.y - a.y || a.label.localeCompare(b.label));
  if (!shown.length) return <EmptyChart title={title} />;
  const chartHeight = shown.length * 28 + margin.top + margin.bottom;
  const hasHighlight = shown.some((point) => point.highlighted);
  return (
    <figure className="chart-figure">
      <figcaption>
        <strong>{title}</strong>
        <span>
          {shown.length} models · ordered by value
          {shown.some((point) => point.low != null)
            ? "; whiskers show intervals"
            : ""}
          .
        </span>
        <ExportButton />
      </figcaption>
      <div
        className="ranked-chart-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${title} ranking`}
      >
        <div className="chart-frame" style={{ blockSize: chartHeight }}>
          <ParentSize initialSize={{ width: 640, height: chartHeight }}>
            {({ width, height }) => {
              if (!shown.length)
                return (
                  <svg
                    width={width}
                    height={height}
                    aria-label={`${title}: no data`}
                  />
                );
              const minimum = Math.min(
                ...shown.flatMap((point) => [point.low ?? point.y, point.y]),
              );
              const maximum = Math.max(
                ...shown.flatMap((point) => [point.high ?? point.y, point.y]),
              );
              const baseline = Math.min(0, minimum);
              const x = scaleLinear({
                domain: [
                  baseline,
                  maximum + Math.max(1, (maximum - minimum) * 0.12),
                ],
                range: [Math.min(150, width * 0.43), width - margin.right - 36],
                nice: true,
              });
              const y = scaleBand({
                domain: shown.map((point) => point.id),
                range: [margin.top, height - margin.bottom],
                padding: 0.25,
              });
              return (
                <svg
                  width={width}
                  height={height}
                  role="img"
                  aria-label={title}
                >
                  <defs>
                    <pattern
                      id={`${patternId}-provisional`}
                      width="6"
                      height="6"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <rect width="3" height="6" fill={accent} />
                    </pattern>
                    <pattern
                      id={`${patternId}-source`}
                      width="8"
                      height="8"
                      patternUnits="userSpaceOnUse"
                    >
                      <rect width="5" height="8" fill={accent} />
                    </pattern>
                  </defs>
                  {shown.map((point) => {
                    const center = (y(point.id) ?? 0) + y.bandwidth() / 2;
                    return (
                      <Hint
                        key={point.id}
                        text={`${point.label}: ${point.y.toFixed(1)}${point.low != null && point.high != null ? ` · 90% interval ${point.low.toFixed(1)}–${point.high.toFixed(1)}` : ""}`}
                      >
                        <g
                          className="chart-point"
                          aria-label={point.label}
                          role="button"
                          tabIndex={0}
                          opacity={
                            hasHighlight && !point.highlighted ? 0.28 : 1
                          }
                          onClick={() => onSelect?.(point.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelect?.(point.id);
                            }
                          }}
                        >
                          <text
                            x={Math.min(150, width * 0.43) - 6}
                            y={center + 4}
                            textAnchor="end"
                            fill={point.highlighted ? ink : muted}
                            fontSize="11"
                          >
                            {point.label.slice(0, 20)}
                          </text>
                          <Bar
                            x={x(baseline)}
                            y={y(point.id)}
                            width={Math.max(1, x(point.y) - x(baseline))}
                            height={y.bandwidth()}
                            fill={
                              point.provisional
                                ? `url(#${patternId}-provisional)`
                                : point.striped
                                  ? `url(#${patternId}-source)`
                                  : orgColor(point.group)
                            }
                          />
                          {point.low != null && point.high != null ? (
                            <g stroke={ink}>
                              <line
                                x1={x(point.low)}
                                x2={x(point.high)}
                                y1={center}
                                y2={center}
                              />
                              <line
                                x1={x(point.low)}
                                x2={x(point.low)}
                                y1={center - 4}
                                y2={center + 4}
                              />
                              <line
                                x1={x(point.high)}
                                x2={x(point.high)}
                                y1={center - 4}
                                y2={center + 4}
                              />
                            </g>
                          ) : null}
                          <text
                            x={width - 4}
                            y={center + 4}
                            textAnchor="end"
                            fill={ink}
                            fontSize="11"
                          >
                            {point.y.toFixed(1)}
                          </text>
                          <title>
                            {point.label}: {point.y.toFixed(1)}
                            {point.low != null && point.high != null
                              ? ` (${point.low.toFixed(1)}–${point.high.toFixed(1)})`
                              : ""}
                          </title>
                        </g>
                      </Hint>
                    );
                  })}
                </svg>
              );
            }}
          </ParentSize>
        </div>
      </div>
      <HiddenTable title={title} points={shown} xLabel="Order" />
    </figure>
  );
}

export function IndexScatter({
  title,
  points,
  logX = false,
  showPareto = false,
  showIdentity = false,
  xLabel = "Price · $/M",
  yLabel = "Index",
  onSelect,
}: {
  title: string;
  points: ChartPoint[];
  logX?: boolean;
  showPareto?: boolean;
  showIdentity?: boolean;
  xLabel?: string;
  yLabel?: string;
  onSelect?: (id: string) => void;
}) {
  if (!useMounted()) return <Placeholder title={title} />;
  const clean = points.filter(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      (!logX || point.x > 0),
  );
  if (!clean.length) return <EmptyChart title={title} />;
  const frontier = paretoFrontier(clean);
  const hasHighlight = clean.some((point) => point.highlighted);
  return (
    <figure className="chart-figure">
      <figcaption>
        <strong>{title}</strong>
        <span>
          {showPareto
            ? "Line marks the cost/capability frontier."
            : showIdentity
              ? "Dashed line: observed equals expected. Hover a point for details."
              : "Hover or focus a point for model details."}
        </span>
        <ExportButton />
      </figcaption>
      <div className="chart-frame">
        <ParentSize initialSize={{ width: 640, height: 288 }}>
          {({ width, height }) => {
            if (!clean.length)
              return (
                <svg
                  width={width}
                  height={height}
                  aria-label={`${title}: no data`}
                />
              );
            const xs = clean.map((point) => point.x);
            const ys = clean.map((point) => point.y);
            const commonMin = Math.min(...xs, ...ys) - 2;
            const commonMax = Math.max(...xs, ...ys) + 2;
            const x = logX
              ? scaleLog({
                  domain: [
                    Math.max(0.001, Math.min(...xs) * 0.8),
                    Math.max(...xs) * 1.2,
                  ],
                  range: [margin.left, width - margin.right],
                })
              : scaleLinear({
                  domain: showIdentity
                    ? [commonMin, commonMax]
                    : [
                        Math.min(...xs) -
                          Math.max(
                            1,
                            (Math.max(...xs) - Math.min(...xs)) * 0.04,
                          ),
                        Math.max(...xs) +
                          Math.max(
                            1,
                            (Math.max(...xs) - Math.min(...xs)) * 0.04,
                          ),
                      ],
                  range: [margin.left, width - margin.right],
                  nice: true,
                });
            const y = scaleLinear({
              domain: showIdentity
                ? [commonMin, commonMax]
                : [Math.min(...ys) - 2, Math.max(...ys) + 2],
              range: [height - margin.bottom, margin.top],
              nice: true,
            });
            const xDomain = x.domain();
            const logTicks = logX
              ? Array.from(
                  {
                    length: Math.max(
                      0,
                      Math.floor(Math.log10(xDomain[1]!)) -
                        Math.ceil(Math.log10(xDomain[0]!)) +
                        1,
                    ),
                  },
                  (_, i) => 10 ** (Math.ceil(Math.log10(xDomain[0]!)) + i),
                )
              : undefined;
            const tickValues =
              logTicks && logTicks.length < 2 ? xDomain : logTicks;
            const identityMinimum = Math.max(Math.min(...xs), Math.min(...ys));
            const identityMaximum = Math.min(Math.max(...xs), Math.max(...ys));
            return (
              <svg width={width} height={height} role="img" aria-label={title}>
                <rect
                  x={margin.left}
                  y={margin.top}
                  width={Math.max(0, width - margin.left - margin.right)}
                  height={Math.max(0, height - margin.top - margin.bottom)}
                  fill="var(--color-paper-2)"
                  opacity=".35"
                />
                <GridRows
                  scale={y}
                  width={width - margin.left - margin.right}
                  left={margin.left}
                  stroke={rule}
                />
                <AxisLeft
                  scale={y}
                  left={margin.left}
                  stroke={rule}
                  tickStroke={rule}
                  tickLabelProps={() => ({
                    fill: muted,
                    fontSize: 10,
                    textAnchor: "end",
                    dx: -4,
                    dy: 3,
                  })}
                />
                <AxisBottom
                  scale={x}
                  numTicks={width < 480 ? 4 : 6}
                  tickValues={tickValues ?? x.ticks(width < 480 ? 4 : 6)}
                  tickFormat={(value) =>
                    Number(value).toLocaleString("en-US", {
                      maximumSignificantDigits: 3,
                    })
                  }
                  top={height - margin.bottom}
                  stroke={rule}
                  tickStroke={rule}
                  tickLabelProps={() => ({
                    fill: muted,
                    fontSize: 10,
                    textAnchor: "middle",
                    dy: 4,
                  })}
                />
                {showPareto && frontier.length > 1 ? (
                  <LinePath
                    data={frontier}
                    x={(point) => x(point.x)}
                    y={(point) => y(point.y)}
                    stroke={ink}
                    strokeWidth={1.5}
                  />
                ) : null}
                {showIdentity && identityMaximum > identityMinimum ? (
                  <line
                    x1={x(identityMinimum)}
                    y1={y(identityMinimum)}
                    x2={x(identityMaximum)}
                    y2={y(identityMaximum)}
                    stroke={muted}
                    strokeDasharray="4 4"
                  />
                ) : null}
                {[...clean]
                  .sort(
                    (a, b) =>
                      Number(a.highlighted ?? false) -
                      Number(b.highlighted ?? false),
                  )
                  .map((point) => {
                    const nearby = clean.filter(
                      (other) =>
                        other.id !== point.id &&
                        Math.hypot(
                          x(other.x) - x(point.x),
                          y(other.y) - y(point.y),
                        ) < 9,
                    );
                    const nearbyLabel = nearby.length
                      ? `\nNearby: ${nearby
                          .slice(0, 4)
                          .map((item) => item.label)
                          .join(
                            ", ",
                          )}${nearby.length > 4 ? ` +${nearby.length - 4} more` : ""}. Use model highlighting to isolate a point.`
                      : "";
                    return (
                      <g
                        key={point.id}
                        className="chart-point"
                        aria-label={point.label}
                        opacity={hasHighlight && !point.highlighted ? 0.22 : 1}
                      >
                        <g className="chart-crosshair" aria-hidden="true">
                          <line
                            x1={margin.left}
                            x2={width - margin.right}
                            y1={y(point.y)}
                            y2={y(point.y)}
                            stroke={muted}
                            strokeDasharray="3 4"
                          />
                          <line
                            x1={x(point.x)}
                            x2={x(point.x)}
                            y1={margin.top}
                            y2={height - margin.bottom}
                            stroke={muted}
                            strokeDasharray="3 4"
                          />
                        </g>
                        <Hint
                          text={`${point.label}${point.provisional ? " · preliminary estimate" : ""}${point.group ? ` · ${point.group}` : ""}\n${xLabel}: ${point.x.toLocaleString("en-US", { maximumSignificantDigits: 4 })} · ${yLabel}: ${point.y.toFixed(1)}${point.low != null && point.high != null ? `\n90% interval ${point.low.toFixed(1)}–${point.high.toFixed(1)}` : ""}${nearbyLabel}`}
                        >
                          <circle
                            role="button"
                            tabIndex={0}
                            aria-label={point.label}
                            cx={x(point.x)}
                            cy={y(point.y)}
                            r={point.highlighted ? 5 : 3.5}
                            fill={
                              point.provisional
                                ? "var(--color-paper)"
                                : orgColor(point.group)
                            }
                            stroke={
                              point.outlier
                                ? ink
                                : point.provisional
                                  ? orgColor(point.group)
                                  : "none"
                            }
                            strokeWidth={
                              point.outlier ? 2 : point.provisional ? 1.5 : 0
                            }
                            onClick={() => onSelect?.(point.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelect?.(point.id);
                              }
                            }}
                          />
                        </Hint>
                      </g>
                    );
                  })}
              </svg>
            );
          }}
        </ParentSize>
      </div>
      <div className="chart-axis-key">
        <span>← {yLabel}</span>
        <span>{xLabel} →</span>
      </div>
      <HiddenTable
        title={title}
        points={clean}
        xLabel={xLabel}
        yLabel={yLabel}
      />
    </figure>
  );
}

export function Timeline({
  title,
  points,
}: {
  title: string;
  points: ChartPoint[];
}) {
  if (!useMounted()) return <Placeholder title={title} />;
  const dated = points.filter((point): point is ChartPoint & { date: string } =>
    Boolean(point.date && Number.isFinite(Date.parse(point.date))),
  );
  if (!dated.length)
    return (
      <EmptyChart
        title={title}
        message="No dated point scores have been published for this selection."
      />
    );
  const ordered = [...dated].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  );
  const frontier = ordered.reduce<Array<ChartPoint & { date: string }>>(
    (accumulator, point) => {
      const previous = accumulator.at(-1)?.y ?? Number.NEGATIVE_INFINITY;
      return [...accumulator, { ...point, y: Math.max(previous, point.y) }];
    },
    [],
  );
  return (
    <figure className="chart-figure">
      <figcaption>
        <strong>{title}</strong>
        <span>Release date and running frontier.</span>
        <ExportButton />
      </figcaption>
      <div className="chart-frame">
        <ParentSize initialSize={{ width: 640, height: 288 }}>
          {({ width, height }) => {
            if (!dated.length)
              return (
                <svg
                  width={width}
                  height={height}
                  aria-label={`${title}: no data`}
                />
              );
            const dates = dated.map((point) => new Date(point.date));
            const x = scaleTime({
              domain: [
                new Date(Math.min(...dates.map(Number))),
                new Date(Math.max(...dates.map(Number))),
              ],
              range: [margin.left, width - margin.right],
            });
            const y = scaleLinear({
              domain: [
                Math.min(...dated.map((point) => point.y)) - 2,
                Math.max(...dated.map((point) => point.y)) + 2,
              ],
              range: [height - margin.bottom, margin.top],
              nice: true,
            });
            return (
              <svg width={width} height={height} role="img" aria-label={title}>
                <GridRows
                  scale={y}
                  width={width - margin.left - margin.right}
                  left={margin.left}
                  stroke={rule}
                />
                <AxisLeft
                  scale={y}
                  left={margin.left}
                  tickLabelProps={() => ({
                    fill: muted,
                    fontSize: 10,
                    textAnchor: "end",
                    dx: -4,
                    dy: 3,
                  })}
                />
                <AxisBottom
                  scale={x}
                  top={height - margin.bottom}
                  numTicks={4}
                  tickFormat={(value) =>
                    new Intl.DateTimeFormat("en", {
                      month: "short",
                      year: "2-digit",
                      timeZone: "UTC",
                    }).format(value as Date)
                  }
                  tickLabelProps={() => ({
                    fill: muted,
                    fontSize: 10,
                    textAnchor: "middle",
                    dy: 4,
                  })}
                />
                <LinePath
                  data={frontier}
                  x={(point) => x(new Date(point.date))}
                  y={(point) => y(point.y)}
                  stroke={ink}
                  strokeWidth={1.5}
                />
                {dated.map((point) => (
                  <Hint
                    key={point.id}
                    text={`${point.label} · ${point.date} · Index ${point.y.toFixed(1)}`}
                  >
                    <g
                      className="chart-point"
                      tabIndex={0}
                      aria-label={point.label}
                    >
                      <Circle
                        cx={x(new Date(point.date))}
                        cy={y(point.y)}
                        r={point.highlighted ? 5 : 3.5}
                        fill={orgColor(point.group)}
                      />
                    </g>
                  </Hint>
                ))}
              </svg>
            );
          }}
        </ParentSize>
      </div>
      <HiddenTable title={title} points={dated} xLabel="Release date" />
    </figure>
  );
}

export function ResidualPlot({
  title,
  points,
}: {
  title: string;
  points: ChartPoint[];
}) {
  return (
    <IndexScatter
      title={title}
      points={points}
      showIdentity
      xLabel="Observed"
      yLabel="Expected"
    />
  );
}

export function MiniBar({
  value,
  max = 1,
  label,
}: {
  value: number | null;
  max?: number;
  label: string;
}) {
  const width =
    value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="mini-bar" title={`${label}: ${value ?? "unavailable"}`}>
      <span style={{ inlineSize: `${width}%` }} />
    </span>
  );
}

export function CiBar({
  value,
  low,
  high,
}: {
  value: number | null;
  low: number | null;
  high: number | null;
}) {
  const midpoint =
    value ?? (low !== null && high !== null ? (low + high) / 2 : 0);
  const left = low ?? midpoint;
  const right = high ?? midpoint;
  const spread = Math.max(1, right - left);
  return (
    <span
      className={`ci-bar${value === null ? " is-range-only" : ""}`}
      aria-label={`${value === null ? "Range" : "Estimate"} ${left.toFixed(1)} to ${right.toFixed(1)}`}
    >
      <span
        style={{
          insetInlineStart: `${Math.max(0, 50 - spread * 4)}%`,
          inlineSize: `${Math.min(100, spread * 8)}%`,
        }}
      />
      {value === null ? null : <i style={{ insetInlineStart: "50%" }} />}
    </span>
  );
}

export function BenchmarkHeatmap({
  models,
  benchmarks,
  values,
}: {
  models: string[];
  benchmarks: string[];
  values: Record<string, number>;
}) {
  return (
    <div className="heatmap-wrap">
      <table className="heatmap">
        <thead>
          <tr>
            <th>Model</th>
            {benchmarks.map((benchmark) => (
              <th key={benchmark}>{benchmark}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model}>
              <th>{model}</th>
              {benchmarks.map((benchmark) => {
                const value = values[`${model}\0${benchmark}`] ?? Number.NaN;
                return (
                  <td
                    key={benchmark}
                    style={
                      {
                        "--heat": Number.isFinite(value)
                          ? Math.max(0.08, Math.min(1, value))
                          : 0,
                      } as React.CSSProperties
                    }
                  >
                    {Number.isFinite(value)
                      ? `${Math.round(value * 100)}`
                      : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
