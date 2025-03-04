import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { defaults as defaultControls } from 'ol/control';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';

export interface MapLayers {
  vectorSource: VectorSource<Feature<Geometry>>;
  horizonSource: VectorSource<Feature<Geometry>>;
  lineSource: VectorSource<Feature<Geometry>>;
}

export function createMapLayers(): MapLayers {
  const vectorSource = new VectorSource<Feature<Geometry>>();
  const horizonSource = new VectorSource<Feature<Geometry>>({
    wrapX: false
  });
  const lineSource = new VectorSource<Feature<Geometry>>();

  return {
    vectorSource,
    horizonSource,
    lineSource
  };
}

export function initializeMap(
  target: string,
  layers: MapLayers
): Map {
  const { vectorSource, horizonSource, lineSource } = layers;

  const horizonLayer = new VectorLayer({
    source: horizonSource,
    zIndex: 1,
    properties: {
      name: 'horizonLayer'
    },
    updateWhileAnimating: true,
    updateWhileInteracting: true
  });

  const lineLayer = new VectorLayer({
    source: lineSource,
    zIndex: 2
  });

  const vectorLayer = new VectorLayer({
    source: vectorSource,
    zIndex: 3
  });

  return new Map({
    target,
    layers: [
      new TileLayer({
        source: new OSM()
      }),
      horizonLayer,
      lineLayer,
      vectorLayer
    ],
    view: new View({
      center: [0, 0],
      zoom: 2,
      maxZoom: 16,
      projection: 'EPSG:3857'
    }),
    controls: defaultControls()
  });
} 