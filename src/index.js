import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Route, Link } from "react-router-dom";
import './style/map.less';
import './style/devopsrockstars.less';
import skylineUrl from './image/chicago_skyline.svg';
import { Map, TileLayer } from 'react-leaflet'
import { useLocation } from "react-router-dom";


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

function FullScreenMap() {

  const getClassname = () => { 
    const location = useLocation();
    switch(location.pathname) { 
    case '/contact': 
      return 'visible';  
    default:
      return 'hidden';
    } 
  }

  return (
    <div id='mapdiv' className={`full-screen ${getClassname()}`}>
      <link
        rel="stylesheet"
        href="//cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css"
      />
      <link 
        rel="stylesheet" 
        href="//unpkg.com/leaflet@1.6.0/dist/leaflet.css"
      />
      <Map 
        attributionControl={false}
        center={[41.796242, -87.580913]} 
        zoom={11} 
        zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap2</a> contributors'
        />
      </Map>
    </div>
  )
}

function AppRouter() {
  return (
    <Router>
      {/* <NavigationTop /> */}
      <FullScreenMap/>
      <Route path="/" exact component={Index} />
      <div className="flex-container-row">
        <div className="flex-full-height-min">
          <div className="flex-container-column">
            
            <div className="flex-row-header">

              <div className="flex-container-row">
                <div className="flex-container-left">
                  <div className="menu-item-left">
                    <Link to="/">index</Link>
                  </div>
                </div>
                <div className="flex-container-right">
                  <div className="menu-item-right">
                    <Link to="/company">company</Link>
                  </div>
                  <div className="menu-item-right">
                    <Link to="/store">store</Link>
                  </div>
                  <div className="menu-item-right">
                    <Link to="/contact">contact</Link>
                  </div>
                </div>
              </div>

            </div>
            <div className="flex-row-body">
              <div className="flex-container-column">
                <Route path="/company" exact component={Company} />
                <Route path="/store" component={Store} />
                <Route path="/contact" component={Contact} />
              </div>
            </div>
            <div className="flex-row-footer">
              <div className="flex-container-row">
                <div className="flex-container-left">
                  <div className="menu-item-left">
                    <Link to="/">index</Link>
                  </div>
                </div>
                <div className="flex-container-center">
                  <div className="menu-item-center">
                    <Link to="/">index</Link>
                  </div>
                </div>
                <div className="flex-container-right">
                  <div className="menu-item-right">
                    <Link to="/store">kiva</Link>
                  </div>
                  <div className="menu-item-right">
                    <Link to="/contact">search</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* <NavigationBottom /> */}
    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById("©"));
