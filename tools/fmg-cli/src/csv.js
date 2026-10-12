// Attribute table of a FeatureCollection as CSV; point layers also get their coordinates
const escape = value => {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(collection) {
  const rows = collection.features.map(f => {
    const extra = f.geometry?.type === "Point" ? { x: f.geometry.coordinates[0], y: f.geometry.coordinates[1] } : {};
    return { ...f.properties, ...extra };
  });
  const columns = [...new Set(rows.flatMap(Object.keys))];
  return [columns.join(","), ...rows.map(row => columns.map(c => escape(row[c])).join(","))].join("\n") + "\n";
}
