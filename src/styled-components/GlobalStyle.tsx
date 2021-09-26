import { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  :root {
    --hover-color: gray;
    --foreground-color: white;
  }

  body {
    background-color: black;
    color: var(--foreground-color);
    margin:0;
    font-family: Open-Sans, Helvetica, Sans-Serif;
    font-size: 20px;
  }

  a {
    color: var(--foreground-color);
  }

  a:hover {
    color: var(--hover-color);
    pointer-events: auto;
  }

  p {
    margin: 0;
  }

  h1 {
    margin-top: 35px;
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
