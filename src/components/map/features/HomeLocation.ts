import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Circle from 'ol/geom/Circle';
import { Style, Icon, Fill } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { calculateHorizonDistance } from '../utils/calculations';

export interface HomeLocationCoordinates {
  lat: number;
  lon: number;
}

export class HomeLocationFeature {
  private homeFeature: Feature<Point>;
  private horizonFeature: Feature<Circle> | null = null;
  private vectorSource: VectorSource;
  private horizonSource: VectorSource;

  constructor(vectorSource: VectorSource, horizonSource: VectorSource) {
    this.vectorSource = vectorSource;
    this.horizonSource = horizonSource;
    this.homeFeature = new Feature();
    this.setupHomeFeatureStyle();
  }

  private setupHomeFeatureStyle() {
    this.homeFeature.setStyle(
      new Style({
        image: new Icon({
          anchor: [0.5, 1],
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          src: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
          scale: 0.5
        })
      })
    );
  }

  public setLocation(coordinates: HomeLocationCoordinates) {
    const point = fromLonLat([coordinates.lon, coordinates.lat]);
    this.homeFeature.setGeometry(new Point(point));
    
    if (!this.vectorSource.hasFeature(this.homeFeature)) {
      this.vectorSource.addFeature(this.homeFeature);
    }
  }

  public updateHorizon(observerHeight: number) {
    if (this.horizonFeature) {
      this.horizonSource.removeFeature(this.horizonFeature);
    }

    const homeGeometry = this.homeFeature.getGeometry();
    if (!homeGeometry) return;

    const horizonDistanceKm = calculateHorizonDistance(observerHeight);
    const horizonDistanceM = horizonDistanceKm * 1000;
    const homePoint = homeGeometry.getCoordinates();

    const circleGeometry = new Circle(homePoint, horizonDistanceM);
    this.horizonFeature = new Feature({
      geometry: circleGeometry,
      properties: {
        animationTimestamp: Date.now()
      }
    });

    this.horizonFeature.setStyle(
      new Style({
        fill: new Fill({
          color: 'rgba(0, 70, 255, 0.33)'
        }),
        zIndex: 100
      })
    );

    this.horizonSource.addFeature(this.horizonFeature);
  }

  public getCoordinates(): HomeLocationCoordinates | null {
    const geometry = this.homeFeature.getGeometry();
    if (!geometry) return null;

    const coordinates = geometry.getCoordinates();
    const [lon, lat] = toLonLat(coordinates);
    return { lat, lon };
  }

  public getFeature(): Feature<Point> {
    return this.homeFeature;
  }

  public remove() {
    this.vectorSource.removeFeature(this.homeFeature);
    if (this.horizonFeature) {
      this.horizonSource.removeFeature(this.horizonFeature);
      this.horizonFeature = null;
    }
  }
} 