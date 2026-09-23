import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Package,
  RefreshCw,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  getOwnerCatalogHealth,
  getOwnerProducts,
  getOwnerShopsAnalytics,
  getOwnerSummary,
  getOwnerTrend,
  type CatalogHealth,
  type OwnerSummary,
  type ProductAnalytics,
  type ShopAnalytics,
  type TrendPoint,
} from '../../api/data-analyst-service/analytics-api';
import { getApiErrorMessage } from '../../api/api';
import { getOwnerShops, type Shop } from '../../api/shop-service/shop-api';
import { getCurrentUser, getMe } from '../../api/user-service/user-service';

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const today = new Date();
const defaultFrom = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);

const numberValue = (value: string | number | undefined) => Number(value ?? 0) || 0;
const money = (value: string | number | undefined) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 }).format(numberValue(value));
const percent = (value: number) => `${Math.round(value)}%`;
const getShopId = (shop: Shop) => String(shop.shopId ?? shop.id ?? '');
const getShopName = (shop: Shop) => shop.shopName ?? shop.name ?? 'Tienda';

const emptySummary: OwnerSummary = {
  total_shops: '0', total_products: '0', available_products: '0', out_of_stock_products: '0',
  average_price: '0', total_users: '0', registered_in_period: '0', registered_in_previous_period: '0', total_memberships: '0',
};
const emptyHealth: CatalogHealth = {
  total_shops: '0', total_products: '0', total_users: '0', products_without_price: '0',
  products_without_availability: '0', products_without_shop: '0',
};

function Metric({ icon, label, value, detail, tone = 'primary' }: { icon: ReactNode; label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="card" style={{ padding: '1rem 1.1rem', borderTop: `3px solid var(--${tone}, var(--primary))` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'start' }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, marginTop: '0.25rem' }}>{value}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.2rem' }}>{detail}</div>
        </div>
        <div style={{ color: `var(--${tone}, var(--primary))` }}>{icon}</div>
      </div>
    </div>
  );
}

