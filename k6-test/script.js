/* eslint-disable func-names */
/* eslint-disable import/no-unresolved */
/*
 * Graph Service
 * Graph Service API
 *
 * OpenAPI spec version: 1.0
 *
 * NOTE: This class is auto generated by OpenAPI Generator.
 * https://github.com/OpenAPITools/openapi-generator
 *
 * Generator version: 7.7.0-SNAPSHOT
 */

import http from 'k6/http';
import { group, check, sleep } from 'k6';

const BASE_URL = 'http://localhost:3000';
// Sleep duration between successive requests.
// You might want to edit the value of this variable or remove calls to the sleep function on the script.
const SLEEP_DURATION = 0.1;
// Global variables should be initialized.

export default function () {
  group('/api/update-graph', () => {
    // Request No. 1: ApiController_updateGraph
    const url = `${BASE_URL}/api/update-graph`;
    // TODO: edit the parameters of the request body.
    const body = { dsnpId: 'string', connections: { data: 'list' }, graphKeyPairs: 'list' };
    const params = { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
    const request = http.post(url, JSON.stringify(body), params);

    check(request, {
      'Graph update request created successfully': (r) => r.status === 201,
    });
  });

  group('/api/graphs', () => {
    // Request No. 1: ApiController_getGraphs
    const url = `${BASE_URL}/api/graphs`;
    // TODO: edit the parameters of the request body.
    const body = { dsnpIds: 'list', privacyType: 'string', graphKeyPairs: 'list' };
    const params = { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
    const request = http.put(url, JSON.stringify(body), params);

    check(request, {
      'Graphs retrieved successfully': (r) => r.status === 200,
    });
  });

  group('/api/health', () => {
    // Request No. 1: ApiController_health
    const url = `${BASE_URL}/api/health`;
    const request = http.get(url);

    check(request, {
      'Service is healthy': (r) => r.status === 200,
    });
  });

  group('/api/watch-graphs', () => {
    // Request No. 1: ApiController_watchGraphs
    const url = `${BASE_URL}/api/watch-graphs`;
    // TODO: edit the parameters of the request body.
    const body = { dsnpIds: 'list', webhookEndpoint: 'string' };
    const params = { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
    const request = http.put(url, JSON.stringify(body), params);

    check(request, {
      'Successfully started watching graphs': (r) => r.status === 200,
    });
  });
}
