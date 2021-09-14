import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Link, useLocation } from "react-router-dom";
import './style/map.less';
import './style/devopsrockstars.less';
import FullScreenMap from "./Map";
import Company from "./Company";
import Skyline from "./Skyline";
import FlexContainerRow from "./shared/FlexContainerRow"
import Contact from "./Contact"
import Footer from "./Footer"

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
                    {/* <div style={{
                      cursor: 'pointer',
                      pointerEvents: 'auto',
                      height: '130px',
                      width: '130px',
                    }}>
                      <ReactSVG
                        src='image/tags/aws.svg'
                      />
                    </div> */}
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

            </div>
            <div className="flex-body">
              <div className="flex-container-column">
                <Route path="/company" exact component={Company} />
                <Route path="/contact" component={Contact} />
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </FlexContainerRow>

    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById("©"));
