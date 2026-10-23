import {NavLink} from 'react-router';
import styled from 'styled-components';
import {Button, monospace, StoreShell} from '../store/StoreStyles';

export const AdminShell = styled(StoreShell)`
  max-width: 980px;
  margin: 0 auto;
  padding-top: 24px;
  font-size: 15px;
  overflow-wrap: normal;
`;

export const AdminHeading = styled.h1`
  margin: 0 0 6px;
  font-size: clamp(24px, 4vw, 34px);
  font-weight: 400;
  letter-spacing: -0.03em;
`;

export const AdminBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 20px;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid #4d4d4d;
`;

export const AdminNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
`;

export const AdminNavLink = styled(NavLink)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: #bbb;
  font-size: 15px;
  text-decoration: none;

  &.active {
    color: white;
    text-decoration: underline;
    text-underline-offset: 5px;
  }
`;

export const Muted = styled.p`
  color: #999;
  font-size: 13px;
  line-height: 1.5;
`;

export const Panel = styled.section`
  margin-bottom: 26px;
  border: 1px solid #333;
  background: rgb(8 8 8 / 92%);
  padding: 16px;
`;

export const PanelHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  margin-bottom: 12px;
`;

export const PanelTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 400;
`;

export const Badge = styled.span<{$tone?: 'good' | 'warn' | 'bad' | 'muted'}>`
  display: inline-block;
  border: 1px solid
    ${({$tone}) =>
      $tone === 'good'
        ? '#5fbf7f'
        : $tone === 'warn'
          ? '#d9b44a'
          : $tone === 'bad'
            ? '#ff8a8a'
            : '#666'};
  color: ${({$tone}) =>
    $tone === 'good'
      ? '#8fe0a8'
      : $tone === 'warn'
        ? '#f0d27a'
        : $tone === 'bad'
          ? '#ffb0b0'
          : '#aaa'};
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 2px 7px;
  text-transform: uppercase;
  white-space: nowrap;
`;

export const Code = styled.code`
  font-family: ${monospace};
  font-size: 12px;
  color: #bbb;
  overflow-wrap: anywhere;
`;

export const SmallButton = styled(Button)`
  min-height: 36px;
  padding: 6px 12px;
  font-size: 13px;
`;

export const LinkButton = styled.button`
  min-height: 44px;
  border: 0;
  padding: 0;
  background: none;
  color: white;
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  cursor: pointer;
  pointer-events: auto;

  &:disabled {
    color: #666;
    cursor: not-allowed;
  }
`;

export const AuthCard = styled.div`
  width: min(100%, 380px);
  margin: 12px auto 0;

  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 18px;
  }
`;
