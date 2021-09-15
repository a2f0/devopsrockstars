import React from 'react';
import FlexContainerRow from './shared/FlexContainerRow';
import { Link } from "react-router-dom";

const Header = React.memo(function Footer() {

  return (
    <header className="flex-header">
      <FlexContainerRow>
        <div className="flex-container-left">
          <div className="menu-item-left">
          </div>
        </div>
        <div className="flex-container-right">
          <div className="menu-item-right">
            <Link to="/company">company</Link>
          </div>
          <div className="menu-item-right">
            <Link to="/contact">contact</Link>
          </div>
        </div>
      </FlexContainerRow>
    </header>
  )
});

export default Header;
