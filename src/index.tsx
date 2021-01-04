import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Link } from "react-router-dom";
import './style/map.less';
import './style/devopsrockstars.less';
import FullScreenMap from "./Map";
import Company from "./Company";
import Skyline from "./Skyline";
import FlexContainerRow from "./shared/FlexContainerRow"
import Store from "./Store"
import Contact from "./Contact"

function AppRouter() {
  return (
    <Router>
      <FullScreenMap/>
      <Route path="/" exact component={Skyline} />
      <FlexContainerRow>
        <div className="flex-full-height-min">
          <div className="flex-container-column">
            
            <div className="flex-header">

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
            <div className="flex-body">
              <div className="flex-container-column">
                <Route path="/company" exact component={Company} />
                <Route path="/store" component={Store} />
                <Route path="/contact" component={Contact} />
              </div>
            </div>
            <div className="flex-footer">
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
        </div>
      </FlexContainerRow>

    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById("©"));
