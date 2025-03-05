import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Icon, Fill, Text, Stroke } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { getLatLngObj } from 'tle.js';
// @ts-ignore
import satelliteIcon from '@/assets/satellite.svg';
import type { Map as OlMap } from 'ol';

export interface NearestSatellite {
  name: string;
  tle: [string, string];
  distance?: number;
}

export class NearestSatellitesFeature {
  private features: Feature[] = [];
  private vectorSource: VectorSource;
  private updateInterval: number | null = null;
  private satellites: NearestSatellite[] = [];
  private map: OlMap | null = null;
  private onSatelliteClick: ((name: string) => void) | null = null;

  constructor(vectorSource: VectorSource) {
    this.vectorSource = vectorSource;
  }

  public setMap(map: OlMap) {
    this.map = map;
    this.setupClickHandler();
  }

  public setClickHandler(handler: (name: string) => void) {
    this.onSatelliteClick = handler;
  }

  private setupClickHandler() {
    if (!this.map) return;

    this.map.on('click', (event) => {
      if (!this.onSatelliteClick) return;

      const feature = this.map!.forEachFeatureAtPixel(event.pixel, (feature) => feature);
      if (feature && this.features.includes(feature as Feature)) {
        const name = (feature as Feature).get('satelliteName');
        if (name) {
          this.onSatelliteClick(name);
        }
      }
    });
  }

  public updateSatellites(nearestSatellites: NearestSatellite[]) {
    this.satellites = nearestSatellites.slice(0, 5);
    this.updatePositions();
  }

  private updatePositions() {
    // Remove old features
    this.features.forEach(feature => {
      this.vectorSource.removeFeature(feature);
    });
    this.features = [];

    // Create new features for each satellite
    this.satellites.forEach(satellite => {
      const position = getLatLngObj(satellite.tle);
      const point = fromLonLat([position.lng, position.lat]);
      
      const feature = new Feature({
        geometry: new Point(point),
        satelliteName: satellite.name
      });

      const distanceText = satellite.distance 
        ? ` (${satellite.distance.toFixed(0)}km)`
        : '';

      feature.setStyle([
        new Style({
          image: new Icon({
            src: satelliteIcon,
            scale: 1.2,
            anchor: [0.5, 0.5],
            rotation: Math.PI / 4
          })
        }),
        new Style({
          text: new Text({
            text: satellite.name + distanceText,
            font: '12px monospace',
            fill: new Fill({ color: '#666666' }),
            stroke: new Stroke({ color: 'white', width: 3 }),
            backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
            padding: [5, 5, 5, 5],
            offsetX: 15,
            textAlign: 'left',
            textBaseline: 'middle'
          })
        })
      ]);

      this.vectorSource.addFeature(feature);
      this.features.push(feature);
    });
  }

  public startTracking() {
    this.updatePositions();
    this.updateInterval = window.setInterval(() => {
      this.updatePositions();
    }, 1000);
  }

  public stopTracking() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.remove();
  }

  public remove() {
    this.features.forEach(feature => {
      this.vectorSource.removeFeature(feature);
    });
    this.features = [];
  }
} 