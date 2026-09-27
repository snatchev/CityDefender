import { useState, type ReactNode } from 'react';
import rulesData from '../data/rules.json';
import type { TowerDef } from '../data/schema';
import { selectTool } from '../planning';
import { BARRICADES, type BarricadeType } from '../sim/barricades';
import { TILE_M } from '../sim/constants';
import { TOWERS, type TowerType } from '../sim/towers';
import { towerColor } from '../render/Towers';
import { CryoIcon, JerseyIcon, MgNestIcon, MortarIcon, RailgunIcon, SawhorseIcon } from './icons';
import { usePlan, type BuildTool } from './planStore';
import { useHud } from './store';

interface Item {
  tool: BuildTool;
  name: string;
  cost: number;
  icon: ReactNode;
  color: string;
  /** Barricades only go up during planning. */
  prepOnly: boolean;
  stats: [label: string, value: string][];
}

const BARRICADE_ORDER: BarricadeType[] = ['sawhorse', 'jersey'];
const TOWER_ORDER: TowerType[] = ['mgNest', 'mortar', 'cryo', 'railgun'];
const BARRICADE_COLOR = '#f2c14e';
const ICONS: Record<BarricadeType | TowerType, ReactNode> = {
  sawhorse: <SawhorseIcon />,
  jersey: <JerseyIcon />,
  mgNest: <MgNestIcon />,
  mortar: <MortarIcon />,
  cryo: <CryoIcon />,
  railgun: <RailgunIcon />,
};
const TARGETING_LABEL = {
  first: 'first in line',
  last: 'last in line',
  strongest: 'strongest',
  weakest: 'weakest',
  closest: 'closest',
} as const;

function barricadeItem(type: BarricadeType): Item {
  const b = BARRICADES[type];
  const from = (Object.keys(BARRICADES) as BarricadeType[]).find(
    (k) => BARRICADES[k].upgradeTo === type,
  );
  const stats: Item['stats'] = [
    ['HP', String(b.hp)],
    ['Detour value', `${Math.round(b.hp * rulesData.barricadeCostPerHp * TILE_M)} m`],
    ['Placement', 'street, one per block'],
  ];
  if (from) {
    stats.push([`From a ${BARRICADES[from].name}`, `$${b.cost - BARRICADES[from].cost}`]);
  }
  stats.push(['Build', 'prep only']);
  return {
    tool: { kind: 'barricade', type },
    name: b.name,
    cost: b.cost,
    icon: ICONS[type],
    color: BARRICADE_COLOR,
    prepOnly: true,
    stats,
  };
}

function towerItem(type: TowerType): Item {
  const d: TowerDef = TOWERS[type];
  const t = d.tiers[0]!;
  const stats: Item['stats'] = [['Role', d.role]];
  switch (d.damageType) {
    case 'explosive':
      stats.push(['Damage', `${t.damage} explosive, ${t.splashM} m splash`]);
      stats.push(['Fire rate', `1 shell / ${round(1 / t.shotsPerS)} s`]);
      break;
    case 'cryo':
      stats.push(['Slow', `to ${Math.round(t.slowMul! * 100)}% speed for ${t.slowS} s`]);
      stats.push(['Spray', `${t.coneDeg}° cone, ${t.shotsPerS}/s`]);
      break;
    case 'pierce':
      stats.push(['Damage', `${t.damage}, ignores armor`]);
      stats.push(['Fire rate', `1 shot / ${round(1 / t.shotsPerS)} s`]);
      break;
    default:
      stats.push([
        'Damage',
        `${t.damage} × ${t.shotsPerS}/s (DPS ${round(t.damage * t.shotsPerS)})`,
      ]);
  }
  const maxRange = Math.round(t.rangeM * d.rangeMaxMul);
  let range =
    maxRange > t.rangeM ? `${t.rangeM} m, up to ${maxRange} m on high roofs` : `${t.rangeM} m`;
  if (t.minRangeM) range += `, min ${t.minRangeM} m`;
  stats.push(['Range', range]);
  stats.push([
    'Placement',
    d.slots.map((s) => (s === 'pad' ? 'roof pads' : 'street corners')).join(', '),
  ]);
  stats.push(['Targets', TARGETING_LABEL[d.targeting]]);
  const next = d.tiers[1];
  if (next) stats.push(['Upgrade', `$${next.cost}`]);
  return {
    tool: { kind: 'tower', type },
    name: d.name,
    cost: t.cost,
    icon: ICONS[type],
    color: towerColor(type),
    prepOnly: false,
    stats,
  };
}

const round = (x: number) => Math.round(x * 10) / 10;

const ITEMS: Item[] = [...BARRICADE_ORDER.map(barricadeItem), ...TOWER_ORDER.map(towerItem)];

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
      {ITEMS.map((item, k) => {
        const active = same(tool, item.tool);
        const unavailable = item.prepOnly && !planning;
        const poor = cash < item.cost;
        const firstTower = k === BARRICADE_ORDER.length;
        return (
          <button
            key={item.name}
            type="button"
            className={`build-item${active ? ' active' : ''}${poor || unavailable ? ' dim' : ''}${firstTower ? ' group-start' : ''}`}
            aria-pressed={active}
            onClick={() => selectTool(active ? null : item.tool)}
            onMouseEnter={() => setHover(item)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(item)}
            onBlur={() => setHover(null)}
          >
            <span className="build-icon" style={{ color: item.color }}>
              {item.icon}
            </span>
            <span className="build-name">{item.name}</span>
            <span className={`build-cost${poor ? ' poor' : ''}`}>${item.cost}</span>
          </button>
        );
      })}
    </div>
  );
}
