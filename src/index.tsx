import {Route, BrowserRouter as Router} from 'react-router-dom';
import Company from './Company';
import Contact from './Contact';
import FlexContainerColumn from './styled-components/FlexContainerColumn';
import FlexContainerRow from './shared/FlexContainerRow';
import FlexFullHeightMin from './styled-components/FlexFullHeightMin';
import FlexMain from './styled-components/FlexMain';
import Footer from './Footer';
import FullScreenMap from './Map';
import GlobalStyle from './styled-components/GlobalStyle';
import Header from './Header';
import React from 'react';
import ReactDOM from 'react-dom';
import Skyline from './Skyline';

function AppRouter() {
  return (
    <Router>
      <GlobalStyle />
      <FullScreenMap />
      <Route path="/" exact component={Skyline} />
      <FlexContainerRow>
        <FlexFullHeightMin>
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
        </FlexFullHeightMin>
      </FlexContainerRow>
    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById('©'));
