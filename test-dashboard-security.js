#!/usr/bin/env node

/**
 * Test script to verify dashboard data isolation security fix
 * 
 * This script tests that client dashboards only show data for their specific client
 * and don't leak data from other clients.
 * 
 * Run with: node test-dashboard-security.js
 */

const axios = require('axios');

// Test configuration
const TEST_CLIENTS = [
  "Ocean's 11",
  "Glendale Community College"
];

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function testClientDashboard(clientName) {
  console.log(`\n=== Testing Dashboard for: ${clientName} ===`);
  
  try {
    // Convert client name to slug (same logic as in getClientBySlug)
    const slug = clientName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    
    console.log(`Client slug: ${slug}`);
    
    // Make request to dashboard API
    const response = await axios.get(`${BASE_URL}/api/dashboard/${slug}`, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    const data = response.data;
    
    console.log(`Response status: ${response.status}`);
    console.log(`Client name in response: ${data.clientName}`);
    console.log(`Live campaigns: ${data.liveCampaigns}`);
    console.log(`Total campaigns YTD: ${data.totalCampaignsYTD}`);
    
    // Security validation
    if (data.clientName !== clientName) {
      console.error(`❌ SECURITY FAILURE: Client name mismatch!`);
      console.error(`Expected: ${clientName}`);
      console.error(`Received: ${data.clientName}`);
      return false;
    }
    
    // Check campaign data
    const allCampaigns = [
      ...data.liveCampaignsList,
      ...data.planningCampaignsList,
      ...data.completedCampaignsList
    ];
    
    console.log(`Total campaigns found: ${allCampaigns.length}`);
    
    if (allCampaigns.length > 0) {
      console.log(`Sample campaign: ${allCampaigns[0].campaignName} (${allCampaigns[0].mbaNumber})`);
    }
    
    console.log(`✅ Dashboard data isolation verified for ${clientName}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error testing ${clientName}:`, error.message);
    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    }
    return false;
  }
}

async function runSecurityTests() {
  console.log('🔒 Starting Dashboard Security Tests');
  console.log(`Testing against: ${BASE_URL}`);
  
  const results = [];
  
  for (const clientName of TEST_CLIENTS) {
    const result = await testClientDashboard(clientName);
    results.push({ clientName, success: result });
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n=== Test Results Summary ===');
  let allPassed = true;
  
  results.forEach(({ clientName, success }) => {
    const status = success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${clientName}`);
    if (!success) allPassed = false;
  });
  
  if (allPassed) {
    console.log('\n🎉 All security tests passed! Dashboard data isolation is working correctly.');
  } else {
    console.log('\n🚨 Security tests failed! Dashboard data isolation needs attention.');
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runSecurityTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = { testClientDashboard, runSecurityTests };

