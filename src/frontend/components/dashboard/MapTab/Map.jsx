/* eslint-disable react/prop-types */
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { pointsWithinPolygon } from '@turf/turf';

import './MapTab.css';

import mapboxStyle from './mapboxStyle';
import MapTooltip from './MapTooltip.jsx';
mapboxgl.accessToken = process.env.PIECEWISE_MAPBOX_KEY;

// eslint-disable-next-line react/prop-types
export default function Map({
  currentFeature: currentFeatureProp,
  currentGeography,
  currentLayer,
  currentTestAspect,
  fillDomain,
  fillRange,
  radiusDomain,
  radiusRange,
  setCurrentFeature,
  setCurrentFeatureSubmissions,
  submissions,
}) {
  const [geojson, setGeojson] = useState(null);
  const [map, setMap] = useState(null);
  const currentFeature = useRef(currentFeatureProp);
  const [hoveredSubmission, setHoveredSubmission] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState([null, null]);
  const mapContainer = useRef(null);

  const initializeMap = ({ setMap, mapContainer }) => {
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapboxStyle,
    });

    map.on('load', () => {
      setMap(map);
      map.resize();

      map.addSource('submissions', {
        type: 'geojson',
        data: geojson,
      });

      map.addLayer({
        id: 'submissions',
        type: 'circle',
        source: 'submissions',
        paint: {
          'circle-radius': 4,
          'circle-color': 'rgb(94, 66, 166)',
          'circle-opacity': 0.6,
          'circle-stroke-color': 'rgb(47, 35, 77)',
          'circle-stroke-width': 1,
        },
      });

      map.addLayer({
        id: 'current-submission',
        type: 'circle',
        source: 'submissions',
        paint: {
          'circle-radius': 4,
          'circle-color': 'rgb(94, 66, 166)',
          'circle-opacity': 1,
          'circle-stroke-color': 'rgb(47, 35, 77)',
          'circle-stroke-width': 1,
        },
        filter: ['==', ['get', 'id'], 'nosuchsubmission'],
      });
    });
  };

  const handleMapClick = e => {
    const { x, y } = e.point;
    const features = map.queryRenderedFeatures([x, y], {
      layers: [`${currentGeography}-data`],
    });
    const clickedFeature = features[0];

    if (!clickedFeature) return;

    console.log('props', clickedFeature.properties);

    const { fips: clickedFeatureFips } = clickedFeature.properties;
    const currentFeatureFips =
      currentFeature && currentFeature.properties
        ? currentFeature.properties.fips
        : null;

    // console.log('map clicked', {
    //   clickedFeatureFips,
    //   currentFeatureFips,
    //   currentFeature,
    // });

    if (clickedFeatureFips === currentFeatureFips) {
      setCurrentFeature(null);
      map.setFilter('clicked', null);
      return;
    }

    const clickedFeatureJSON = clickedFeature.toJSON();
    // console.log({ clickedFeatureJSON, geojson });
    setCurrentFeature(clickedFeatureJSON);
    map.setFilter('clicked', ['==', ['get', 'fips'], clickedFeatureFips]);

    const submissionsWithin = pointsWithinPolygon(geojson, clickedFeatureJSON);
    setCurrentFeatureSubmissions(submissionsWithin);
  };

  // convert submission to geojson
  useEffect(() => {
    if (!submissions) return;

    // eslint-disable-next-line react/prop-types
    const allPoints = submissions.map(point => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        id: point.id,
        isp_user: point.survey_service_type,
        other_isp: point.survey_service_type_other,
        cost_of_service: point.survey_current_cost,
        advertised_download: point.survey_subscribe_download,
        advertised_upload: point.survey_subscribe_upload,
        actual_download: point.actual_download,
        actual_upload: point.actual_upload,
        min_rtt: point.min_rtt,
      },
    }));

    setGeojson({
      type: 'FeatureCollection',
      features: allPoints,
    });
  }, [submissions]);

  // load up the map, should just happen once in the beginning
  useEffect(() => {
    if (geojson && !map) {
      initializeMap({
        setMap,
        mapContainer,
      });
    }

    window.XXX = map;
  }, [geojson, map]);

  // once the map is set up and loaded, set up the pointer events handlers
  useEffect(() => {
    if (!map) return;

    map.on('click', handleMapClick);

    // Change the cursor to a pointer when the mouse is over the places layer.
    map.on('mouseenter', 'points', function() {
      map.getCanvas().style.cursor = 'pointer';
    });

    // Change it back to a pointer when it leaves.
    map.on('mouseleave', 'points', function() {
      map.getCanvas().style.cursor = '';
    });

    map.on('mouseenter', 'submissions', function(e) {
      const { features, point } = e;
      const { properties } = features[0];
      const { id } = properties;

      setHoveredSubmission(properties);
      setTooltipPosition([point.x, point.y]);
      map.setFilter('current-submission', ['==', ['get', 'id'], id]);
    });

    map.on('mouseleave', 'submissions', function() {
      setHoveredSubmission(null);
      setTooltipPosition([null, null]);
      map.setFilter('current-submission', [
        '==',
        ['get', 'id'],
        'nosuchsubmission',
      ]);
    });
  }, [map]);

  // change the outlines between counties and census blocks
  useEffect(() => {
    if (!map) return;

    ['counties', 'blocks'].forEach(layerId => {
      const fillLayer = `${layerId}-fill`;
      const strokeLayer = `${layerId}-stroke`;

      if (layerId !== currentGeography) {
        map.setFilter(fillLayer, ['==', ['get', 'name'], 'nosuchthing']);
        map.setFilter(strokeLayer, ['==', ['get', 'name'], 'nosuchthing']);
      } else {
        map.setFilter(fillLayer, null);
        map.setFilter(strokeLayer, null);
      }
    });
  }, [currentGeography]);

  // update color of geographic units depending on which info is selected
  useEffect(() => {
    if (!map) return;

    if (!currentLayer) {
      map.setPaintProperty('counties-data', 'fill-color', '#ECE1CB');
      return;
    }

    map.setPaintProperty('counties-data', 'fill-opacity', 1);

    map.setPaintProperty('counties-data', 'fill-color', [
      'case',
      ['has', currentLayer],
      [
        'interpolate',
        ['linear'],
        ['get', currentLayer],
        fillDomain[0],
        fillRange[0],
        fillDomain[1],
        fillRange[1],
      ],
      'white',
    ]);
  }, [currentLayer, fillDomain, fillRange]);

  // update submission circles
  useEffect(() => {
    if (!map) return;

    if (
      [
        'actual_download',
        'actual_upload',
        'advertised_download',
        'advertised_upload',
      ].includes(currentTestAspect)
    ) {
      map.setPaintProperty('submissions', 'circle-radius', [
        'interpolate',
        ['linear'],
        ['get', currentTestAspect],
        radiusDomain[0],
        radiusRange[0],
        radiusDomain[1],
        radiusRange[1] / 2, // this division by two is just because it seems like mapbox doesn't use pixels
      ]);
      // update the layer used for styling the hover circle too
      map.setPaintProperty('current-submission', 'circle-radius', [
        'interpolate',
        ['linear'],
        ['get', currentTestAspect],
        radiusDomain[0],
        radiusRange[0],
        radiusDomain[1],
        radiusRange[1] / 2, // this division by two is just because it seems like mapbox doesn't use pixels
      ]);
    } else {
      map.setPaintProperty('submissions', 'circle-radius', 4);
      map.setPaintProperty('current-submission', 'circle-radius', 4);
    }
  }, [currentTestAspect, radiusDomain, radiusRange]);

  return (
    <div style={{ position: 'relative' }}>
      <div id="map" ref={el => (mapContainer.current = el)} />
      {hoveredSubmission && (
        <MapTooltip
          submission={hoveredSubmission}
          left={tooltipPosition[0] + 20}
          top={tooltipPosition[1] + 10}
          width={300}
        />
      )}
    </div>
  );
}