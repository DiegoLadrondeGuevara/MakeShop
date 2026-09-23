import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Package, Plus, Edit2, Store, ArrowLeft, ChevronRight, Trash2, X, Palette, ExternalLink, Check, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getShops, getOwnerShops, createShop } from '../../api/shop-service/shop-api';
import type { Shop, ThemeColors } from '../../api/shop-service/shop-api';
import { getProductsByShop, createProduct, updateProduct, deleteProduct } from '../../api/product-service/product-api';
import type { Product } from '../../api/product-service/product-api';
import { getCurrentUser, getMe } from '../../api/user-service/user-service';
import { deleteShop } from '../../api/shop-service/shop-api';
import ThemePanel from './ThemePanel';

/* ── Theme defaults ── */
const THEME_DEFAULTS: Record<string, {
  description: ReactNode; label: string; defaultColors: ThemeColors; accent: string 
}> = {
  dev: {
    label: 'Dev', accent: '#39ff14', defaultColors: { primaryColor: '#39ff14', bgColor: '#0d1117', textColor: '#c9d1d9', accentColor: '#58a6ff' },
    description: ''
  },
  enterprise: {
    label: 'Enterprise', accent: '#0057b8', defaultColors: { primaryColor: '#0057b8', bgColor: '#f8f9fb', textColor: '#1a2332', accentColor: '#0ea5e9' },
    description: ''
  },
  ghetto: {
    label: 'Ghetto', accent: '#ff3b3b', defaultColors: { primaryColor: '#ff3b3b', bgColor: '#111111', textColor: '#ffffff', accentColor: '#ffcc00' },
    description: ''
  },
};

interface ColorFieldProps { label: string; value: string; onChange: (v: string) => void; }
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 32, height: 32, border: '2px solid var(--border-color)', borderRadius: 6, padding: 2, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.1rem' }}>{label}</div>
        <input type="text" className="input-field" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem', fontFamily: 'monospace', height: 'auto' }} />
      </div>
    </div>
  );
}

type BillingPlan = 'FREE' | 'PRO' | 'MAX';

const shopLimits: Record<BillingPlan, number> = {
  FREE: 1,
  PRO: 5,
  MAX: Number.POSITIVE_INFINITY,
};

const formatShopLimit = (limit: number): string =>
  limit === Number.POSITIVE_INFINITY ? 'Unlimited' : String(limit);

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
const getShopId = (shop: Shop): string =>
  String(shop.shopId ?? shop.id ?? '');

const getShopName = (shop: Shop): string =>
  shop.shopName ?? shop.name ?? 'Unnamed Store';

