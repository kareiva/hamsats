import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import { Style, Icon, Fill, Stroke, Text } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { getLatLngObj, getSatelliteInfo } from 'tle.js';
// @ts-ignore
import satelliteIcon from '@/assets/satellite.svg';
import { createCurvedLine, calculateSatelliteHorizonPoints, calculateSatelliteInfo } from '../utils/calculations';
import type { HomeLocationCoordinates } from './HomeLocation';

export interface SatellitePosition {
  lat: number;
  lng: number;
  height: number;
}

export interface SatelliteInfo {
  distance: number;
  elevationAngle: number;
  azimuth: number;
}

export class SatelliteFeature {
  private satelliteFeature: Feature<Point>;
  private horizonFeature: Feature<Polygon>;
  private lineOfSightFeature: Feature<LineString>;
  private pathFeatures: Feature[] = [];
  private satelliteToPathLine: Feature<LineString>;
  private vectorSource: VectorSource;
  private lineSource: VectorSource;
  private tle: [string, string];
  private name: string;
  private showPath: boolean = false;
  private updateInterval: number | null = null;
  private pathUpdateInterval: number | null = null;

  constructor(
    name: string,
    tle: [string, string],
    vectorSource: VectorSource,
    lineSource: VectorSource
  ) {
    this.name = name;
    this.tle = tle;
    this.vectorSource = vectorSource;
    this.lineSource = lineSource;

    this.satelliteFeature = new Feature();
    this.horizonFeature = new Feature();
    this.lineOfSightFeature = new Feature();
    this.satelliteToPathLine = new Feature();

    this.setupStyles();
    this.addFeaturesToSources();
  }

  private setupStyles() {
    this.satelliteFeature.setStyle([
      new Style({
        image: new Icon({
          src: satelliteIcon,
          scale: 1.5,
          anchor: [0.5, 0.5],
          rotation: Math.PI / 4
        })
      }),
      new Style({
        text: new Text({
          text: this.name,
          font: '14px monospace',
          fill: new Fill({ color: '#388E3C' }),
          stroke: new Stroke({ color: 'white', width: 3 }),
          backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
          padding: [5, 5, 5, 5],
          offsetX: 20,
          textAlign: 'left',
          textBaseline: 'middle'
        })
      })
    ]);

    this.horizonFeature.setStyle(
      new Style({
        fill: new Fill({ color: 'rgba(255, 193, 7, 0.2)' }),
        stroke: new Stroke({
          color: 'rgba(255, 193, 7, 0.5)',
          width: 1
        })
      })
    );

    this.lineOfSightFeature.setStyle(
      new Style({
        stroke: new Stroke({
          color: 'rgba(56, 142, 60, 0.8)',
          width: 2,
          lineDash: [4, 4]
        }),
        text: new Text({
          font: '12px monospace',
          fill: new Fill({ color: '#388E3C' }),
          stroke: new Stroke({ color: 'white', width: 3 }),
          backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
          padding: [5, 5, 5, 5],
          placement: 'line',
          textBaseline: 'bottom',
          offsetY: -10
        })
      })
    );

    this.satelliteToPathLine.setStyle(
      new Style({
        stroke: new Stroke({
          color: 'rgba(128, 128, 128, 0.4)',
          width: 2
        })
      })
    );
  }

  private addFeaturesToSources() {
    this.vectorSource.addFeature(this.satelliteFeature);
    this.vectorSource.addFeature(this.horizonFeature);
    this.lineSource.addFeature(this.lineOfSightFeature);
    this.vectorSource.addFeature(this.satelliteToPathLine);
  }

  public getCurrentPosition(): SatellitePosition {
    const now = Date.now();
    const position = getLatLngObj(this.tle, now);
    const satInfo = getSatelliteInfo(this.tle, now);
    return { ...position, height: satInfo.height };
  }

  public updatePosition(homeLocation?: HomeLocationCoordinates, observerHeight?: number): SatelliteInfo | null {
    const position = this.getCurrentPosition();
    const point = fromLonLat([position.lng, position.lat]);
    this.satelliteFeature.setGeometry(new Point(point));

    // Update horizon
    const horizonPoints = calculateSatelliteHorizonPoints(position.lat, position.lng, position.height);
    const mapHorizonPoints = horizonPoints.map(point => fromLonLat(point));
    this.horizonFeature.setGeometry(new Polygon([mapHorizonPoints]));

    // Update line of sight if home location is set
    let satelliteInfo: SatelliteInfo | null = null;
    if (homeLocation && observerHeight !== undefined) {
      const curvedPoints = createCurvedLine(
        [homeLocation.lon, homeLocation.lat],
        [position.lng, position.lat]
      );
      const mapPoints = curvedPoints.map(point => fromLonLat(point));
      this.lineOfSightFeature.setGeometry(new LineString(mapPoints));

      satelliteInfo = calculateSatelliteInfo(
        homeLocation.lat,
        homeLocation.lon,
        observerHeight,
        position.lat,
        position.lng,
        position.height
      );

      // Update line of sight text
      const style = this.lineOfSightFeature.getStyle() as Style;
      const text = style.getText();
      if (text) {
        text.setText(
          `${satelliteInfo.distance.toFixed(0)}km | ${satelliteInfo.elevationAngle.toFixed(1)}° | ${satelliteInfo.azimuth.toFixed(1)}°`
        );
      }
    }

    // Update connecting line to first prediction point
    if (this.showPath && this.pathFeatures.length > 0) {
      const firstPrediction = this.pathFeatures[0].getGeometry();
      if (firstPrediction && firstPrediction instanceof LineString) {
        const firstPoint = firstPrediction.getFirstCoordinate();
        this.satelliteToPathLine.setGeometry(new LineString([point, firstPoint]));
      }
    }

    return satelliteInfo;
  }

