import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
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

// Same north-pointing arrow shape as arrowIconUri() in utils/icons.ts — replaces the
// Rotate control's default '⇧' text glyph (which renders inconsistently since this app
// doesn't load OpenLayers' own stylesheet/icon font) with a shape that visually points
// straight up/north at rotation 0, matching what clicking it actually does.
function createCompassLabel(): HTMLElement {
  const label = document.createElement('span');
  label.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">' +
    '<polygon points="12,2 18,20 12,16 6,20" fill="currentColor" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</svg>';
  return label;
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
        // CARTO Positron: light, minimal basemap with country/state borders and labels,
        // no roads or POI clutter until you zoom in much further than this app needs.
        source: new XYZ({
          url: 'https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          attributions: [
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
          ],
          crossOrigin: 'anonymous'
        })
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
    controls: defaultControls({
      zoom: false,
      rotateOptions: { label: createCompassLabel() }
    })
  });
} 