import React from 'react';
import FlexContainerRow from './shared/FlexContainerRow';
import {ReactSVG} from 'react-svg';
import {Link, useLocation} from 'react-router-dom';
import FlexContainerLeft from './styled-components/FlexContainerLeft';
import FlexFooter from './styled-components/FlexFooter';
import MenuItemCenter from './styled-components/MenuItemCenter';
import MenuItemLeft from './styled-components/MenuItemLeft';
import MenuItemRight from './styled-components/MenuItemRight';

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
        <div className="flex-container-center">
          <MenuItemCenter></MenuItemCenter>
        </div>
        <div className="flex-container-right">
          <MenuItemRight></MenuItemRight>
        </div>
      </FlexContainerRow>
    </FlexFooter>
  );
});

export default Footer;
