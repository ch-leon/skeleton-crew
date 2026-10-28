import type { CombatModifiers } from './combat';

export type WeaponId = 'roundshot' | 'chainshot';
export type CharmId = 'shipwrights-knot' | 'witchglass';
export interface Equipment { weapon: WeaponId; charms: CharmId[] }
export const WEAPONS = {
  roundshot: { name: 'Roundshot', damage: 10, reload: 16, roomMultiplier: 2 },
  chainshot: { name: 'Chainshot', damage: 6, reload: 14, roomMultiplier: 3 },
} as const;
export const CHARMS = {
  'shipwrights-knot': { name: 'Shipwright’s Knot', damageControlMultiplier: 1.20 },
  witchglass: { name: 'Witchglass', wardBonus: 4 },
} as const;
export const BASE_WARD_CAPACITY = 12;
export function defaultEquipment(): Equipment { return { weapon: 'roundshot', charms: [] }; }
// Accept the shared handoff's string slots, while deriving only known charm IDs.
// Always start from base values; neither persisted equipment nor prior snapshots mutate.
export function deriveModifiers(equipment: { weapon: WeaponId; charms: readonly string[] }): CombatModifiers {
  const weapon = WEAPONS[equipment.weapon];
  return {
    weapon: { damage: weapon.damage, reload: weapon.reload, roomMultiplier: weapon.roomMultiplier },
    damageControlMultiplier: equipment.charms.includes('shipwrights-knot') ? CHARMS['shipwrights-knot'].damageControlMultiplier : 1,
    wardCapacity: BASE_WARD_CAPACITY + (equipment.charms.includes('witchglass') ? CHARMS.witchglass.wardBonus : 0),
  };
}
