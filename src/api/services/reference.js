import apiClient from '../client';

export const warehousesAPI = {
  // Получить список складов
  getWarehouses: async () => {
    try {
      const response = await apiClient.get('/warehouses');
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

export const userDataAPI = {
  // Получить персональные данные (БИНы, доверенности, способы доставки)
  getUserData: async () => {
    try {
      const response = await apiClient.get('/user-data');
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Утилиты для работы со складами
export const warehousesUtils = {
  // Форматирование адреса склада
  formatAddress: (warehouse) => {
    if (!warehouse) return '';
    return `${warehouse.city}, ${warehouse.full_address}`;
  },

  // Получить координаты склада
  getCoordinates: (warehouse) => {
    if (!warehouse || !warehouse.lat || !warehouse.lng) return null;
    return {
      lat: warehouse.lat,
      lng: warehouse.lng,
    };
  },

  // Форматирование списка складов для выбора
  formatWarehousesForSelect: (warehouses) => {
    if (!warehouses) return [];
    
    return Object.entries(warehouses).map(([key, warehouse]) => ({
      id: key,
      name: warehouse.name,
      fullName: `${warehouse.name} - ${warehouse.full_address}`,
      address: warehouse.full_address,
      city: warehouse.city,
      phone: warehouse.phone,
      contactPerson: warehouse.full_name,
      coordinates: {
        lat: warehouse.lat,
        lng: warehouse.lng,
      },
    }));
  },
};

// Утилиты для работы с пользовательскими данными
export const userDataUtils = {
  // Получить основную доверенность
  getPrimaryAttorney: (userData) => {
    if (!userData?.data?.Доверенности) return null;
    return userData.data.Доверенности.find(d => d.Основной && !d.empty);
  },

  // Получить основной способ доставки
  getPrimaryDelivery: (userData) => {
    if (!userData?.data?.Транспортники) return null;
    return userData.data.Транспортники.find(t => t.Основной);
  },

  // Форматирование доверенностей для выбора
  formatAttorneysForSelect: (userData, bin = null) => {
    if (!userData?.data?.Доверенности) return [];
    
    return userData.data.Доверенности
      .filter(d => !d.empty && (!bin || d.БИН === bin))
      .map((d, index) => ({
        id: index,
        number: d.Номер,
        fullName: d.ФИО,
        dateIssue: d.ДатаВыдачи,
        dateExpiry: d.ДатаОкончания,
        bin: d.БИН,
        isPrimary: d.Основной,
      }));
  },

  // Форматирование способов доставки для выбора
  formatDeliveryMethodsForSelect: (userData, bin = null) => {
    if (!userData?.data?.Транспортники) return [];
    
    return userData.data.Транспортники
      .filter(t => !bin || t.БИН === bin)
      .map((t, index) => ({
        id: index,
        method: t.СпособДоставки,
        carrier: t.Транспортник,
        address: t.Адрес,
        contact: t.Контакты,
        phone: t.Телефон,
        comment: t.Комментарий,
        bin: t.БИН,
        isPrimary: t.Основной,
      }));
  },

  // Получить список подчиненных организаций
  getSubordinates: (userData) => {
    if (!userData?.data?.Подчиненные) return [];
    
    return Object.entries(userData.data.Подчиненные).map(([key, org]) => ({
      bin: org.БИН,
      name: org.Наименование,
    }));
  },

  // Получить все доступные БИНы
  getAllAvailableBins: (userData) => {
    if (!userData?.data) return [];
    
    const bins = new Set();
    
    // Основной БИН
    if (userData.data.bin) {
      bins.add(userData.data.bin);
    }
    
    // БИНы из подчиненных
    if (userData.data.Подчиненные) {
      Object.values(userData.data.Подчиненные).forEach(org => {
        if (org.БИН) bins.add(org.БИН);
      });
    }
    
    return Array.from(bins);
  },
};