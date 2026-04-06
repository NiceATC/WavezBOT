export function createShopCalls(api) {
  return {
    getCatalog: () => api.shop.getCatalog(),
    getWallet: () => api.shop.getWallet(),
    getInventory: () => api.shop.getInventory(),
    purchase: (input) => api.shop.purchase(input),
    equip: (itemId) => api.shop.equip(itemId),
  };
}
