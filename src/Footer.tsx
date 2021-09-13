import React, { useEffect, useState } from 'react';
import { StoreProduct } from './models';
import { makeStyles } from '@material-ui/core/styles';
import FlexContainerRow from './shared/FlexContainerRow';
import { ReactSVG } from 'react-svg';
import { Link, useLocation } from "react-router-dom";

const Footer = React.memo(function Footer() {
  const location = useLocation();

  // Do not show the footer on the main screen
  if (location.pathname === '/') {
    return null;
  }

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
          <div className="menu-item-center">


          </div>
        </div>
        <div className="flex-container-right">
          <div className="menu-item-right">
            <Link to="/store">kiva</Link>
          </div>
          <div className="menu-item-right">
            <Link to="/contact">search</Link>
          </div>
        </div>
      </FlexContainerRow>
    </footer>
  )
});

export default Footer;
