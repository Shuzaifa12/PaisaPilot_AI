"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HorizonForecast } from "@/lib/types";

type Props = {
  horizon: HorizonForecast | undefined;
  reserveTarget: string | undefined;
};

export function ForecastChart({ horizon, reserveTarget }: Props) {
  if (!horizon || horizon.daily_balances.length === 0) {
    return (
      <div className="empty-panel">
        No daily balances yet. Run a forecast to plot values returned by the API.
      </div>
    );
  }

  const data = horizon.daily_balances.map((day) => ({
    date: day.date,
    projected_balance: Number(day.projected_balance),
    transaction_ids: day.transaction_ids.join(", ") || "none",
  }));

  const reserve = reserveTarget === undefined ? undefined : Number(reserveTarget);

  return (
    <div className="chart-wrap" role="img" aria-label="Daily projected balances from the forecast API">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#e2e8f0",
            }}
            formatter={(value, name) => {
              if (name === "projected_balance") {
                const match = horizon.daily_balances.find(
                  (day) => Number(day.projected_balance) === value,
                );
                return [match?.projected_balance ?? String(value), "API projected balance"];
              }
              return [String(value), String(name)];
            }}
          />
          <Legend />
          {Number.isFinite(reserve) ? (
            <ReferenceLine
              y={reserve}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{ value: "Reserve target", fill: "#f59e0b", fontSize: 11 }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="projected_balance"
            name="Projected balance (API)"
            stroke="#2dd4bf"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
