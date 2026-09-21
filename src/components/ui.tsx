import type { Vec3 } from "../types";

export function NumberRow({
  label,
  value,
  step = 0.1,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="row">
      <label>{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function Vec3Row({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: Vec3;
  step?: number;
  onChange: (v: Vec3) => void;
}) {
  const set = (i: number, v: number) => {
    const next = [...value] as Vec3;
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="row">
      <label>{label}</label>
      {[0, 1, 2].map((i) => (
        <input
          key={i}
          type="number"
          step={step}
          value={Math.round(value[i] * 100) / 100}
          onChange={(e) => set(i, parseFloat(e.target.value) || 0)}
        />
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <div className="row">
      <label>{label}</label>
      <input
        className="grow"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span style={{ fontSize: 11, color: "var(--muted)", width: 42, textAlign: "right" }}>
        {fmt ? fmt(value) : value}
      </span>
    </div>
  );
}
