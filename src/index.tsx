import React from 'react';
import ReactDOM from 'react-dom/client';
import {Route, BrowserRouter as Router, Routes} from 'react-router';
import Company from './Company';
import Footer from './Footer';
import Header from './Header';
import FullScreenMap from './Map';
import Skyline from './Skyline';
import FlexContainerColumn from './styled-components/FlexContainerColumn';
import FlexContainerRow from './styled-components/FlexContainerRow';
import FlexFullHeightMin from './styled-components/FlexFullHeightMin';
import FlexMain from './styled-components/FlexMain';
import GlobalStyle from './styled-components/GlobalStyle';

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

const rootElement = document.getElementById('©');
if (!rootElement) throw new Error('Failed to find the root element');
const root = ReactDOM.createRoot(rootElement);
root.render(<AppRouter />);
