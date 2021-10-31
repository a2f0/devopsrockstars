import React from 'react';
import ReactDOM from 'react-dom';
import {BrowserRouter as Router, Route} from 'react-router-dom';
import './style/map.less';
import './style/devopsrockstars.less';
import FullScreenMap from './Map';
import Company from './Company';
import Skyline from './Skyline';
import FlexContainerRow from './shared/FlexContainerRow';
import Contact from './Contact';
import Footer from './Footer';
import Header from './Header';
import GlobalStyle from './styled-components/GlobalStyle';

function AppRouter() {
  return (
    <Router>
      <GlobalStyle />
      <FullScreenMap />
      <Route path="/" exact component={Skyline} />
      <FlexContainerRow>
        <div className="flex-full-height-min">
          <div className="flex-container-column">
            <Header />
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
ReactDOM.render(<AppRouter />, document.getElementById('©'));
