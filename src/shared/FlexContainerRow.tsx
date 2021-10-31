import React from 'react';
import styled from 'styled-components';

export const StyledRow = styled.div`
  display: flex;
  justify-content: center;
  flex-drection: row;
  width: 100%;
`;

interface IProps {
  children: React.ReactNode;
}

const FlexContainerRow = function ({children}: IProps) {
  return <StyledRow>{children}</StyledRow>;
};
export default FlexContainerRow;
