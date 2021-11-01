import React from 'react';
import FlexContainerLeft from './styled-components/FlexContainerLeft';
import FlexContainerRight from './styled-components/FlexContainerRight';
import FlexContainerRow from './shared/FlexContainerRow';
import FlexHeader from './styled-components/FlexHeader';
import MenuItemLeft from './styled-components/MenuItemLeft';
import MenuItemRight from './styled-components/MenuItemRight';
import styled from 'styled-components';

export const MenuLink = styled.a`
  font-size: 24px;
`;

const Header = React.memo(() => {
  return (
    <FlexHeader>
      <FlexContainerRow>
        <FlexContainerLeft>
          <MenuItemLeft></MenuItemLeft>
        </FlexContainerLeft>
        <FlexContainerRight>
          <MenuItemRight>
            <MenuLink href="/company">company</MenuLink>
          </MenuItemRight>
          <MenuItemRight>
            <MenuLink href="/contact">contact</MenuLink>
          </MenuItemRight>
        </FlexContainerRight>
      </FlexContainerRow>
    </FlexHeader>
  );
});

export default Header;
