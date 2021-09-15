import { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  body {
    background-color: black;
    color: white;
    margin:0;
    font-family: Open-Sans, Helvetica, Sans-Serif;
  }

  a {
    color: white;
    font-size: 24px;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  p {
    margin: 0;
    font-size: 20px;
  }

  h1 {
    margin-top: 50px;
    margin-right: 0px;
    margin-left: 0px;
    margin-bottom: 0px;
    font-size: 22px;
  }

  html { pointer-events: none;
    margin-left: calc(100vw - 100%);
    margin-right: 0;
  }
`;

export default GlobalStyle;
