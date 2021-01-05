import React from 'react'
import { useLocation } from "react-router-dom";
import { Map, TileLayer } from 'react-leaflet'
import L from 'leaflet';

const FullScreenMap = React.memo(function FullScreenMap(props) {

  const getClassname = () => {
    const location = useLocation();
    switch(location.pathname) {
    case '/contact':
      return 'visible';
    default:
      return 'hidden';
    }
  }


  const southWest = L.latLng(17.476, -126.386);
  const northEast = L.latLng(51.289, -44.472);
  const bounds = L.latLngBounds(southWest, northEast);

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
      {/* https://docs.mapbox.com/studio-manual/overview/publish-your-style/#mapboxjs-and-leaflet */}
      <Map
        attributionControl={false}
        center={[41.796242, -87.580913]}
        zoom={11}
        minZoom={5}
        zoomControl={false}
        maxBounds={bounds}>
        <TileLayer
          url="https://api.mapbox.com/styles/v1/devopsrockstars/ckhobopaz1o8519lupxgprhji/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoiZGV2b3Bzcm9ja3N0YXJzIiwiYSI6InpUN3Buak0ifQ.a9f4FaZbPCK6GNJc8ImH7w"
          attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap2</a> contributors'
        />
      </Map>
    </div>
  )
});

export default FullScreenMap
