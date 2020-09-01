import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Link } from "react-router-dom";
import './style/map.less';
import './style/devopsrockstars.less';

import FullScreenMap from "./FullScreenMap.jsx";
import Company from "./Company.jsx";
import Skyline from "./Skyline.jsx";
import FlexContainerRow from "./shared/FlexContainerRow.jsx"

function Store() {
  return <h2>Store</h2>;
}

function Contact() {
  return <h2>Contact</h2>;
}

function AppRouter() {
  return (
    <Router>
      <FullScreenMap/>
      <Route path="/" exact component={Skyline} />
      <FlexContainerRow>

        <div className="flex-container-column">
            
          <div className="flex-row-header">

            <FlexContainerRow>
              <div className="flex-container-left">
                <div className="menu-item-left">
                  <Link to="/">index</Link>
                </div>
              </div>
              <div className="flex-container-right">
                <div className="menu-item-right">
                  <Link to="/company">company</Link>
                </div>
                <div className="menu-item-right">
                  <Link to="/store">store</Link>
                </div>
                <div className="menu-item-right">
                  <Link to="/contact">contact</Link>
                </div>
              </div>
            </FlexContainerRow>

          </div>
          <div className="flex-row-body">
            <div className="flex-container-column">
              <Route path="/company" exact component={Company} />
              <Route path="/store" component={Store} />
              <Route path="/contact" component={Contact} />
            </div>
          </div>
          <div className="flex-row-footer">
            <FlexContainerRow>
              <div className="flex-container-left">
                <div className="menu-item-left">
                  <Link to="/">index</Link>
                </div>
              </div>
              <div className="flex-container-center">
                <div className="menu-item-center">
                  <Link to="/">index</Link>
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
          </div>
        </div>
      </FlexContainerRow>

      {/* <NavigationBottom /> */}
    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById("©"));
