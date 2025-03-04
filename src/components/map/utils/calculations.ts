export function isSatelliteVisible(
  observerLat: number,
  observerLon: number,
  observerAlt: number,
  satLat: number,
  satLon: number,
  satAlt: number
): boolean {
  const R = 6371; // Earth radius in kilometers
  
  const lat1 = observerLat * Math.PI / 180;
  const lon1 = observerLon * Math.PI / 180;
  const lat2 = satLat * Math.PI / 180;
  const lon2 = satLon * Math.PI / 180;
  
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  const h1 = observerAlt / 1000;
  const h2 = satAlt;
  
  const alpha = Math.acos((R + h1) / (R + h2));
  const beta = Math.acos(R / (R + h1));
  
  const centralAngle = distance / R;
  
  return centralAngle < (alpha + beta);
}

export function createCurvedLine(start: number[], end: number[], numPoints: number = 50): number[][] {
  const points: number[][] = [];
  const R = 6371; // Earth radius in km
  
  const lon1 = start[0] * Math.PI / 180;
  const lat1 = start[1] * Math.PI / 180;
  const lon2 = end[0] * Math.PI / 180;
  const lat2 = end[1] * Math.PI / 180;

  // Convert to 3D coordinates
  const x1 = R * Math.cos(lat1) * Math.cos(lon1);
  const y1 = R * Math.cos(lat1) * Math.sin(lon1);
  const z1 = R * Math.sin(lat1);

  const x2 = R * Math.cos(lat2) * Math.cos(lon2);
  const y2 = R * Math.cos(lat2) * Math.sin(lon2);
  const z2 = R * Math.sin(lat2);

  // Calculate midpoint with increased height
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const mz = (z1 + z2) / 2;
  const midLen = Math.sqrt(mx * mx + my * my + mz * mz);
  
  // Raise the midpoint to create curve
  const heightFactor = 1.2; // Adjust this to control curve height
  const raisedMidpoint = {
    x: (mx / midLen) * R * heightFactor,
    y: (my / midLen) * R * heightFactor,
    z: (mz / midLen) * R * heightFactor
  };

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // Quadratic Bezier curve
    const x = Math.pow(1 - t, 2) * x1 + 2 * (1 - t) * t * raisedMidpoint.x + Math.pow(t, 2) * x2;
    const y = Math.pow(1 - t, 2) * y1 + 2 * (1 - t) * t * raisedMidpoint.y + Math.pow(t, 2) * y2;
    const z = Math.pow(1 - t, 2) * z1 + 2 * (1 - t) * t * raisedMidpoint.z + Math.pow(t, 2) * z2;

    // Convert back to lat/lon
    const lon = Math.atan2(y, x);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));

    points.push([lon * 180 / Math.PI, lat * 180 / Math.PI]);
  }
  
  return points;
}

export function calculateSatelliteInfo(
  observerLat: number,
  observerLon: number,
  observerAlt: number,
  satLat: number,
  satLon: number,
  satAlt: number
) {
  const R = 6371;
  
  const lat1 = observerLat * Math.PI / 180;
  const lon1 = observerLon * Math.PI / 180;
  const lat2 = satLat * Math.PI / 180;
  const lon2 = satLon * Math.PI / 180;
  
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  const h1 = observerAlt / 1000;
  const h2 = satAlt;
  
  const slantRange = Math.sqrt(
    Math.pow(R + h2, 2) + 
    Math.pow(R + h1, 2) - 
    2 * (R + h2) * (R + h1) * Math.cos(c)
  );
  
  const r1 = R + h1;
  const r2 = R + h2;
  
  const zenithAngle = Math.acos(
    (Math.pow(slantRange, 2) + Math.pow(r1, 2) - Math.pow(r2, 2)) /
    (2 * slantRange * r1)
  );
  
  const elevationAngle = -(90 - (zenithAngle * 180 / Math.PI));

  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
           Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const azimuth = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  
  return {
    distance: slantRange,
    elevationAngle: elevationAngle,
    azimuth: azimuth
  };
}

export function calculateSatelliteHorizonPoints(
  satLat: number,
  satLon: number,
  satAlt: number,
  numPoints: number = 50
): number[][] {
  const R = 6371; // Earth radius in km
  const points: number[][] = [];
  
  // Calculate horizon distance where elevation angle is exactly 0 degrees
  const horizonDistance = R * Math.acos(R / (R + satAlt));
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    
    const lat1 = satLat * Math.PI / 180;
    const lon1 = satLon * Math.PI / 180;
    
    const angularDistance = horizonDistance / R;
    
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(angle)
    );
    
    const lon2 = lon1 + Math.atan2(
      Math.sin(angle) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );
    
    points.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  
  points.push(points[0]);
  return points;
}

export function calculateHorizonDistance(observerHeight: number): number {
  return 3.57 * Math.sqrt(observerHeight);
} 