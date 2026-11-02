import { useQuery } from '@tanstack/react-query';
import { DataTable } from '../components/DataTable';

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'lastIp', header: 'Last IP' },
  { key: 'plan', header: 'Plan' },
];

export function AdminUsers() {
  const { data } = useQuery({ queryKey: ['admin-users'], queryFn: fetchAdminUsers });
  return (
    <div className="admin-users">
      <h1>All users</h1>
      <DataTable rows={data?.users ?? []} columns={columns} /> {/* @expect third-party mask */}
    </div>
  );
}

export function AuditLog() {
  const { data } = useQuery({ queryKey: ['audit'], queryFn: fetchAudit });
  return (
    <div className="audit-grid">
      {data?.rows.map((line, i) => (
        <div key={i} className="audit-row">
          {line.cells.map((cell, j) => <div key={j} className="audit-cell">{cell}</div>)} {/* @expect third-party mask */}
        </div>
      ))}
    </div>
  );
}