  public updatePath() {
    if (!this.showPath) return;

    // Clear existing path features
    this.clearPath();

    const now = Date.now();
    const linePoints: number[][] = [];
    const segments: number[][][] = [];
    let currentSegment: number[][] = [];
    
    // Calculate future positions
    for (let i = 0; i < 100; i++) {
      const futureTime = now + i * 60000; // One minute intervals
      const position = getLatLngObj(this.tle, futureTime);
      const point = [position.lng, position.lat];
      linePoints.push(point);

      // Handle segment creation
      if (currentSegment.length === 0) {
        currentSegment.push(point);
      } else {
        const lastPoint = currentSegment[currentSegment.length - 1];
        const deltaLon = point[0] - lastPoint[0];
        
        // If longitude difference is greater than 180 degrees, we're crossing the meridian
        if (Math.abs(deltaLon) > 180) {
          // End current segment
          if (currentSegment.length > 1) {
            segments.push([...currentSegment]);
          }
          // Start new segment
          currentSegment = [point];
        } else {
          currentSegment.push(point);
        }
      }
    }
    
    // Add the last segment if it has points
    if (currentSegment.length > 1) {
      segments.push(currentSegment);
    }

    // Create path features for each segment
    segments.forEach(segment => {
      const mapPoints = segment.map(point => fromLonLat(point));
      const pathFeature = new Feature<LineString>({
        geometry: new LineString(mapPoints)
      });

      pathFeature.setStyle(new Style({
        stroke: new Stroke({
          color: 'rgba(128, 128, 128, 0.8)',
          width: 2,
          lineDash: [4, 4]
        })
      }));

      this.lineSource.addFeature(pathFeature);
      this.pathFeatures.push(pathFeature);
    });

    // Add markers at 5-minute intervals, but check for meridian crossing
    for (let i = 0; i < linePoints.length; i += 5) {
      const point = linePoints[i];
      
      // Only add marker if it's part of a valid segment
      const isValidMarker = segments.some(segment => 
        segment.some(segPoint => 
          Math.abs(segPoint[0] - point[0]) < 180 && 
          Math.abs(segPoint[1] - point[1]) < 90
        )
      );

      if (isValidMarker) {
        const mapPoint = fromLonLat(point);
        const markerFeature = new Feature<Point>({
          geometry: new Point(mapPoint)
        });

        const minutes = i;
        markerFeature.setStyle(new Style({
          image: new Icon({
            src: satelliteIcon,
            scale: 0.5,
            anchor: [0.5, 0.5],
            rotation: Math.PI / 4
          }),
          text: new Text({
            text: `+${minutes}m`,
            font: '12px monospace',
            fill: new Fill({ color: '#388E3C' }),
            stroke: new Stroke({ color: 'white', width: 3 }),
            backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
            padding: [2, 2, 2, 2],
            offsetX: 15,
            textAlign: 'left',
            textBaseline: 'middle'
          })
        }));

        this.lineSource.addFeature(markerFeature);
        this.pathFeatures.push(markerFeature);
      }
    }
  }

  public startTracking(homeLocation?: HomeLocationCoordinates, observerHeight?: number) {
    this.updatePosition(homeLocation, observerHeight);
    this.updateInterval = window.setInterval(() => {
      this.updatePosition(homeLocation, observerHeight);
    }, 1000);

    if (this.showPath) {
      this.updatePath();
      this.pathUpdateInterval = window.setInterval(() => {
        this.updatePath();
      }, 60000);
    }
  }

  public setUpdateInterval(interval: number) {
    this.updateInterval = interval;
  }

  public stopTracking() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.pathUpdateInterval) {
      clearInterval(this.pathUpdateInterval);
      this.pathUpdateInterval = null;
    }

    this.remove();
  }

  public setShowPath(show: boolean): void {
    this.showPath = show;
    if (show) {
      this.updatePath();
      if (!this.pathUpdateInterval) {
        this.pathUpdateInterval = window.setInterval(() => this.updatePath(), 60000);
      }
    } else {
      if (this.pathUpdateInterval) {
        window.clearInterval(this.pathUpdateInterval);
        this.pathUpdateInterval = null;
      }
      this.clearPath();
    }
  }

  private clearPath() {
    this.pathFeatures.forEach(feature => {
      this.lineSource.removeFeature(feature);
    });
    this.pathFeatures = [];
    
    // Also remove the connecting line to the path
    if (this.satelliteToPathLine) {
      this.vectorSource.removeFeature(this.satelliteToPathLine);
    }
  }

  private remove() {
    // Remove all features from their respective sources
    if (this.satelliteFeature) {
      this.vectorSource.removeFeature(this.satelliteFeature);
    }
    if (this.horizonFeature) {
      this.vectorSource.removeFeature(this.horizonFeature);
    }
    if (this.lineOfSightFeature) {
      this.lineSource.removeFeature(this.lineOfSightFeature);
    }
    if (this.satelliteToPathLine) {
      this.vectorSource.removeFeature(this.satelliteToPathLine);
    }
    
    // Clear all path features
    this.clearPath();
  }
} 