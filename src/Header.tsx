import React from 'react';
import FlexContainerLeft from './styled-components/FlexContainerLeft';
import FlexContainerRight from './styled-components/FlexContainerRight';
import FlexContainerRow from './shared/FlexContainerRow';
import FlexHeader from './styled-components/FlexHeader';
import MenuItemLeft from './styled-components/MenuItemLeft';
import MenuItemRight from './styled-components/MenuItemRight';
import {Link} from 'react-router-dom';
import styled from 'styled-components';

export const MenuLink = styled(Link)`
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
            <MenuLink to="/company">company</MenuLink>
          </MenuItemRight>
          <MenuItemRight>
            <MenuLink to="/contact">contact</MenuLink>
          </MenuItemRight>
        </FlexContainerRight>
      </FlexContainerRow>
    </FlexHeader>
  );
});

export default Header;
