import { createContext, useContext } from 'react';

export const TenderAccessContext = createContext({ allowed: false, checking: false });
export const useTenderAccess = () => useContext(TenderAccessContext);
