import React from 'react';
import {Link, useLocation} from 'react-router';
import {ReactSVG} from 'react-svg';
import {features} from './featureFlags';
import {matchesRoute, storeRoutes} from './routes';
import FlexContainerCenter from './styled-components/FlexContainerCenter';
import FlexContainerLeft from './styled-components/FlexContainerLeft';
import FlexContainerRight from './styled-components/FlexContainerRight';
import FlexContainerRow from './styled-components/FlexContainerRow';
import FlexFooter from './styled-components/FlexFooter';
import MenuItemCenter from './styled-components/MenuItemCenter';
import MenuItemLeft from './styled-components/MenuItemLeft';
import MenuItemRight from './styled-components/MenuItemRight';

const repositoryUrl = 'https://github.com/a2f0/devopsrockstars.com';

const repositoryLinkRoutes = [
  '/company',
  ...(features.store ? storeRoutes : []),
];

const Footer = React.memo(() => {
  const location = useLocation();

  // Do not show the footer on the main screen
  if (location.pathname === '/') {
    return null;
  }

  return (
    <FlexFooter>
      <FlexContainerRow>
        <FlexContainerLeft>
          <MenuItemLeft>
            <Link to="/" aria-label="Home">
              <div
                style={{
                  cursor: 'pointer',
                  width: '200px',
                }}
              >
                <ReactSVG src="/static/image/devopsrockstars-llc.svg" />
              </div>
            </Link>
          </MenuItemLeft>
        </FlexContainerLeft>
        <FlexContainerCenter>
          <MenuItemCenter />
        </FlexContainerCenter>
        <FlexContainerRight>
          <MenuItemRight>
            {matchesRoute(repositoryLinkRoutes, location.pathname) ? (
              <a href={repositoryUrl} aria-label="GitHub repository">
                {/* Sized and raised to sit on the LLC logo's text baseline */}
                <div
                  style={{
                    cursor: 'pointer',
                    width: '20px',
                    paddingBottom: '6px',
                  }}
                >
                  <ReactSVG src="/static/image/github.svg" />
                </div>
              </a>
            ) : null}
          </MenuItemRight>
        </FlexContainerRight>
      </FlexContainerRow>
    </FlexFooter>
  );
});

export default Footer;
