import { api } from '../api';

export interface Shop {
  shopId?: string;
  id?: string;
  shopName?: string;
  name?: string;
  owner_id?: string;
  ownerId?: string;
  phoneNumber?: string;
  created_at?: string;
}

export interface ThemeColors {
  primaryColor?: string;
  bgColor?: string;
  textColor?: string;
  accentColor?: string;
}

export interface ThemeHeroConfig {
  title?: string;
  subtitle?: string;
}

export interface ThemeConfig {
  hero?: ThemeHeroConfig;
  colors?: ThemeColors;
  headerName?: string;
  [key: string]: unknown;
}

export interface ShopPublicTheme {
  shopId: string;
  themeKey: string;
  config: ThemeConfig;
  updatedAt?: string;
}

export const createShop = async (
  name: string,
  phoneNumber: string,
  themeKey?: string,
  config?: ThemeConfig,
): Promise<Shop> => {
  const payload: Record<string, unknown> = { shopName: name, phoneNumber };
  if (themeKey) payload.themeKey = themeKey;
  if (config) payload.config = config;
  const response = await api.post<Shop>('/openshop/shop', payload);
  return response.data;
};

export const getShops = async (page = 1, limit = 10) => {
  const response = await api.get(`/shops?page=${page}&limit=${limit}`);
  return response.data;
};

export const getOwnerShops = async (ownerId: string): Promise<Shop[]> => {
  const response = await api.get<Shop[]>(`/owners/${encodeURIComponent(ownerId)}/shops`);
  return response.data;
};

export const getShopById = async (id: string): Promise<Shop> => {
  const response = await api.get<Shop>(`/shops/${id}`);
  return response.data;
};

export const deleteShop = async (shopId: string): Promise<void> => {
  await api.delete(`/shop/id/${shopId}`);
};

export const getPublicShopById = async (shopId: string): Promise<Shop> => {
  const response = await api.get<Shop>(`/shop/${encodeURIComponent(shopId)}`);
  return response.data;
};

export const getShopPublicTheme = async (shopId: string): Promise<ShopPublicTheme> => {
  const response = await api.get<ShopPublicTheme>(`/shop/${encodeURIComponent(shopId)}/theme`);
  return response.data;
};

export const updateShopTheme = async (
  shopId: string,
  themeKey: string,
  config: ThemeConfig,
): Promise<ShopPublicTheme> => {
  const response = await api.put<ShopPublicTheme>(`/shop/${encodeURIComponent(shopId)}/theme`, {
    themeKey,
    config,
  });
  return response.data;
};
