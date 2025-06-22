import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const contentProcessingTime = new Trend('content_processing_time');

// Test configuration
export const options = {
  scenarios: {
    // Smoke test - minimal load
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { test_type: 'smoke' },
    },
    
    // Load test - normal expected load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },   // Ramp up
        { duration: '5m', target: 10 },   // Stay at 10 users
        { duration: '2m', target: 20 },   // Ramp up to 20 users
        { duration: '5m', target: 20 },   // Stay at 20 users
        { duration: '2m', target: 0 },    // Ramp down
      ],
      tags: { test_type: 'load' },
    },
    
    // Stress test - above normal load
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },   // Ramp up to 20 users
        { duration: '5m', target: 20 },   // Stay at 20 users
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '5m', target: 100 },  // Stay at 100 users
        { duration: '10m', target: 0 },   // Ramp down
      ],
      tags: { test_type: 'stress' },
    },
  },
  
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.1'],    // Error rate must be below 10%
    errors: ['rate<0.1'],             // Custom error rate below 10%
    content_processing_time: ['p(95)<1000'], // 95% of content processing below 1s
  },
};

// Base URL - can be overridden via environment variable
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test data
const TEST_CONTENT = {
  text: [
    'This is a normal message',
    'Hello world, how are you today?',
    'I love this product, it works great!',
    'The weather is nice today',
    'Looking forward to the weekend',
  ],
  toxic: [
    // Note: These are mild examples for testing purposes
    'This is stupid',
    'I hate this',
    'This sucks',
  ],
};

// Authentication token (in real scenario, this would be obtained via login)
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

export function setup() {
  // Setup phase - run once before all VUs
  console.log('Starting load test against:', BASE_URL);
  
  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Health check failed: ${healthRes.status}`);
  }
  
  console.log('Health check passed, starting load test...');
  return { baseUrl: BASE_URL };
}

export default function (data) {
  // Main test function - runs for each VU iteration
  
  // Test 1: Health check
  testHealthCheck(data.baseUrl);
  
  // Test 2: Submit text content
  testTextContentSubmission(data.baseUrl);
  
  // Test 3: Submit potentially toxic content
  testToxicContentSubmission(data.baseUrl);
  
  // Test 4: Submit image content (base64 encoded)
  testImageContentSubmission(data.baseUrl);
  
  // Sleep between iterations
  sleep(1);
}

function testHealthCheck(baseUrl) {
  const response = http.get(`${baseUrl}/health`);
  
  const success = check(response, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 200ms': (r) => r.timings.duration < 200,
    'health check has correct content type': (r) => 
      r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json'),
  });
  
  if (!success) {
    errorRate.add(1);
  }
}

function testTextContentSubmission(baseUrl) {
  const content = TEST_CONTENT.text[Math.floor(Math.random() * TEST_CONTENT.text.length)];
  
  const payload = JSON.stringify({
    content: content,
    contentType: 'text',
    userId: `user-${__VU}-${__ITER}`,
    metadata: {
      source: 'load-test',
      sessionId: `session-${__VU}`,
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  };
  
  const startTime = Date.now();
  const response = http.post(`${baseUrl}/api/v1/content`, payload, params);
  const endTime = Date.now();
  
  contentProcessingTime.add(endTime - startTime);
  
  const success = check(response, {
    'text submission status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'text submission response time < 1000ms': (r) => r.timings.duration < 1000,
    'text submission has request ID': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.requestId !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  if (!success) {
    errorRate.add(1);
    console.log(`Text submission failed: ${response.status} - ${response.body}`);
  }
}

function testToxicContentSubmission(baseUrl) {
  const content = TEST_CONTENT.toxic[Math.floor(Math.random() * TEST_CONTENT.toxic.length)];
  
  const payload = JSON.stringify({
    content: content,
    contentType: 'text',
    userId: `user-${__VU}-${__ITER}`,
    metadata: {
      source: 'load-test-toxic',
      sessionId: `session-${__VU}`,
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  };
  
  const startTime = Date.now();
  const response = http.post(`${baseUrl}/api/v1/content`, payload, params);
  const endTime = Date.now();
  
  contentProcessingTime.add(endTime - startTime);
  
  const success = check(response, {
    'toxic content submission status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'toxic content response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  if (!success) {
    errorRate.add(1);
  }
}

function testImageContentSubmission(baseUrl) {
  // Simple 1x1 pixel PNG image as base64
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  
  const payload = JSON.stringify({
    content: base64Image,
    contentType: 'image',
    userId: `user-${__VU}-${__ITER}`,
    metadata: {
      source: 'load-test-image',
      sessionId: `session-${__VU}`,
      mimeType: 'image/png',
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  };
  
  const startTime = Date.now();
  const response = http.post(`${baseUrl}/api/v1/content`, payload, params);
  const endTime = Date.now();
  
  contentProcessingTime.add(endTime - startTime);
  
  const success = check(response, {
    'image submission status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    'image submission response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  
  if (!success) {
    errorRate.add(1);
  }
}

export function teardown(data) {
  // Teardown phase - run once after all VUs complete
  console.log('Load test completed');
  
  // Final health check
  const healthRes = http.get(`${data.baseUrl}/health`);
  console.log(`Final health check: ${healthRes.status}`);
}

export function handleSummary(data) {
  // Custom summary - can export results to files
  return {
    'test-results/summary.json': JSON.stringify(data, null, 2),
    'test-results/summary.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Load Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .pass { background-color: #d4edda; }
        .fail { background-color: #f8d7da; }
    </style>
</head>
<body>
    <h1>Abuse Detection System - Load Test Results</h1>
    <h2>Summary</h2>
    <div class="metric">
        <strong>Total Requests:</strong> ${data.metrics.http_reqs.count}
    </div>
    <div class="metric">
        <strong>Failed Requests:</strong> ${data.metrics.http_req_failed.count}
    </div>
    <div class="metric">
        <strong>Average Response Time:</strong> ${data.metrics.http_req_duration.avg.toFixed(2)}ms
    </div>
    <div class="metric">
        <strong>95th Percentile Response Time:</strong> ${data.metrics.http_req_duration['p(95)'].toFixed(2)}ms
    </div>
    <h2>Thresholds</h2>
    ${Object.entries(data.thresholds).map(([name, threshold]) => 
      `<div class="metric ${threshold.ok ? 'pass' : 'fail'}">
         <strong>${name}:</strong> ${threshold.ok ? 'PASS' : 'FAIL'}
       </div>`
    ).join('')}
</body>
</html>`;
}

function textSummary(data, options) {
  return `
=====================================
  ABUSE DETECTION SYSTEM LOAD TEST
=====================================

Summary:
  Total Requests: ${data.metrics.http_reqs.count}
  Failed Requests: ${data.metrics.http_req_failed.count} (${(data.metrics.http_req_failed.rate * 100).toFixed(2)}%)
  
Response Times:
  Average: ${data.metrics.http_req_duration.avg.toFixed(2)}ms
  Median:  ${data.metrics.http_req_duration.med.toFixed(2)}ms
  95th Percentile: ${data.metrics.http_req_duration['p(95)'].toFixed(2)}ms
  99th Percentile: ${data.metrics.http_req_duration['p(99)'].toFixed(2)}ms

Thresholds:
${Object.entries(data.thresholds).map(([name, threshold]) => 
  `  ${name}: ${threshold.ok ? '✓ PASS' : '✗ FAIL'}`
).join('\n')}

=====================================
`;
} 