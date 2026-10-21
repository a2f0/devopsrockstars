import styled from 'styled-components';

// A transparent header lets the full-screen skyline's sky show through.
// Elsewhere the black backdrop keeps scrolled content out from under the links.
const FlexHeader = styled.header<{$transparent: boolean}>`
  display: flex;
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 8px 0;
  background: ${({$transparent}) => ($transparent ? 'transparent' : 'black')};
`;

export default FlexHeader;
