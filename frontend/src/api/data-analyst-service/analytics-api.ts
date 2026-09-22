import { api } from '../api';

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  shopId?: string;
}

export interface AnalyticsResponse<T> {
  filters: Record<string, string | number | null>;
  data: T[];
}

export interface OwnerSummary {
  total_shops: string;
  total_products: string;
  available_products: string;
  out_of_stock_products: string;
  average_price: string;
  total_users: string;
  registered_in_period: string;
  registered_in_previous_period: string;
  total_memberships: string;
}

export interface ShopAnalytics {
  shop_id: string;
  shop_name: string;
  phone_number: string;
  total_products: string;
  available_products: string;
  out_of_stock_products: string;
  average_price: string;
  total_users: string;
  registered_in_period: string;
  registered_in_previous_period: string;
  total_memberships: string;
}

export interface TrendPoint {
  period: string;
  registered_users: string;
}

export interface ProductAnalytics {
  shop_id: string;
  shop_name: string;
  product_id: string;
  product_name: string;
  price: string;
  availability: string;
  image_url?: string;
}

export interface CatalogHealth {
  total_shops: string;
  total_products: string;
  total_users: string;
  products_without_price: string;
  products_without_availability: string;
  products_without_shop: string;
}

const buildParams = (filters: AnalyticsFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.shopId) params.set('shopId', filters.shopId);
  return params;
};

export const getOwnerSummary = async (filters: AnalyticsFilters) => {
  const response = await api.get<AnalyticsResponse<OwnerSummary>>('/analytics/owner/summary', { params: buildParams(filters) });
  return response.data;
};

export const getOwnerShopsAnalytics = async (filters: AnalyticsFilters) => {
  const response = await api.get<AnalyticsResponse<ShopAnalytics>>('/analytics/owner/shops', { params: buildParams(filters) });
  return response.data;
};

export const getOwnerTrend = async (filters: AnalyticsFilters) => {
  const response = await api.get<AnalyticsResponse<TrendPoint>>('/analytics/owner/trend', { params: buildParams(filters) });
  return response.data;
};

export const getOwnerProducts = async (filters: Pick<AnalyticsFilters, 'shopId'>, limit = 12) => {
  const params = buildParams(filters);
  params.set('limit', String(limit));
  const response = await api.get<AnalyticsResponse<ProductAnalytics>>('/analytics/owner/products', {
    params,
  });
  return response.data;
};

export const getOwnerCatalogHealth = async (filters: Pick<AnalyticsFilters, 'shopId'>) => {
  const response = await api.get<AnalyticsResponse<CatalogHealth>>('/analytics/owner/catalog-health', {
    params: buildParams(filters),
  });
  return response.data;
};
