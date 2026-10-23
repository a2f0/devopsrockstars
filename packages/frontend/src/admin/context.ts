import {createContext, useContext} from 'react';
import type {AdminUser} from './api';

interface AdminContextValue {
  readonly user: AdminUser;
  // Wraps a request so an expired session returns to the sign-in form.
  readonly guard: <T>(request: Promise<T>) => Promise<T>;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside the admin');
  return value;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request failed.';
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDate(value: string) {
  return dateFormat.format(new Date(value));
}
