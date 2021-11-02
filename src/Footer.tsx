import {Link, useLocation} from 'react-router-dom';
import FlexContainerCenter from './styled-components/FlexContainerCenter';
import FlexContainerLeft from './styled-components/FlexContainerLeft';
import FlexContainerRight from './styled-components/FlexContainerRight';
import FlexContainerRow from './shared/FlexContainerRow';
import FlexFooter from './styled-components/FlexFooter';
import MenuItemCenter from './styled-components/MenuItemCenter';
import MenuItemLeft from './styled-components/MenuItemLeft';
import MenuItemRight from './styled-components/MenuItemRight';
import React from 'react';
import {ReactSVG} from 'react-svg';

const Footer = React.memo(() => {
  const location = useLocation();

  // Do not show the footer on the main screen
  if (location.pathname === '/') {
    return null;
  }

  return (
    <FlexFooter>
      <FlexContainerRow>
        <FlexContainerLeft>
          <MenuItemLeft>
            <Link to="/">
              <div
                style={{
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  width: '200px',
                }}
              >
                <ReactSVG src="/static/image/devopsrockstars-llc.svg" />
              </div>
            </Link>
          </MenuItemLeft>
        </FlexContainerLeft>
        <FlexContainerCenter>
          <MenuItemCenter></MenuItemCenter>
        </FlexContainerCenter>
        <FlexContainerRight>
          <MenuItemRight></MenuItemRight>
        </FlexContainerRight>
      </FlexContainerRow>
    </FlexFooter>
  );
});

export default Footer;
