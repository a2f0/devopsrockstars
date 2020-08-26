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
    <div id='mapdiv' className={getClassname()}>
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
        center={[45.4, -75.7]} 
        zoom={12} 
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
      {/* <FullScreenMap/> */}
      <div className="flex-container-row">
        <div className="flex-full-height-min">
          <div className="flex-container-column">
            
            <div className="flex-row-header">

              <div className="flex-container-row">

                header

              </div>

            </div>
            <div className="flex-row-body">
              <div className="flex-container-column">
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
                <div>long text</div>
              </div>
            </div>
            <div className="flex-row-footer">
              here
            </div>
          </div>
        </div>
      </div>

      {/* <NavigationBottom /> */}
    </Router>
  );
}
ReactDOM.render(<AppRouter />, document.getElementById("©"));
