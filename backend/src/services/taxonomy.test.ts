import { loadTaxonomy, assignableCategoryNames } from './taxonomy';

describe('taxonomy', () => {
  it('loads categories from the external config file', () => {
    const taxonomy = loadTaxonomy();
    expect(taxonomy.categories.length).toBeGreaterThan(0);
    expect(taxonomy.categories.map((c) => c.name)).toContain('Data Correction');
  });

  it('excludes Uncategorized from assignable categories', () => {
    const taxonomy = loadTaxonomy();
    const names = assignableCategoryNames(taxonomy);
    expect(names).not.toContain('Uncategorized');
  });
});
