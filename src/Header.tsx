import React from 'react';
import FlexContainerRow from './shared/FlexContainerRow';
import styled from 'styled-components';

export const MenuLink = styled.a`
  font-size: 24px;
`;

const Header = React.memo(() => {
  return (
    <header className="flex-header">
      <FlexContainerRow>
        <div className="flex-container-left">
          <div className="menu-item-left"></div>
        </div>
        <div className="flex-container-right">
          <div className="menu-item-right">
            <MenuLink href="/company">company</MenuLink>
          </div>
          <div className="menu-item-right">
            <MenuLink href="/contact">contact</MenuLink>
          </div>
        </div>
      </FlexContainerRow>
    </header>
  );
});

export default Header;
