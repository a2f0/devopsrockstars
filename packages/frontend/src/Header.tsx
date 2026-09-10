import React from 'react';
import {Link} from 'react-router';
import styled from 'styled-components';
import {features} from './environment';
import FlexContainerLeft from './styled-components/FlexContainerLeft';
import FlexContainerRight from './styled-components/FlexContainerRight';
import FlexContainerRow from './styled-components/FlexContainerRow';
import FlexHeader from './styled-components/FlexHeader';
import MenuItemLeft from './styled-components/MenuItemLeft';
import MenuItemRight from './styled-components/MenuItemRight';

const MenuLink = styled(Link)`
  font-size: 24px;
`;

const MenuNav = styled.nav`
  display: flex;
  gap: 20px;
`;

const Header = React.memo(() => {
  return (
    <FlexHeader>
      <FlexContainerRow>
        <FlexContainerLeft>
          <MenuItemLeft />
        </FlexContainerLeft>
        <FlexContainerRight>
          <MenuItemRight>
            <MenuNav aria-label="Main navigation">
              {features.search ? (
                <MenuLink to="/search">search</MenuLink>
              ) : null}
              {features.store ? <MenuLink to="/store">store</MenuLink> : null}
              <MenuLink to="/company">company</MenuLink>
            </MenuNav>
          </MenuItemRight>
        </FlexContainerRight>
      </FlexContainerRow>
    </FlexHeader>
  );
});

export default Header;
