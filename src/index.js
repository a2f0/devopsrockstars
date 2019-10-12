import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Link } from "react-router-dom";
import './style/devopsrockstars.less';
import skylineUrl from './image/chicago_skyline.svg';


function Index() {
  return (
    <div className='full-screen'>
      <img className='fill-container' src={skylineUrl} alt="skyline" />
    </div>  
  );
}

function Company() {
  return (
    <div>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
      <p>long text</p>
    </div>
  );
}

function Store() {
  return <h2>Store</h2>;
}

function Contact() {
  return <h2>Contact</h2>;
}

function NavigationTop() {
  return (
    <div className="navbar navbar-top">
      <div className="flex-container">
        <div className="flex-max-width">
          <div className="flex-container">
            <div className="flex">
              <div className="flex-container-left">
                <div className="menu-item">
                  <Link to="/">Index</Link>
                </div>
              </div>
            </div>
            <div className="flex">
              <div className="flex-container-right">
                <div className="menu-item">
                  <Link to="/company/">Kiva</Link>
                </div>
                <div className="menu-item">
                  <Link to="/store/">Store</Link>
                </div>
                <div className="menu-item">
                  <Link to="/contact/">Contact</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NavigationBottom() {
  return (
    <div className="navbar navbar-bottom">
      <div className="flex-container">
        <div className="flex-max-width">
          <div className="flex-container">
            <div className="flex">
              <div className="flex-container-left">
                <div className="menu-item">
                  <Link to="/">DevOpsRockstars, LLC</Link>
                </div>
              </div>
            </div>
            <div className="flex">
              <div className="flex-container">
                <div className="menu-item">
                  <Link to="/">Index</Link>
                </div>
              </div>
            </div>
            <div className="flex">
              <div className="flex-container-right">
                <div className="menu-item">
                  <Link to="/company/">Kiva</Link>
                </div>
                <div className="menu-item">
                  <Link to="/store/">Search</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AppRouter() {
  return (
    <Router>
      <NavigationTop />
      <div className="flex-container">
        <div className="flex-max-width">
          <Route path="/" exact component={Index} />
          <Route path="/company/" exact component={Company} />
          <Route path="/store/" component={Store} />
          <Route path="/contact/" component={Contact} />
        </div>
      </div>
      <NavigationBottom />
    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById("©"));
