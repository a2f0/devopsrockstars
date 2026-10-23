import React, {useLayoutEffect, useRef} from 'react';
import {Link, useLocation} from 'react-router';
import styled from 'styled-components';
import {features} from './featureFlags';
import {matchesRoute, storeRoutes} from './routes';
import FlexContainerLeft from './styled-components/FlexContainerLeft';
import FlexContainerRight from './styled-components/FlexContainerRight';
import FlexContainerRow from './styled-components/FlexContainerRow';
import FlexHeader from './styled-components/FlexHeader';
import MenuItemLeft from './styled-components/MenuItemLeft';
import MenuItemRight from './styled-components/MenuItemRight';

const MenuLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: clamp(20px, 6vw, 24px);
  text-decoration: none;

  &[aria-current='page'] {
    text-decoration: underline;
  }
`;

interface INavItemProps {
  to: string;
  routes: readonly string[];
  children: React.ReactNode;
}

// Only the link for the current page, or the section it belongs to, is
// underlined. Unknown paths render NotFound and leave every link plain.
const NavItem = ({to, routes, children}: INavItemProps) => {
  const {pathname} = useLocation();
  return (
    <MenuLink
      data-ct={`nav.${to.slice(1)}`}
      to={to}
      aria-current={matchesRoute(routes, pathname) ? 'page' : undefined}
    >
      {children}
    </MenuLink>
  );
};

const MenuNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0 clamp(12px, 3vw, 20px);
`;

const Header = React.memo(() => {
  const {pathname} = useLocation();
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const updateHeight = () =>
      document.documentElement.style.setProperty(
        '--header-height',
        `${element.getBoundingClientRect().height}px`
      );
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--header-height');
    };
  }, []);

  return (
    <FlexHeader ref={header} $transparent={pathname === '/'}>
      <FlexContainerRow>
        <FlexContainerLeft>
          <MenuItemLeft />
        </FlexContainerLeft>
        <FlexContainerRight>
          <MenuItemRight>
            <MenuNav aria-label="Main navigation">
              {features.search ? (
                <NavItem to="/search" routes={['/search']}>
                  search
                </NavItem>
              ) : null}
              {features.store ? (
                <NavItem to="/store" routes={storeRoutes}>
                  store
                </NavItem>
              ) : null}
              <NavItem to="/company" routes={['/company']}>
                company
              </NavItem>
            </MenuNav>
          </MenuItemRight>
        </FlexContainerRight>
      </FlexContainerRow>
    </FlexHeader>
  );
});

export default Header;
