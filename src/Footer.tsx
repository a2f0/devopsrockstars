import React from 'react';
import FlexContainerRow from './shared/FlexContainerRow';
import {ReactSVG} from 'react-svg';
import {Link, useLocation} from 'react-router-dom';
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
    <footer className="flex-footer">
      <FlexContainerRow>
        <div className="flex-container-left">
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
        </div>
        <div className="flex-container-center">
          <MenuItemCenter></MenuItemCenter>
        </div>
        <div className="flex-container-right">
          <MenuItemRight></MenuItemRight>
        </div>
      </FlexContainerRow>
    </footer>
  );
});

export default Footer;
