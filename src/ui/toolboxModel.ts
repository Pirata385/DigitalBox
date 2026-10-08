import { DEFS } from '../catalog/defs';
import type { Category, ComponentDef } from '../catalog/types';

/**
 * Parts shown in the toolbox. A typed search looks across every category.
 * Otherwise the chosen category is shown, or every part for 'all'.
 */
export function visiblePartsFor(category: Category | 'all', search: string): ComponentDef[] {
  const q = search.trim().toLowerCase();
  if (q) {
    return DEFS.filter((d) => `${d.name} ${d.tooltip} ${d.type}`.toLowerCase().includes(q));
  }
  return category === 'all' ? [...DEFS] : DEFS.filter((d) => d.category === category);
}
