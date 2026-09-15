import fs from 'fs';
import path from 'path';

export interface TaxonomyCategory {
  name: string;
  definition: string;
  examples: string[];
}

export interface Taxonomy {
  confidenceThreshold: 'high' | 'medium' | 'low';
  categories: TaxonomyCategory[];
}

const TAXONOMY_PATH = path.join(__dirname, '..', 'config', 'taxonomy.json');

let cached: Taxonomy | null = null;

/** Loads the taxonomy from config/taxonomy.json (BR-05: editable without code changes). */
export function loadTaxonomy(): Taxonomy {
  if (cached) return cached;
  const raw = fs.readFileSync(TAXONOMY_PATH, 'utf-8');
  cached = JSON.parse(raw) as Taxonomy;
  return cached;
}

/** Category names a classifier is allowed to directly assign (excludes the system fallback). */
export function assignableCategoryNames(taxonomy: Taxonomy): string[] {
  return taxonomy.categories.filter((c) => c.name !== 'Uncategorized').map((c) => c.name);
}
