import React from 'react';
import FlexContainerRow from './shared/FlexContainerRow';
import { ReactSVG } from 'react-svg';
import { Link, useLocation } from "react-router-dom";
import styled from 'styled-components';
import packageJson from '../package.json';

const Footer = React.memo(function Footer() {
  const location = useLocation();

  // Do not show the footer on the main screen
  if (location.pathname === '/') {
    return null;
  }

  const VersionLink = styled.a`
  color: white;
  font-size: 12px;
  font-family: monospace;
  font-weight: 10;
  text-decoration: none;
`;

  return (
    <footer className="flex-footer" >
      <FlexContainerRow>
        <div className="flex-container-left">
          <div className="menu-item-left">
            <Link to="/">
              <div style={{
                cursor: 'pointer',
                pointerEvents: 'auto',
                width: '130px',
              }}>
                <ReactSVG
                  src='/static/image/devopsrockstars-llc.svg'
                />
              </div>
            </Link>
          </div>
        </div>
        <div className="flex-container-center">
          <div className="menu-item-center"></div>
        </div>
        <div className="flex-container-right">
          <div className="menu-item-right">
            <VersionLink href="https://github.com/a2f0/devopsrockstars-frontend">v{packageJson.version}</VersionLink>
          </div>
        </div>
      </FlexContainerRow>
    </footer>
  )
});

export default Footer;
