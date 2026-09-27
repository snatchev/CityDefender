import { useState, type ReactNode } from 'react';
import barricadesData from '../data/barricades.json';
import rulesData from '../data/rules.json';
import towersData from '../data/towers.json';
import { selectTool } from '../planning';
import { MgNestIcon, SawhorseIcon } from './icons';
import { usePlan, type BuildTool } from './planStore';
import { useHud } from './store';

interface Item {
  tool: BuildTool;
  name: string;
  cost: number;
  icon: ReactNode;
  /** Barricades only go up during planning. */
  prepOnly: boolean;
  stats: [label: string, value: string][];
}

const mg = towersData.mgNest;
const saw = barricadesData.sawhorse;

/** What the bar offers (Pass 7 adds more towers and barricades from the data tables). */
const ITEMS: Item[] = [
  {
    tool: { kind: 'barricade', type: 'sawhorse' },
    name: saw.name,
    cost: saw.cost,
    icon: <SawhorseIcon />,
    prepOnly: true,
    stats: [
      ['HP', String(saw.hp)],
      ['Detour value', `${Math.round(saw.hp * rulesData.barricadeCostPerHp * 8)} m`],
      ['Placement', 'street, one per block'],
      ['Build', 'prep only'],
    ],
  },
  {
    tool: { kind: 'tower', type: 'mgNest' },
    name: mg.name,
    cost: mg.cost,
    icon: <MgNestIcon />,
    prepOnly: false,
    stats: [
      ['Damage', `${mg.damage} × ${mg.shotsPerS}/s`],
      ['DPS', String(mg.damage * mg.shotsPerS)],
      ['Range', `${mg.rangeM} m, up to ${Math.round(mg.rangeM * mg.rangeMaxMul)} m on high roofs`],
      ['Placement', 'roof pads, street corners'],
      ['Targets', 'first in line'],
    ],
  },
];

const same = (a: BuildTool | null, b: BuildTool) => a?.kind === b.kind && a.type === b.type;

/** Bottom bar: pick what to build; hover an item for its stats. Click the active item to put it down. */
export function BuildBar() {
  const tool = usePlan((p) => p.tool);
  const cash = useHud((s) => s.cash);
  const phase = useHud((s) => s.phase);
  const [hover, setHover] = useState<Item | null>(null);
  const planning = phase === 'prep' || phase === 'idle';

  return (
    <div className="build-bar" role="toolbar" aria-label="Build">
      {hover && (
        <div className="build-card" role="tooltip">
          <div className="build-card-title">
            {hover.name} <span className="build-card-cost">${hover.cost}</span>
          </div>
          <dl>
            {hover.stats.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {ITEMS.map((item) => {
        const active = same(tool, item.tool);
        const unavailable = item.prepOnly && !planning;
        const poor = cash < item.cost;
        return (
          <button
            key={item.name}
            type="button"
            className={`build-item${active ? ' active' : ''}${poor || unavailable ? ' dim' : ''}`}
            aria-pressed={active}
            onClick={() => selectTool(active ? null : item.tool)}
            onMouseEnter={() => setHover(item)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(item)}
            onBlur={() => setHover(null)}
          >
            <span className="build-icon">{item.icon}</span>
            <span className="build-name">{item.name}</span>
            <span className={`build-cost${poor ? ' poor' : ''}`}>${item.cost}</span>
          </button>
        );
      })}
    </div>
  );
}
