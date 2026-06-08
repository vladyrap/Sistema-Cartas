/** Mana curve chart con Recharts. Funciona con cmc de Scryfall. */
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

export default function ManaCurve({ data }) {
  // data esperado: [{ cost: '0', count: 4 }, { cost: '1', count: 8 }...]
  if (!data?.length || data.every(d => d.count === 0)) {
    return (
      <div className="text-xs text-slate-500 text-center py-4">
        Cargá cartas con coste para ver la curva
      </div>
    );
  }
  const max = Math.max(...data.map(d => d.count));
  return (
    <div className="w-full h-32">
      <ResponsiveContainer>
        <BarChart data={data} barCategoryGap={4}>
          <XAxis dataKey="cost" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, Math.max(max + 1, 4)]} />
          <Tooltip
            cursor={{ fill: 'rgba(124,58,237,0.08)' }}
            contentStyle={{
              background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(124,58,237,0.4)',
              borderRadius: 6, fontSize: 12,
            }}
            labelStyle={{ color: '#a78bfa', fontWeight: 700 }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.count >= max ? '#a78bfa' : '#7c3aed'} fillOpacity={d.count >= max ? 1 : 0.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
