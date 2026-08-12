// Grouped <select> for budget categories: top-level categories as options,
// their subcategories nested under an optgroup.
export default function CategorySelect({ categories, value, onChange, allowEmpty, emptyLabel, required }) {
  const tops = categories.filter((c) => !c.parent_id);
  return (
    <select value={value} onChange={onChange} required={required}>
      {allowEmpty && <option value="">{emptyLabel || '— None —'}</option>}
      {tops.map((t) => {
        const kids = categories.filter((c) => c.parent_id === t.id);
        if (kids.length === 0) {
          return <option key={t.id} value={t.id}>{t.name}</option>;
        }
        return (
          <optgroup key={t.id} label={t.name}>
            <option value={t.id}>{t.name} (general)</option>
            {kids.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