const getInitials = (name: string): string =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/* Deterministic gradient from name */
const getBannerGradient = (name: string): string => {
  const gradients = [
    'linear-gradient(135deg, #d29431 0%, #5ccb9f 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
};

/* ─────────────────────────────────────────
   Sub-components
───────────────────────────────────────── */

interface ShopCardProps {
  shop: Shop;
  onClick: (shop: Shop) => void;
}

function ShopCard({ shop, onClick }: ShopCardProps) {
  const name = getShopName(shop);
  const initials = getInitials(name);
  const gradient = getBannerGradient(name);

  return (
    <div
      className="card"
      onClick={() => onClick(shop)}
      style={{
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        border: '1px solid var(--border-color)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-lg)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      }}
    >
      {/* Pseudo-banner */}
      <div
        style={{
          background: gradient,
          height: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: 'rgba(255,255,255,0.95)',
            letterSpacing: '0.05em',
            textShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {initials}
        </span>
      </div>

      {/* Card body */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{name}</h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Tap to manage
          </p>
        </div>
        <ChevronRight size={20} style={{ color: 'var(--text-secondary)' }} />
      </div>
    </div>
  );
}

interface StoreActionCardProps {
  canCreateShop: boolean;
  shopCount: number;
  shopLimit: number;
  onStartCreate: () => void;
  onUpgrade: () => void;
}

function StoreActionCard({ canCreateShop, shopCount, shopLimit, onStartCreate, onUpgrade }: StoreActionCardProps) {
  if (!canCreateShop) {
    return (
      <div className="card" style={{ minHeight: '280px', border: '1px dashed var(--border-color)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: '1rem' }}>
        <Store size={44} color="var(--primary)" />
        <div>
          <h3 style={{ margin: 0 }}>Límite alcanzado</h3>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', maxWidth: '260px' }}>
            Tu plan permite {formatShopLimit(shopLimit)} tienda{shopLimit === 1 ? '' : 's'}. Tienes {shopCount}.
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={onUpgrade}>Mejorar plan</button>
      </div>
    );
  }
  return (
    <div className="card" onClick={onStartCreate}
      style={{ minHeight: '280px', border: '1px dashed var(--border-color)', background: 'linear-gradient(180deg, rgba(92,203,159,0.12) 0%, rgba(255,255,255,0.02) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: '1rem', cursor: 'pointer' }}>
      <div style={{ width: '64px', height: '64px', borderRadius: '18px', display: 'grid', placeItems: 'center', background: 'var(--primary)', color: '#000', boxShadow: '0 18px 32px rgba(0,0,0,0.18)' }}>
        <Plus size={30} />
      </div>
      <div>
        <h3 style={{ margin: 0 }}>Crear Nueva Tienda</h3>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', maxWidth: '260px' }}>Abre otra tienda desde aquí.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Main Component
───────────────────────────────────────── */

export default function OwnerPanel() {
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [billingPlan, setBillingPlan] = useState<BillingPlan>('FREE');

  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);

  /* Create shop modal */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [shopName, setShopName] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  /* Theme selection in modal */
  const [newThemeKey, setNewThemeKey] = useState('dev');
  const [newColors, setNewColors] = useState<ThemeColors>(THEME_DEFAULTS.dev.defaultColors);
  const [newHeaderName, setNewHeaderName] = useState('');
  const [newHeroTitle, setNewHeroTitle] = useState('');
  const [newHeroSubtitle, setNewHeroSubtitle] = useState('');

  const openCreateModal = () => { setModalStep(1); setShowCreateModal(true); };
  const closeCreateModal = () => { setShowCreateModal(false); setModalStep(1); };

  /* Add product form */
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', description: '' });
  const [newProductFile, setNewProductFile] = useState<File | null>(null);

  /* Edit product */
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingProductFile, setEditingProductFile] = useState<File | null>(null);
  const [editingProductPreviewUrl, setEditingProductPreviewUrl] = useState<string | null>(null);
  const [copiedImageUrl, setCopiedImageUrl] = useState<string | null>(null);
  const [showDeleteProductModal, setShowDeleteProductModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const [showDeleteShopModal, setShowDeleteShopModal] = useState(false);

  const user = getCurrentUser();

  const shopLimit = shopLimits[billingPlan];
  const canCreateShop = shops.length < shopLimit;
  const compactActionButtonStyle = {
    padding: '0.45rem 0.75rem',
    fontSize: '0.85rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    whiteSpace: 'nowrap',
  } as const;
  const iconActionButtonStyle = {
    padding: '0.45rem 0.7rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    whiteSpace: 'nowrap',
  } as const;
  const modalButtonStyle = {
    padding: '0.45rem 0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    whiteSpace: 'nowrap',
  } as const;

  const truncateUrl = (url: string, maxLength = 42): string => {
    if (url.length <= maxLength) {
      return url;
    }

    const edge = Math.max(14, Math.floor((maxLength - 1) / 2));
    return `${url.slice(0, edge)}…${url.slice(-edge)}`;
  };

  const copyImageUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedImageUrl(url);
      window.setTimeout(() => {
        setCopiedImageUrl((current) => (current === url ? null : current));
      }, 1500);
    } catch {
      setCopiedImageUrl(null);
    }
  };

  useEffect(() => {
    if (!editingProductFile) {
      setEditingProductPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(editingProductFile);
    setEditingProductPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [editingProductFile]);

  const goToSubscriptionPlan = () => {
    navigate('/profile', { state: { tab: 'billing' } });
  };

  /* ── Load all owner shops ── */
  const loadShops = useCallback(async (): Promise<Shop[]> => {
    try {
      setLoading(true);
      const profile = await getMe().catch(() => null);
      const subscription = String(profile?.subscription || '').toUpperCase();
      setBillingPlan(subscription === 'PRO' || subscription === 'MAX' ? subscription : 'FREE');

      const ownerIdentifier = profile?.id ?? user?.uid ?? null;
      const isAdmin = (profile?.role || user?.role || '').toUpperCase() === 'ADMIN';
      const data = isAdmin
        ? await getShops(1, 100)
        : ownerIdentifier
          ? await getOwnerShops(String(ownerIdentifier))
          : [];
      const visibleShops: Shop[] = isAdmin ? (data.data || []) : data;
      setShops(visibleShops);
      return visibleShops;
    } catch (error) {
      console.error('Error loading shops:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user?.uid, user?.role]);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  /* ── Load products for a shop ── */
  const loadProducts = useCallback(async (shopId: string) => {
    try {
      setProductsLoading(true);
      const prods = await getProductsByShop(shopId);
      setProducts(prods);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const handleSelectShop = (shop: Shop) => {
    const shopId = getShopId(shop);
    if (!shopId) {
      console.warn('Skipping shop selection because id is missing:', shop);
      return;
    }

    setSelectedShop(shop);
    setShowAddProduct(false);
    setEditingProduct(null);
    setEditingProductFile(null);
    void loadProducts(shopId);
  };

  const handleBack = () => {
    setSelectedShop(null);
    setProducts([]);
    setShowAddProduct(false);
    setShowThemePanel(false);
    setEditingProduct(null);
    setEditingProductFile(null);
  };

  /* ── Create shop ── */
  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateShop) { goToSubscriptionPlan(); return; }
    try {
      const requestedShopName = shopName.trim();
      const requestedPhone = shopPhone.trim();
      const config = {
        colors: newColors,
        headerName: newHeaderName.trim() || undefined,
        hero: {
          title: newHeroTitle.trim() || undefined,
          subtitle: newHeroSubtitle.trim() || undefined,
        },
      };
      const created = await createShop(shopName, shopPhone, newThemeKey, config);
      const createdShopId = getShopId(created);
      setShopName(''); setShopPhone('');
      setNewThemeKey('dev'); setNewColors(THEME_DEFAULTS.dev.defaultColors);
      setNewHeaderName(''); setNewHeroTitle(''); setNewHeroSubtitle('');
      setShowCreateModal(false); setModalStep(1);
      const refreshedShops = await loadShops();
      const createdShop = refreshedShops.find((shop) => getShopId(shop) === createdShopId)
        ?? refreshedShops.find((shop) =>
          getShopName(shop).trim().toLowerCase() === requestedShopName.toLowerCase()
          && String(shop.phoneNumber ?? '').trim() === requestedPhone
        );
      if (createdShop) handleSelectShop(createdShop);
    } catch (error) {
      console.error('Error creating shop', error);
      alert('Error al crear la tienda');
    }
  };

  /* ── Add product ── */
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop) return;
    try {
      await createProduct(
        getShopId(selectedShop),
        newProduct.name,
        parseFloat(newProduct.price),
        newProduct.description,
        newProductFile ?? undefined
      );
      setShowAddProduct(false);
      setNewProduct({ name: '', price: '', description: '' });
      setNewProductFile(null);
      await loadProducts(getShopId(selectedShop));
    } catch (error) {
      console.error('Error adding product:', error);
      alert('Error adding product');
    }
  };

  /* ── Update product ── */
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop || !editingProduct) return;
    try {
      await updateProduct(
        getShopId(selectedShop),
        editingProduct.productId,
        editingProduct.name,
        editingProduct.price,
        editingProduct.availability,
        editingProductFile ?? undefined
      );
      setEditingProduct(null);
      setEditingProductFile(null);
      await loadProducts(getShopId(selectedShop));
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Error updating product');
    }
  };

  /* ── Delete product (modal flow) ── */
  const promptDeleteProduct = (product: Product) => {
    setProductToDelete(product);
    setShowDeleteProductModal(true);
  };

  const cancelDeleteProduct = () => {
    setProductToDelete(null);
    setShowDeleteProductModal(false);
  };

  const confirmDeleteProduct = async () => {
    if (!selectedShop || !productToDelete) return;
    try {
      await deleteProduct(getShopId(selectedShop), productToDelete.productId);
      setShowDeleteProductModal(false);
      setProductToDelete(null);
      await loadProducts(getShopId(selectedShop));
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Error deleting product');
    }
  };

  /* ── Delete shop (modal flow) ── */
  const promptDeleteShop = () => setShowDeleteShopModal(true);
  const cancelDeleteShop = () => setShowDeleteShopModal(false);

  const confirmDeleteShop = async () => {
    if (!selectedShop) return;
    try {
      // attempt to delete products first
      const shopId = getShopId(selectedShop);
      if (products?.length) {
        await Promise.all(products.map((p) => deleteProduct(shopId, p.productId)));
      }
      await deleteShop(shopId);
      await loadShops();
      setSelectedShop(null);
      setProducts([]);
      setShowDeleteShopModal(false);
    } catch (error) {
      console.error('Error deleting shop:', error);
      alert('Error deleting shop');
    }
  };

  /* ────────────────── RENDER ────────────────── */

  if (loading) {
    return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading dashboard...</div>;
  }

  /* ── SHOP DETAIL VIEW ── */
  if (selectedShop) {
    const shopDisplayName = getShopName(selectedShop);
    const gradient = getBannerGradient(shopDisplayName);
    const initials = getInitials(shopDisplayName);

    return (
      <>
      <div className="animate-fade-in">
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              className="btn btn-outline"
              onClick={handleBack}
              style={{ padding: '0.5rem 0.75rem' }}
            >
              <ArrowLeft size={18} />
            </button>
            {/* Mini banner avatar */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>{initials}</span>
            </div>
            <div>
              <h1 style={{ margin: 0 }}>{shopDisplayName}</h1>
              <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0', fontSize: '0.875rem' }}>
                Manage your products and store activity.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingProduct(null);
                setShowThemePanel(false);
                setShowAddProduct(!showAddProduct);
              }}
              style={compactActionButtonStyle}
            >
              <Plus size={16} /> {showAddProduct ? 'Cancel' : 'Add Product'}
            </button>

            <button
              className="btn btn-outline"
              onClick={() => {
                setShowAddProduct(false);
                setShowThemePanel((current) => !current);
              }}
              style={compactActionButtonStyle}
            >
              <Palette size={16} /> {showThemePanel ? 'Cancel' : 'Visual Settings'}
            </button>

            <a
              href={`/${encodeURIComponent(getShopName(selectedShop))}?id=${encodeURIComponent(getShopId(selectedShop))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline"
              style={compactActionButtonStyle}
            >
              <ExternalLink size={16} /> View Shop
            </a>

            <button
              className="btn btn-danger"
              onClick={promptDeleteShop}
              style={compactActionButtonStyle}
            >
              <Trash2 size={16} /> Delete Store
            </button>
          </div>
        </div>



        {/* Products table */}
        <div className="card mb-6">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package size={20} /> Your Products
            </h3>
          </div>

          {productsLoading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading products...</p>
          ) : products.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No products published yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Image URL</th>
                    <th>Availability</th>
                    <th>Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.productId}>
                      <td style={{ fontWeight: 500 }}>{product.name}</td>
                      <td>{product.description ? `${product.description.substring(0, 50)}${product.description.length > 50 ? '...' : ''}` : '—'}</td>
                      <td style={{ maxWidth: '240px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {product.imageUrl ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            <a
                              href={product.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={product.imageUrl}
                              style={{
                                minWidth: 0,
                                maxWidth: '160px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: 'var(--primary)',
                                textDecoration: 'none',
                                display: 'inline-block',
                              }}
                            >
                              {truncateUrl(product.imageUrl)}
                            </a>
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ ...iconActionButtonStyle, padding: '0.4rem 0.65rem' }}
                              onClick={() => void copyImageUrl(product.imageUrl!)}
                              title="Copy image URL"
                            >
                              {copiedImageUrl === product.imageUrl ? <Check size={14} /> : <ExternalLink size={14} />}
                              {copiedImageUrl === product.imageUrl ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{product.availability ?? 'AVAILABLE'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                        ${product.price?.toFixed(2)}
                      </td>
                      <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-outline"
                          style={iconActionButtonStyle}
                          onClick={() => {
                            setShowAddProduct(false);
                            setEditingProductFile(null);
                            setEditingProduct(product);
                          }}
                        >
                          <Edit2 size={14} /> Edit
                        </button>

                        <button
                          className="btn btn-danger"
                          style={iconActionButtonStyle}
                          onClick={() => promptDeleteProduct(product)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Theme Panel Modal ── */}
      {showThemePanel && (
        <ThemePanel
          shopId={getShopId(selectedShop)}
          shopName={shopDisplayName}
          onClose={() => setShowThemePanel(false)}
        />
      )}

      {/* ── Add Product Modal (outside animate-fade-in to avoid transform containing-block bug) ── */}
      {showAddProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 90,
            padding: '1rem',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div className="card" style={{ width: 'min(760px, 96%)', maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Add New Product</h3>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowAddProduct(false)}
                style={modalButtonStyle}
              >
                <X size={16} /> Close
              </button>
            </div>
            <form
              onSubmit={handleAddProduct}
              style={{ display: 'grid', gap: '1rem' }}
            >
              <input
                type="text"
                placeholder="Product Name"
                className="input-field"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="Price ($)"
                className="input-field"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                required
              />
              <textarea
                placeholder="Description"
                className="input-field"
                rows={4}
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                required
              />
              <input
                type="file"
                accept="image/*"
                className="input-field"
                onChange={(e) => setNewProductFile(e.target.files?.[0] ?? null)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddProduct(false)} style={modalButtonStyle}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={modalButtonStyle}>
                  Publish Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Product Modal ── */}
      {editingProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 90,
            padding: '1rem',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div className="card" style={{ width: 'min(980px, 96%)', maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0 }}>Edit Product: {editingProduct.name}</h3>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Update the product details and compare the current image with a new upload before saving.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setEditingProduct(null);
                  setEditingProductFile(null);
                }}
                style={modalButtonStyle}
              >
                <X size={16} /> Close
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} style={{ display: 'grid', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)', gap: '1rem', alignItems: 'start' }}>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Image Comparison
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Upload a new image to compare it side by side.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
                    <div className="card" style={{ padding: '0.9rem', border: '1px solid var(--border-color)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.9rem' }}>Current image</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{editingProduct.imageUrl ? 'Stored' : 'None'}</span>
                      </div>
                      {editingProduct.imageUrl ? (
                        <img
                          src={editingProduct.imageUrl}
                          alt={`${editingProduct.name} current`}
                          style={{ width: '100%', height: '220px', objectFit: 'cover', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}
                        />
                      ) : (
                        <div style={{ height: '220px', borderRadius: '0.75rem', border: '1px dashed var(--border-color)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
                          This product does not have an image yet.
                        </div>
                      )}
                    </div>

                    <div className="card" style={{ padding: '0.9rem', border: '1px solid var(--border-color)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.9rem' }}>New image</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{editingProductPreviewUrl ? 'Ready to upload' : 'Waiting for file'}</span>
                      </div>
                      {editingProductPreviewUrl ? (
                        <img
                          src={editingProductPreviewUrl}
                          alt={`${editingProduct.name} new preview`}
                          style={{ width: '100%', height: '220px', objectFit: 'cover', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}
                        />
                      ) : (
                        <div style={{ height: '220px', borderRadius: '0.75rem', border: '1px dashed var(--border-color)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
                          Select an image to preview the change here.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Replace image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      className="input-field"
                      onChange={(e) => setEditingProductFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Name
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      value={editingProduct.name}
                      onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input-field"
                      value={editingProduct.price}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Availability
                    </label>
                    <select
                      className="input-field"
                      value={editingProduct.availability ?? 'AVAILABLE'}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, availability: e.target.value })
                      }
                    >
                      <option value="AVAILABLE">AVAILABLE</option>
                      <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 'auto' }}>
                    <button type="button" className="btn btn-outline" onClick={() => { setEditingProduct(null); setEditingProductFile(null); }} style={modalButtonStyle}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" style={modalButtonStyle}>
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete product modal ── */}
      {showDeleteProductModal && productToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 60,
          }}
        >
          <div className="card" style={{ width: 'min(720px, 94%)', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Confirm delete</h3>
            <p>
              ¿Seguro de eliminar este producto? Esta acción no se puede deshacer.
            </p>
            <p style={{ fontWeight: 600 }}>{productToDelete.name}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={cancelDeleteProduct} style={modalButtonStyle}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteProduct} style={modalButtonStyle}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete shop modal ── */}
      {showDeleteShopModal && selectedShop && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 60,
          }}
        >
          <div className="card" style={{ width: 'min(720px, 94%)', padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Confirm delete store</h3>
            <p>
              ¿Seguro de eliminar la tienda <strong>{getShopName(selectedShop)}</strong>?
              <br />
              Esta acción eliminará los productos y no se puede deshacer.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={cancelDeleteShop} style={modalButtonStyle}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteShop} style={modalButtonStyle}>
                Delete Store
              </button>
            </div>
          </div>
        </div>
      )}
      </>);
  }

  /* ── SHOPS LIST VIEW ── */
  return (
    <>
    <div className="animate-fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}>Mis Tiendas</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Selecciona una tienda para gestionar sus productos. Plan: {billingPlan}.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.5rem' }}>
        {shops.map((shop) => (
          <ShopCard key={getShopId(shop) || getShopName(shop)} shop={shop} onClick={handleSelectShop} />
        ))}
        <StoreActionCard
          canCreateShop={canCreateShop}
          shopCount={shops.length}
          shopLimit={shopLimit}
          onStartCreate={() => { if (!canCreateShop) { goToSubscriptionPlan(); return; } openCreateModal(); }}
          onUpgrade={goToSubscriptionPlan}
        />
      </div>
    </div>

      {/* ── Create Shop Modal (4-step wizard) — outside animate-fade-in to avoid transform containing-block bug ── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'grid', placeItems: 'center', zIndex: 100, padding: '1rem', backdropFilter: 'blur(6px)' }}>
          <div className="card" style={{ width: 'min(680px, 96%)', maxHeight: '92vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {[1,2,3,4].map((s) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 700,
                      background: s < modalStep ? 'var(--primary)' : s === modalStep ? 'var(--primary)' : 'var(--border-color)',
                      color: s <= modalStep ? '#000' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
                      {s < modalStep ? <Check size={14}/> : s}
                    </div>
                    {s < 4 && <div style={{ width: 24, height: 2, background: s < modalStep ? 'var(--primary)' : 'var(--border-color)', transition: 'all 0.3s' }} />}
                  </div>
                ))}
              </div>
              <button onClick={closeCreateModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={20}/></button>
            </div>

            {/* ── STEP 1: Basic info ── */}
            {modalStep === 1 && (
              <div>
                <h2 style={{ margin: '0 0 0.4rem' }}>Nueva Tienda</h2>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>Primero, danos los datos básicos de tu tienda.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre de la tienda *</div>
                    <input type="text" className="input-field" placeholder="Ej: Mi Tienda Cool" value={shopName} onChange={(e) => setShopName(e.target.value)} autoFocus />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teléfono de contacto *</div>
                    <input type="text" className="input-field" placeholder="+1 555 0000" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={() => { if (!shopName.trim() || !shopPhone.trim()) { alert('Por favor completa todos los campos.'); return; } setModalStep(2); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Siguiente <ChevronRight size={16}/>
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Theme + colors ── */}
            {modalStep === 2 && (
              <div>
                <h2 style={{ margin: '0 0 0.4rem' }}>Plantilla y Colores</h2>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>Elige el estilo visual de tu tienda y personaliza sus colores.</p>

                {/* Theme cards + live preview side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '1rem', marginBottom: '1.25rem', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Palette size={12}/> Plantilla</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
                      {Object.entries(THEME_DEFAULTS).map(([key, meta]) => {
                        const active = newThemeKey === key;
                        return (
                          <div key={key} onClick={() => { setNewThemeKey(key); setNewColors(meta.defaultColors); }}
                            style={{ borderRadius: 8, border: `2px solid ${active ? meta.accent : 'var(--border-color)'}`, padding: '0.65rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', boxShadow: active ? `0 0 12px ${meta.accent}44` : 'none', background: active ? `${meta.accent}0f` : 'transparent' }}>
                            <div style={{ fontWeight: 700, color: active ? meta.accent : 'var(--text-primary)', fontSize: '0.85rem' }}>{meta.label}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{meta.description}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Mini live preview */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>Preview</div>
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', fontSize: '0.6rem', userSelect: 'none' }}>
                      <div style={{ background: newColors.bgColor, padding: '0.35rem 0.5rem', borderBottom: `1px solid ${newColors.primaryColor}44`, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: newColors.primaryColor, fontWeight: 800 }}>{shopName || 'Tienda'}</span>
                        <span style={{ color: newColors.accentColor }}>◉</span>
                      </div>
                      <div style={{ background: newColors.bgColor, padding: '0.5rem' }}>
                        <div style={{ color: newColors.primaryColor, fontWeight: 700, marginBottom: '0.2rem' }}>{shopName || 'Hero'}</div>
                        <div style={{ background: `${newColors.primaryColor}22`, border: `1px solid ${newColors.primaryColor}44`, borderRadius: 4, padding: '0.3rem 0.4rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: newColors.textColor }}>Producto</span>
                          <span style={{ background: newColors.primaryColor, color: newColors.bgColor, borderRadius: 3, padding: '0.05rem 0.3rem', fontWeight: 700 }}>$29</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Color pickers compact 2x2 */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>Colores</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <ColorField label="Primario" value={newColors.primaryColor ?? '#39ff14'} onChange={(v) => setNewColors((c) => ({ ...c, primaryColor: v }))} />
                    <ColorField label="Fondo" value={newColors.bgColor ?? '#0d1117'} onChange={(v) => setNewColors((c) => ({ ...c, bgColor: v }))} />
                    <ColorField label="Texto" value={newColors.textColor ?? '#c9d1d9'} onChange={(v) => setNewColors((c) => ({ ...c, textColor: v }))} />
                    <ColorField label="Secundario" value={newColors.accentColor ?? '#58a6ff'} onChange={(v) => setNewColors((c) => ({ ...c, accentColor: v }))} />
                  </div>
                  <button type="button" onClick={() => setNewColors(THEME_DEFAULTS[newThemeKey]?.defaultColors ?? THEME_DEFAULTS.dev.defaultColors)}
                    style={{ marginTop: '0.5rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.25rem 0.65rem', fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    ↺ Restaurar por defecto
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button className="btn btn-outline" onClick={() => setModalStep(1)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><ChevronLeft size={15}/> Atrás</button>
                  <button className="btn btn-primary" onClick={() => setModalStep(3)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>Siguiente <ChevronRight size={15}/></button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Web texts ── */}
            {modalStep === 3 && (
              <div>
                <h2 style={{ margin: '0 0 0.4rem' }}>Texto de la Web</h2>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>Personaliza el nombre y los mensajes que verán tus clientes. Todos son opcionales.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>Nombre en el Header</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Aparece en la barra de navegación superior de tu tienda. Por defecto usa el nombre de la tienda.</div>
                    <input type="text" className="input-field" placeholder={shopName || 'Mi Tienda'} value={newHeaderName} onChange={(e) => setNewHeaderName(e.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>Título Principal</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>El gran titular en la sección hero (banner) de la tienda. Es lo primero que ven los visitantes.</div>
                    <input type="text" className="input-field" placeholder={shopName || 'Bienvenido a mi tienda'} value={newHeroTitle} onChange={(e) => setNewHeroTitle(e.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.2rem' }}>Subtítulo / Tagline</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Una frase corta debajo del título que describe tu propuesta de valor o estilo.</div>
                    <input type="text" className="input-field" placeholder="Tu tienda, tus reglas." value={newHeroSubtitle} onChange={(e) => setNewHeroSubtitle(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button className="btn btn-outline" onClick={() => setModalStep(2)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><ChevronLeft size={15}/> Atrás</button>
                  <button className="btn btn-primary" onClick={() => setModalStep(4)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>Siguiente <ChevronRight size={15}/></button>
                </div>
              </div>
            )}

            {/* ── STEP 4: Summary + confirm ── */}
            {modalStep === 4 && (
              <form onSubmit={(e) => void handleCreateShop(e)}>
                <h2 style={{ margin: '0 0 0.4rem' }}>Resumen</h2>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>Revisa los detalles y confirma para crear tu tienda.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                  {[['Nombre', shopName], ['Teléfono', shopPhone], ['Plantilla', THEME_DEFAULTS[newThemeKey]?.label ?? newThemeKey], ['Header', newHeaderName || shopName], ['Título principal', newHeroTitle || shopName || '—'], ['Subtítulo', newHeroSubtitle || '—']]
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-secondary, rgba(255,255,255,0.04))', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{k}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  {/* Color swatches */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-secondary, rgba(255,255,255,0.04))', borderRadius: 8, border: '1px solid var(--border-color)', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Colores</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {[newColors.primaryColor, newColors.bgColor, newColors.textColor, newColors.accentColor].map((c, i) => (
                        <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: '2px solid var(--border-color)' }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setModalStep(3)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><ChevronLeft size={15}/> Atrás</button>
                  <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Store size={16}/> Crear Tienda</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>);
}
