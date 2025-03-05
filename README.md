# SatGazer

A web application for tracking amateur radio satellites.

## Features

- Real-time satellite tracking on an interactive map
- Satellite visibility prediction
- Transmitter information for amateur radio satellites
- Home location setting with elevation data

## Development

### Setup

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

### Building for Production

```bash
# Build for production
npm run build

# Preview the production build
npm run preview
```

## Transponder Data

The application uses transmitter data from the [SatNOGS DB](https://db.satnogs.org/). To reduce API requests and improve performance, the build process includes a step to prefetch transmitter data for all satellites in the `amateur.txt` file.

### How it works

1. The `fetch-transponders` script reads the `amateur.txt` file and extracts satellite catalog numbers
2. For each satellite, it fetches transmitter data from the SatNOGS API
3. The data is saved to JSON files in the `public/transponders/` directory
4. During runtime, the application loads transmitter data from these local files
5. If a local file is not found, the application falls back to the SatNOGS API

### Manual Transponder Data Update

To manually update the transponder data:

```bash
npm run fetch-transponders
```

This will fetch the latest transmitter data for all satellites in the `amateur.txt` file.

## URL Parameters

The application supports URL parameters for sharing specific views and improving SEO:

### Satellite Selection

- `id`: The NORAD catalog number of the satellite to track
  - Example: `https://www.hamsats.com/?id=25544` (tracks the ISS)

These URL parameters make it easy to share specific satellite tracking configurations and improve SEO by creating unique URLs for each satellite. 