import {Link} from 'react-router';
import styled from 'styled-components';

export const StoreShell = styled.section`
  width: 100%;
  padding: 8px 0 48px;
  pointer-events: auto;
`;

// The store page centers its whole column; checkout and the receipt stay
// left-aligned around their forms.
export const StorePage = styled(StoreShell)`
  text-align: center;
`;

export const StoreHeading = styled.h1`
  margin-bottom: 28px;
  font-size: clamp(28px, 5vw, 52px);
  font-weight: 400;
  letter-spacing: -0.04em;
`;

export const Eyebrow = styled.div`
  margin-bottom: 8px;
  color: #aaa;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
`;

export const ProductGrid = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
  text-align: center;
`;

export const ProductArt = styled.div`
  width: 100%;
  min-height: 320px;
  display: grid;
  place-items: center;
  background: transparent;

  img {
    display: block;
    width: min(100%, 560px);
    max-height: 440px;
    object-fit: contain;
  }

  @media (max-width: 520px) {
    min-height: 220px;
  }
`;

export const ProductDetails = styled.div`
  width: min(100%, 280px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 18px;
`;

export const ProductCopy = styled.p`
  color: #c7c7c7;
  font-size: 16px;
  line-height: 1.5;
`;

export const Price = styled.div`
  font-size: 24px;
`;

export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: #bbb;
  font-size: 13px;
`;

const controlStyles = `
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #666;
  border-radius: 0;
  background: #080808;
  color: white;
  font: inherit;
  font-size: 15px;
  padding: 10px 11px;
  pointer-events: auto;

  &:focus {
    border-color: white;
    outline: none;
  }
`;

export const Input = styled.input`
  ${controlStyles}
`;

export const Select = styled.select`
  ${controlStyles}
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, white 50%),
    linear-gradient(135deg, white 50%, transparent 50%);
  background-position:
    calc(100% - 15px) 50%,
    calc(100% - 10px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
`;

export const Button = styled.button`
  min-height: 42px;
  border: 1px solid #aaa;
  border-radius: 0;
  background: #101010;
  color: white;
  font: inherit;
  font-size: 14px;
  padding: 9px 18px;
  cursor: pointer;
  pointer-events: auto;

  &:hover:not(:disabled),
  &:focus-visible {
    border-color: white;
    background: #1a1a1a;
  }

  &:disabled {
    border-color: #444;
    color: #666;
    cursor: not-allowed;
  }
`;

export const ActionLink = styled(Link)`
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1px solid #aaa;
  color: white;
  font-size: 14px;
  padding: 9px 18px;
  text-decoration: none;
  pointer-events: auto;

  &:hover,
  &:focus-visible {
    border-color: white;
    color: white;
    background: #1a1a1a;
  }
`;

export const CartPanel = styled.aside`
  width: min(100%, 460px);
  margin: 42px auto 0;
  border-top: 1px solid #4d4d4d;
  padding-top: 16px;
  text-align: left;
`;

export const CartRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 20px;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid #242424;
  font-size: 15px;

  button {
    border: 0;
    background: none;
    color: white;
    font: inherit;
    font-size: 13px;
    text-decoration: underline;
    cursor: pointer;
  }
`;

export const CartActions = styled.div`
  margin-top: 16px;
  display: flex;
  justify-content: center;
`;

export const CheckoutGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1.05fr) minmax(250px, 0.95fr);
  gap: 42px;
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

export const Section = styled.section`
  min-width: 0;
`;

export const SectionTitle = styled.h2`
  margin: 0 0 18px;
  padding-bottom: 7px;
  border-bottom: 1px solid #4d4d4d;
  font-size: 18px;
  font-weight: 400;
`;

export const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

export const FullField = styled(Field)`
  grid-column: 1 / -1;
`;

export const FormActions = styled.div`
  margin-top: 20px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
`;

export const OrderSummary = styled.div`
  margin-bottom: 28px;
  color: #ccc;
  font-size: 14px;
`;

export const SummaryRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  padding: 7px 0;
  border-bottom: 1px solid #292929;
`;

export const Status = styled.p<{$error?: boolean}>`
  margin-top: 16px;
  color: ${({$error}) => ($error ? '#ff8a8a' : '#aaa')};
  font-size: 14px;
  line-height: 1.4;
`;

export const PaymentHost = styled.div`
  min-height: 130px;
  margin-top: 8px;
`;

export const ReceiptPanel = styled.div`
  max-width: 620px;
  border-top: 1px solid #4d4d4d;
  padding-top: 20px;

  p + p {
    margin-top: 12px;
  }
`;
