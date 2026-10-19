import React from 'react';
import styled from 'styled-components';
import {layers, ratio, rows} from './checkoutAscii';
import {monospace, StoreHeading} from './StoreStyles';

const columns = rows[0]?.length ?? 1;
const classNames: Record<string, string> = {f: 'face', s: 'side'};

// Consecutive cells on the same layer share a span, and each row ends in a
// newline; the art never changes, so the runs are worked out once.
const runs = rows.flatMap((row, r) => {
  const line: {key: string; className: string; text: string}[] = [];
  for (let c = 0; c < row.length; c++) {
    const className = classNames[layers[r]?.[c] ?? ''] ?? '';
    const last = line.at(-1);
    if (last?.className === className) last.text += row[c];
    else line.push({key: `${r}:${c}`, className, text: row[c] ?? ''});
  }
  line.push({key: `${r}:end`, className: '', text: '\n'});
  return line;
});

// The art sizes its font to fill the frame, so the frame sets its size.
const Frame = styled.div`
  width: min(100%, 360px);
  container-type: inline-size;
`;

const Art = styled.pre`
  margin: 0;
  color: #5c5c5c;
  font-family: ${monospace};
  font-size: calc(100cqw / ${columns} / ${ratio});
  font-variant-ligatures: none;
  letter-spacing: 0;
  line-height: 1;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;

  .side {
    color: #8c8c8c;
  }

  .face {
    color: #f2f2f2;
  }
`;

const CheckoutHeading = React.memo(() => (
  <StoreHeading>
    <Frame>
      <Art role="img" aria-label="checkout">
        {runs.map(({key, className, text}) =>
          className ? (
            <span key={key} className={className}>
              {text}
            </span>
          ) : (
            <React.Fragment key={key}>{text}</React.Fragment>
          )
        )}
      </Art>
    </Frame>
  </StoreHeading>
));

export default CheckoutHeading;
