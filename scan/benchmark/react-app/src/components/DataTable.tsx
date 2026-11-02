type Column = { key: string; header: string };

export function DataTable({ rows, columns }: { rows: Record<string, string>[]; columns: Column[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>{columns.map((col) => <th key={col.key}>{col.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx}>
            {columns.map((col) => <td key={col.key}>{r[col.key]}</td>)} {/* @expect third-party mask */}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
