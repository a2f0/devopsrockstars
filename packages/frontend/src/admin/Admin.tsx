import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Navigate, Route, Routes} from 'react-router';
import {Eyebrow} from '../store/StoreStyles';
import Account from './Account';
import Alerts from './Alerts';
import {AdminApiError, type AdminUser, loadSession} from './api';
import {
  AdminBar,
  AdminHeading,
  AdminNav,
  AdminNavLink,
  AdminShell,
  Badge,
} from './AdminStyles';
import {AdminContext} from './context';
import Inventory from './Inventory';
import Orders from './Orders';
import SignIn from './SignIn';

type SessionState =
  | {status: 'loading'}
  | {status: 'signed-out'; expired: boolean}
  | {status: 'unavailable'}
  | {status: 'signed-in'; user: AdminUser};

const environment = globalThis.__SITE_ENVIRONMENT__ ?? 'production';

// Production allows indexing, so the admin opts out while it is mounted.
function useNoIndex() {
  useEffect(() => {
    if (document.querySelector('meta[name="robots"]')) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.append(meta);
    return () => meta.remove();
  }, []);
}

const Admin = () => {
  useNoIndex();
  const [session, setSession] = useState<SessionState>({status: 'loading'});

  useEffect(() => {
    let active = true;
    loadSession()
      .then(user => {
        if (!active) return;
        setSession(
          user
            ? {status: 'signed-in', user}
            : {status: 'signed-out', expired: false}
        );
      })
      .catch(() => {
        if (active) setSession({status: 'unavailable'});
      });
    return () => {
      active = false;
    };
  }, []);

  const guard = useCallback(async <T,>(request: Promise<T>) => {
    try {
      return await request;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401)
        setSession({status: 'signed-out', expired: true});
      throw error;
    }
  }, []);

  const context = useMemo(
    () => (session.status === 'signed-in' ? {user: session.user, guard} : null),
    [session, guard]
  );

  return (
    <AdminShell data-ct-ignore>
      <AdminBar>
        <div>
          <Eyebrow>
            Store admin{' '}
            <Badge $tone={environment === 'production' ? 'bad' : 'warn'}>
              {environment}
            </Badge>
          </Eyebrow>
          <AdminHeading>DevOps Rockstars</AdminHeading>
        </div>
        {context ? (
          <AdminNav aria-label="Admin">
            <AdminNavLink to="/admin" end>
              Inventory
            </AdminNavLink>
            <AdminNavLink to="/admin/orders">Orders</AdminNavLink>
            <AdminNavLink to="/admin/alerts">Alerts</AdminNavLink>
            <AdminNavLink to="/admin/account">Account</AdminNavLink>
          </AdminNav>
        ) : null}
      </AdminBar>
      {session.status === 'loading' ? (
        <p role="status">Checking your session…</p>
      ) : session.status === 'unavailable' ? (
        <SignIn notice="Could not check your session. Sign in again to continue." />
      ) : session.status === 'signed-out' ? (
        <SignIn
          {...(session.expired
            ? {notice: 'Your session expired. Sign in again to continue.'}
            : {})}
        />
      ) : (
        <AdminContext.Provider value={context}>
          <Routes>
            <Route index element={<Inventory />} />
            <Route path="orders" element={<Orders />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="account" element={<Account />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </AdminContext.Provider>
      )}
    </AdminShell>
  );
};

export default Admin;
