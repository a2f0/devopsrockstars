import React from 'react'
import styled from 'styled-components';

export const StyledRow = styled.div`
  display: flex;
  justify-content: center;
  flex-drection: row;
  width: 100%;
`;

const FlexContainerRow = function (props: any) {
  return (
    <StyledRow>
      {props.children}
    </StyledRow>
  )
}
export default FlexContainerRow