export default function OwnerAnalyticsPage() {
  const [filters, setFilters] = useState({ from: isoDate(defaultFrom), to: isoDate(today), shopId: '' });
  const [shops, setShops] = useState<Shop[]>([]);
  const [summary, setSummary] = useState<OwnerSummary>(emptySummary);
  const [shopRows, setShopRows] = useState<ShopAnalytics[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [products, setProducts] = useState<ProductAnalytics[]>([]);
  const [health, setHealth] = useState<CatalogHealth>(emptyHealth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadShops = async () => {
    try {
      const profile = await getMe();
      const ownerId = profile.id ?? getCurrentUser()?.uid ?? '';
      setShops(ownerId ? await getOwnerShops(String(ownerId)) : []);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'No se pudieron cargar las tiendas'));
    }
  };

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryResponse, shopsResponse, trendResponse, productsResponse, healthResponse] = await Promise.all([
        getOwnerSummary(filters),
        getOwnerShopsAnalytics(filters),
        getOwnerTrend(filters),
        getOwnerProducts({ shopId: filters.shopId || undefined }),
        getOwnerCatalogHealth({ shopId: filters.shopId || undefined }),
      ]);
      setSummary(summaryResponse.data[0] ?? emptySummary);
      setShopRows(shopsResponse.data);
      setTrend(trendResponse.data);
      setProducts(productsResponse.data);
      setHealth(healthResponse.data[0] ?? emptyHealth);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'No se pudo actualizar la analitica'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadShops(); }, []);
  // The loader reads the current filter values; rerun only when those values change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadAnalytics(); }, [filters.from, filters.to, filters.shopId]);

  const registered = numberValue(summary.registered_in_period);
  const previousRegistered = numberValue(summary.registered_in_previous_period);
  const variation = previousRegistered === 0 ? (registered > 0 ? 100 : 0) : ((registered - previousRegistered) / previousRegistered) * 100;
  const availabilityRate = numberValue(summary.total_products) === 0 ? 0 : (numberValue(summary.available_products) / numberValue(summary.total_products)) * 100;
  const maxTrend = Math.max(...trend.map((row) => numberValue(row.registered_users)), 1);
  const selectedShopName = filters.shopId ? getShopName(shops.find((shop) => getShopId(shop) === filters.shopId) ?? {}) : 'Todas las tiendas';

  const insight = useMemo(() => {
    if (numberValue(summary.total_products) === 0) return 'Aun no hay productos en el catalogo analizado.';
    if (availabilityRate < 70) return 'La disponibilidad es baja: conviene revisar reposicion y productos agotados.';
    if (variation < 0) return 'Las altas de clientes estan por debajo del periodo anterior; revisa captacion y promociones.';
    return 'La operacion muestra una base saludable. Prioriza los productos agotados y las tiendas con menor actividad.';
  }, [summary, availabilityRate, variation]);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Analitica de negocio</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.45rem 0 0' }}>Lectura operativa de {selectedShopName.toLowerCase()} desde Athena.</p>
        </div>
        <button className="btn btn-outline" onClick={() => void loadAnalytics()} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Actualizar
        </button>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', marginBottom: '0.8rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}><CalendarDays size={16} /> Periodo de analisis</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Desde<input className="input-field" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Hasta<input className="input-field" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Tienda<select className="input-field" value={filters.shopId} onChange={(event) => setFilters((current) => ({ ...current, shopId: event.target.value }))}><option value="">Todas mis tiendas</option>{shops.map((shop) => <option key={getShopId(shop)} value={getShopId(shop)}>{getShopName(shop)}</option>)}</select></label>
        </div>
      </div>

      {error && <div className="card" style={{ borderColor: '#ef4444', color: '#ef4444', marginBottom: '1rem', padding: '0.85rem' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.8rem', marginBottom: '1.25rem' }}>
        <Metric icon={<Store size={21} />} label="Tiendas" value={summary.total_shops} detail="Propiedad del owner" />
        <Metric icon={<Package size={21} />} label="Productos" value={summary.total_products} detail={`${summary.available_products} disponibles`} tone="accent" />
        <Metric icon={<Users size={21} />} label="Clientes registrados" value={summary.total_users} detail={`${registered} en el periodo`} tone="info" />
        <Metric icon={<Activity size={21} />} label="Precio promedio" value={money(summary.average_price)} detail={`${percent(availabilityRate)} de disponibilidad`} tone="success" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.65fr)', gap: '1.25rem', alignItems: 'start' }}>
        <section className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
            <div><h2 style={{ margin: 0, fontSize: '1.05rem' }}>Altas de clientes</h2><p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0.35rem 0 1.2rem' }}>Comparacion contra los {summary.registered_in_previous_period} registros del periodo anterior.</p></div>
            <div style={{ color: variation >= 0 ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 700 }}>{variation >= 0 ? <TrendingUp size={17} /> : <TrendingDown size={17} />}{variation.toFixed(0)}%</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.35rem', height: 170, borderBottom: '1px solid var(--border-color)', padding: '0 0.25rem' }}>
            {trend.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No hay registros en este periodo.</div> : trend.map((row) => { const value = numberValue(row.registered_users); return <div key={row.period} title={`${row.period}: ${value}`} style={{ flex: 1, minWidth: 4, height: `${Math.max((value / maxTrend) * 100, 3)}%`, background: 'var(--primary)', opacity: 0.9, borderRadius: '4px 4px 0 0' }} />; })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '0.45rem' }}><span>{trend[0]?.period ?? filters.from}</span><span>{trend[trend.length - 1]?.period ?? filters.to}</span></div>
        </section>

        <section className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.8rem' }}><AlertTriangle size={18} color="#f59e0b" /><h2 style={{ margin: 0, fontSize: '1.05rem' }}>Lectura rapida</h2></div>
          <p style={{ margin: '0 0 1.1rem', lineHeight: 1.55, fontSize: '0.9rem' }}>{insight}</p>
          <div style={{ display: 'grid', gap: '0.6rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Agotados</span><strong>{summary.out_of_stock_products}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Membresias</span><strong>{summary.total_memberships}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Filas sin precio</span><strong>{health.products_without_price}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Filas sin disponibilidad</span><strong>{health.products_without_availability}</strong></div>
          </div>
        </section>
      </div>

      <section className="card" style={{ padding: '1.1rem', marginTop: '1.25rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}><BarChart3 size={18} /><h2 style={{ margin: 0, fontSize: '1.05rem' }}>Rendimiento por tienda</h2></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}><thead><tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{['Tienda', 'Productos', 'Disponibles', 'Clientes', 'Altas periodo', 'Precio medio'].map((head) => <th key={head} style={{ padding: '0.55rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>{head}</th>)}</tr></thead><tbody>{shopRows.map((row) => <tr key={row.shop_id}><td style={{ padding: '0.7rem 0.4rem', fontWeight: 650 }}>{row.shop_name}</td><td style={{ padding: '0.7rem 0.4rem' }}>{row.total_products}</td><td style={{ padding: '0.7rem 0.4rem' }}>{row.available_products}</td><td style={{ padding: '0.7rem 0.4rem' }}>{row.total_users}</td><td style={{ padding: '0.7rem 0.4rem' }}>{row.registered_in_period}</td><td style={{ padding: '0.7rem 0.4rem' }}>{money(row.average_price)}</td></tr>)}</tbody></table>
        {shopRows.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No hay tiendas o datos disponibles para este filtro.</p>}
      </section>

      <section className="card" style={{ padding: '1.1rem', marginTop: '1.25rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}><Package size={18} /><h2 style={{ margin: 0, fontSize: '1.05rem' }}>Productos de mayor precio</h2></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}><thead><tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.75rem' }}><th style={{ padding: '0.55rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>Producto</th><th style={{ padding: '0.55rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>Tienda</th><th style={{ padding: '0.55rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>Precio</th><th style={{ padding: '0.55rem 0.4rem', borderBottom: '1px solid var(--border-color)' }}>Estado</th></tr></thead><tbody>{products.map((product) => <tr key={product.product_id}><td style={{ padding: '0.7rem 0.4rem', fontWeight: 650 }}>{product.product_name}</td><td style={{ padding: '0.7rem 0.4rem' }}>{product.shop_name}</td><td style={{ padding: '0.7rem 0.4rem' }}>{money(product.price)}</td><td style={{ padding: '0.7rem 0.4rem' }}>{product.availability}</td></tr>)}</tbody></table>
        {products.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No hay productos para este filtro.</p>}
      </section>
    </div>
  );
}
