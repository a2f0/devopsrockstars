import {Route, BrowserRouter as Router, Routes} from 'react-router-dom';
import Company from './Company';
import Contact from './Contact';
import FlexContainerColumn from './styled-components/FlexContainerColumn';
import FlexContainerRow from './styled-components/FlexContainerRow';
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
      <FlexContainerRow>
        <FlexFullHeightMin>
          <FlexContainerColumn>
            <Header />
            <FlexMain>
              <FlexContainerColumn>
                <Routes>
                  <Route path="/" element={<Skyline />} />
                  <Route path="/company" element={<Company />} />
                  <Route path="/contact" element={<Contact />} />
                </Routes>
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
