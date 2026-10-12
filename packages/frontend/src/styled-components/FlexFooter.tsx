import styled from 'styled-components';

// The logos rest on the bottom edge of the screen. Only devices with a home
// indicator keep a gap, sized by the safe-area inset.
const FlexFooter = styled.footer`
  display: flex;
  padding: 12px 0 env(safe-area-inset-bottom);

  a {
    display: flex;
    align-items: flex-end;
    min-height: 44px;
  }

  svg {
    display: block;
  }
`;

export default FlexFooter;
