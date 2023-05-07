var m_ol_map = new Map({
    target: 'mapid',
    layers: [
        new TileLayer({
            source: new OSM()
        })
    ],
    view: new View({
        center: fromLonLat([139, 35]), 
        zoom: 2
    })
});