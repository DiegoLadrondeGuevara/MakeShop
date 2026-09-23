import { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import { api } from '../../api/api';
import DetailClientView from './DetailClientView';

type Client = {
  id: string;
  username: string;
  email: string;
  phone?: string;
  shopName?: string;
};

type Store = {
  id: string;
  name: string;
  ownerId: string;
  phone?: string;
};

type ClientApiRecord = {
  id?: unknown;
  name?: unknown;
  username?: unknown;
  email?: unknown;
  phoneNumber?: unknown;
  phone?: unknown;
  shopName?: unknown;
  storeName?: unknown;
  shop?: {
    name?: unknown;
  } | null;
  [key: string]: unknown;
};

const isClientApiRecord = (value: unknown): value is ClientApiRecord =>
	typeof value === 'object' && value !== null;

export default function AdminPanel() {
  const [role, setRole] = useState<'owner' | 'admin'>('owner');
  const [userId, setUserId] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [ownerShops, setOwnerShops] = useState<Store[]>([]);
  const [clientPage, setClientPage] = useState(0);
  const [clientTotalPages, setClientTotalPages] = useState(0);
  const clientPageSize = 20;
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedClientsList, setSelectedClientsList] = useState<Client[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    // Try to infer role and id from localStorage 'user' object
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.role === 'admin') setRole('admin');
        else setRole('owner');
        if (u?.id) setUserId(String(u.id));
      }
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    if (role === 'owner') {
      void fetchOwnerShops();
      void fetchOwnerClients(0, selectedShopId !== 'all' ? selectedShopId : undefined);
    }
    else fetchStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userId, selectedShopId]);

  async function fetchOwnerShops() {
    if (!userId) return;
    try {
      const { data } = await api.get(`/owners/${userId}/shops`);
      setOwnerShops(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch owner shops:', error);
    }
  }

  async function fetchOwnerClients(page = 0, shopId?: string) {
    if (!userId) return;
    try {
      const query = shopId ? `&shopId=${encodeURIComponent(shopId)}` : '';
      const { data } = await api.get(`/owners/${userId}/clients?page=${page}&size=${clientPageSize}${query}`);
      const rawPayload = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const payload = rawPayload.filter(isClientApiRecord);
      const normalized: Client[] = payload.map((client: ClientApiRecord) => ({
        id: String(client.id ?? ''),
        username: String(client.username ?? client.name ?? ''),
        email: String(client.email ?? ''),
        phone: String(client.phoneNumber ?? client.phone ?? ''),
        shopName: String(client.shopName ?? client.storeName ?? client.shop?.name ?? ''),
      }));
      setClients(normalized);
      setClientPage(Number(data?.meta?.page ?? page));
      setClientTotalPages(Number(data?.meta?.totalPages ?? (normalized.length > 0 ? 1 : 0)));
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  }

  async function fetchStores() {
    try {
      const { data } = await api.get('/api/admin/stores');
      setStores(data || []);
    } catch (error) {
      console.error('Failed to fetch stores:', error);
    }
  }

  async function onStoreClick(store: Store) {
    // Admin: fetch clients for owner id then show modal with list
    try {
      const { data } = await api.get(`/owners/${store.ownerId}/clients?page=0&size=100`);
      const rawPayload = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const payload = rawPayload.filter(isClientApiRecord);
      const normalized: Client[] = payload.map((client: ClientApiRecord) => ({
        id: String(client.id ?? ''),
        username: String(client.username ?? client.name ?? ''),
        email: String(client.email ?? ''),
        phone: String(client.phoneNumber ?? client.phone ?? ''),
        shopName: String(client.shopName ?? client.storeName ?? client.shop?.name ?? store.name ?? ''),
      }));
      setSelectedClientsList(normalized);
    } catch (error) {
      console.error('Failed to fetch clients for store:', error);
      setSelectedClientsList([]);
    }
    setSelectedClient(null);
    setModalOpen(true);
  }

  function onClientRowClick(c: Client) {
    setSelectedClient(c);
    setSelectedClientsList(null);
    setModalOpen(true);
  }

  function exportToCsv(filename: string, rows: Client[]) {
    if (!rows || !rows.length) return;
    const header = ['username', 'email', 'shopName', 'phone'];
    const csv = [header.join(',')].concat(
      rows.map(r => [r.username, r.email, r.shopName || '', r.phone || '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin Panel</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{role === 'owner' ? 'Clients registered in your stores' : 'All stores in the platform'}</p>
        </div>
        {role === 'owner' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn"
              onClick={() => exportToCsv('clients.csv', clients)}
              disabled={clients.length === 0}
              style={{ opacity: clients.length === 0 ? 0.6 : 1, cursor: clients.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              {clients.length === 0 ? 'No clients to export' : 'Export CSV'}
            </button>
          </div>
        )}
      </div>

      {role === 'owner' ? (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }} htmlFor="shopFilter">
              Filtrar por tienda
            </label>
            <select
              id="shopFilter"
              className="input"
              value={selectedShopId}
              onChange={(event) => {
                const nextShopId = event.target.value;
                setSelectedShopId(nextShopId);
                void fetchOwnerClients(0, nextShopId === 'all' ? undefined : nextShopId);
              }}
              style={{ minWidth: 240 }}
            >
              <option value="all">Todas las tiendas</option>
              {ownerShops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Store</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1.5rem' }}>
                    No hay clientes registrados todavía.
                  </td>
                </tr>
              ) : (
                clients.map(c => (
                  <tr key={c.id} onClick={() => onClientRowClick(c)} style={{ cursor: 'pointer' }}>
                    <td>{c.username}</td>
                    <td>{c.email}</td>
                    <td>{c.shopName || '-'}</td>
                    <td>{c.phone || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', gap: '1rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {clientTotalPages > 0 ? `Page ${clientPage + 1} of ${clientTotalPages}` : 'No clients found'}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn"
                onClick={() => void fetchOwnerClients(clientPage - 1)}
                disabled={clientPage <= 0}
                style={{ opacity: clientPage <= 0 ? 0.6 : 1, cursor: clientPage <= 0 ? 'not-allowed' : 'pointer' }}
              >
                Prev
              </button>
              <button
                className="btn"
                onClick={() => void fetchOwnerClients(clientPage + 1)}
                disabled={clientTotalPages > 0 ? clientPage + 1 >= clientTotalPages : true}
                style={{ opacity: clientTotalPages > 0 && clientPage + 1 < clientTotalPages ? 1 : 0.6, cursor: clientTotalPages > 0 && clientPage + 1 < clientTotalPages ? 'pointer' : 'not-allowed' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={18} /> Stores
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Store Name</th>
                <th>Owner ID</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1.5rem' }}>
                    No hay tiendas registradas todavía.
                  </td>
                </tr>
              ) : (
                stores.map(s => (
                  <tr key={s.id} onClick={() => onStoreClick(s)} style={{ cursor: 'pointer' }}>
                    <td>{s.name}</td>
                    <td>{s.ownerId}</td>
                    <td>{s.phone || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <DetailClientView
        open={modalOpen}
        client={selectedClient}
        clients={selectedClientsList || undefined}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
