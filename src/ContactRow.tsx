import React, {useState} from 'react';
import SVG from './SVG';
import styled, {css} from 'styled-components';

interface IRowProps {
  isActive: boolean;
}

export const Row = styled.div<IRowProps>`
  pointer-events: auto;
  ${({isActive}) =>
    isActive &&
    css`
      .svg {
        fill: var(--hover-color);
      }
    `}
  ${({isActive}) =>
    !isActive &&
    css`
      .svg {
        fill: var(--foreground-color);
      }
    `}
`;

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

const ContactRow = React.memo(
  ({svgWidth, svgHeight, svgPath, rowDescription, uri}: IProps) => {
    const [isActive, setIsActive] = useState<boolean>(false);

    return (
      <a href={uri}>
        <Row
          onMouseEnter={() => setIsActive(true)}
          onMouseLeave={() => setIsActive(false)}
          isActive={isActive}
        >
          <SvgInline>
            <SVG
              height={svgHeight}
              width={svgWidth}
              path={svgPath}
              initialGrayscale={0}
            />
          </SvgInline>
          <DescriptionInline>
            <p>{rowDescription}</p>
          </DescriptionInline>
        </Row>
      </a>
    );
  }
);

export default ContactRow;
