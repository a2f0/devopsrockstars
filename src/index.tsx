import React from 'react';
import ReactDOM from 'react-dom';
import {BrowserRouter as Router, Route} from 'react-router-dom';
import './style/map.less';
import './style/devopsrockstars.less';
import FullScreenMap from './Map';
import Company from './Company';
import Skyline from './Skyline';
import FlexContainerRow from './shared/FlexContainerRow';
import FlexContainerColumn from './styled-components/FlexContainerColumn';
import Contact from './Contact';
import Footer from './Footer';
import FlexMain from './styled-components/FlexMain';
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
          <FlexContainerColumn>
            <Header />
            <FlexMain>
              <FlexContainerColumn>
                <Route path="/company" exact component={Company} />
                <Route path="/contact" component={Contact} />
              </FlexContainerColumn>
            </FlexMain>
            <Footer />
          </FlexContainerColumn>
        </div>
      </FlexContainerRow>
    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById('©'));
