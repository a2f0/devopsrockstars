import React from 'react';
import SVG from './SVG';
import styled from 'styled-components';

export const SvgInline = styled.div`
  display: inline-block;
`;

export const DescriptionInline = styled.div`
  display: inline-block;
  margin-left: 10px;
`;

export const ContactLink = styled.a`
  text-decoration: none;
  pointer-events: auto;
`;

interface IProps {
  svgWidth: number;
  svgHeight: number;
  svgPath: string;
  rowDescription: string;
  uri: string;
}

const ContactRow = React.memo(function ContactRow({svgWidth, svgHeight, svgPath, rowDescription, uri}: IProps) {

  return (
    <div>
      <SvgInline>
        <a href={uri}>
          <SVG height={svgHeight} width={svgWidth} path={svgPath} />
        </a>
      </SvgInline>
      <DescriptionInline>
        <p>
          <ContactLink href={uri}>
            {rowDescription}
          </ContactLink>
        </p>
      </DescriptionInline>
    </div>

  )
});

export default ContactRow;
